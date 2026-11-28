import asyncio
from datetime import datetime, timezone
import json
import logging
from typing import Any, AsyncGenerator, Literal, Optional
import uuid

from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from langchain_groq import ChatGroq
from langgraph.types import Command
from pydantic import BaseModel, Field

from app.config import resolve_api_key, settings
from app.db.sqlite import create_debate, get_debate, list_debates, update_debate
from app.graph.nodes import clamp_temperature, reset_request_context, set_request_context
from app.graph.workflow import create_debate_graph, get_checkpointer

logger = logging.getLogger("crossexam.api")
router = APIRouter(prefix="/api/debates", tags=["debates"])
config_router = APIRouter(prefix="/api", tags=["config"])


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def format_sse(event: str, data: Any) -> str:
    """Format data into standard Server-Sent Events text."""
    payload = json.dumps(data) if not isinstance(data, str) else data
    return f"event: {event}\ndata: {payload}\n\n"


# ==========================================
# Request / Response Schemas
# ==========================================

class CreateDebateRequest(BaseModel):
    claim: str = Field(..., min_length=3, description="Core claim to fact-check")
    max_rounds: int = Field(default=3, ge=1, le=4, description="Max debate rounds")
    mode: Literal["general", "scientific", "financial", "security"] = Field(
        default="general", description="Domain jury framing mode"
    )


class InterveneRequest(BaseModel):
    human_context: str = Field(
        ..., min_length=2, description="Clarifying context or expert evidence"
    )


class ValidateKeyRequest(BaseModel):
    api_key: str = Field(..., min_length=1, description="User-provided API key to validate")
    provider: Literal["groq"] = Field(default="groq", description="LLM provider")


def _resolve_models(
    model_preset: Optional[str] = None,
    models_raw: Optional[str | dict[str, str]] = None,
) -> Optional[dict[str, str]]:
    """Resolve per-request model overrides from custom dict/JSON or preset tier."""
    presets = settings.get_model_presets()
    if models_raw:
        parsed: Optional[dict[str, Any]] = None
        if isinstance(models_raw, dict):
            parsed = models_raw
        elif isinstance(models_raw, str):
            try:
                loaded = json.loads(models_raw)
                if isinstance(loaded, dict):
                    parsed = loaded
            except json.JSONDecodeError:
                parsed = None
        if parsed:
            allowed_slots = {"guard", "decomposer", "proponent", "skeptic", "judge"}
            cleaned = {
                k: v.strip()
                for k, v in parsed.items()
                if k in allowed_slots and isinstance(v, str) and v.strip()
            }
            if cleaned:
                return cleaned
    if model_preset and model_preset in presets:
        return presets[model_preset]
    return None


class DebateSummary(BaseModel):
    thread_id: str
    claim: str
    status: str
    verdict: Optional[str] = None
    confidence: Optional[float] = None
    total_tokens: int = 0
    created_at: str
    updated_at: str


# ==========================================
# SSE Generator Core
# ==========================================

async def debate_event_stream(
    thread_id: str,
    resume_context: Optional[str] = None,
    api_key: Optional[str] = None,
    models: Optional[dict[str, str]] = None,
    temperature: Optional[float] = None,
) -> AsyncGenerator[str, None]:
    """Execute or resume the LangGraph debate pipeline and yield SSE events."""
    debate_record = await get_debate(thread_id)
    if not debate_record:
        yield format_sse("error", {"message": f"Debate {thread_id} not found."})
        return

    # If already completed and not resuming, yield final verdict and exit
    if debate_record.get("status") == "completed" and not resume_context:
        report = debate_record.get("report") or {}
        yield format_sse("final_verdict", {
            "thread_id": thread_id,
            "verdict": debate_record.get("verdict"),
            "confidence": debate_record.get("confidence"),
            "summary": report.get("summary", ""),
            "claim_breakdown": report.get("claim_breakdown", []),
            "citation_audit": report.get("citation_audit", []),
            "total_tokens": debate_record.get("total_tokens", 0),
            "cached": True,
        })
        return

    claim = debate_record.get("claim", "")
    configured_max_rounds = int(debate_record.get("max_rounds") or 3)
    configured_mode = str(debate_record.get("mode") or "general")
    config = {"configurable": {"thread_id": thread_id}}

    try:
        resolved_key = resolve_api_key(api_key)
    except RuntimeError as key_err:
        err_msg = str(key_err)
        await update_debate(thread_id, status="error", report_json={"error": err_msg})
        yield format_sse("error", {"message": err_msg, "timestamp": _iso()})
        return

    ctx_tokens = set_request_context(api_key=resolved_key, models=models, temperature=temperature)
    try:
        async with get_checkpointer() as checkpointer:
            graph = create_debate_graph().compile(checkpointer=checkpointer)

            try:
                if resume_context is not None:
                    # Resuming paused debate via HITL Command
                    await update_debate(thread_id, status="running")
                    yield format_sse("node_start", {
                        "node": "hitl_resumed",
                        "timestamp": _iso(),
                        "message": "Human intervention submitted. Rescoring claim...",
                    })
                    stream_input: Any = Command(resume=resume_context)
                else:
                    # Fresh run initialization
                    current_state = await graph.aget_state(config)
                    if current_state and current_state.values.get("raw_claim"):
                        # Existing state present (e.g. paused)
                        stream_input = None
                    else:
                        initial_state = {
                            "thread_id": thread_id,
                            "raw_claim": claim,
                            "mode": configured_mode,
                            "sub_claims": [],
                            "round": 1,
                            "max_rounds": configured_max_rounds,
                            "proponent_args": [],
                            "skeptic_args": [],
                            "evidence_urls": [],
                            "human_context": None,
                            "verdict": None,
                            "token_usage": 0,
                            "guard_flagged": False,
                            "rescored": False,
                        }
                        stream_input = initial_state
                        yield format_sse("node_start", {"node": "guard_node", "round": 1, "timestamp": _iso()})

                has_interrupted = False

                # Stream updates chunk by chunk
                async for chunk in graph.astream(stream_input, config=config, stream_mode="updates"):
                    # Check for interruption
                    if "__interrupt__" in chunk:
                        has_interrupted = True
                        interrupt_val = chunk["__interrupt__"][0].value
                        paused_state = await graph.aget_state(config)
                        p_vals = paused_state.values if paused_state else {}
                        p_verdict = p_vals.get("verdict") or {}
                        p_tokens = p_vals.get("token_usage", 0)
                        await update_debate(
                            thread_id,
                            status="paused",
                            verdict=p_verdict.get("verdict"),
                            confidence=interrupt_val.get("confidence", p_verdict.get("confidence")),
                            total_tokens=p_tokens,
                            report_json={
                                "raw_claim": claim,
                                "mode": configured_mode,
                                "sub_claims": p_vals.get("sub_claims", []),
                                "verdict": p_verdict.get("verdict"),
                                "confidence": interrupt_val.get("confidence", p_verdict.get("confidence")),
                                "summary": p_verdict.get("summary", interrupt_val.get("summary", "")),
                                "claim_breakdown": p_verdict.get("claim_breakdown", []),
                                "citation_audit": p_verdict.get("citation_audit", []),
                                "proponent_args": p_vals.get("proponent_args", []),
                                "skeptic_args": p_vals.get("skeptic_args", []),
                                "evidence_urls": p_vals.get("evidence_urls", []),
                                "total_tokens": p_tokens,
                                "reason": interrupt_val.get("reason"),
                                "question": interrupt_val.get("question"),
                            },
                        )
                        yield format_sse("interrupt", {
                            "thread_id": thread_id,
                            "reason": interrupt_val.get("reason"),
                            "confidence": interrupt_val.get("confidence"),
                            "question": interrupt_val.get("question"),
                            "summary": interrupt_val.get("summary", ""),
                            "timestamp": _iso(),
                        })
                        break

                    for node_name, updates in chunk.items():
                        yield format_sse("node_start", {
                            "node": node_name,
                            "timestamp": _iso(),
                        })

                        # Emit specific domain events based on node output
                        if node_name == "guard_node" and updates.get("guard_flagged"):
                            yield format_sse("guard_alert", {
                                "message": "Potential prompt injection detected. Fast rejection triggered.",
                                "timestamp": _iso(),
                            })

                        elif node_name == "decomposer_node":
                            yield format_sse("sub_claims", {
                                "sub_claims": updates.get("sub_claims", []),
                                "token_usage": updates.get("token_usage", 0),
                            })

                        elif node_name in ("proponent_node", "skeptic_node"):
                            role_key = "proponent_args" if node_name == "proponent_node" else "skeptic_args"
                            role_name = "proponent" if node_name == "proponent_node" else "skeptic"
                            args = updates.get(role_key, [])
                            if args:
                                arg = args[-1]
                                yield format_sse("tool_call", {
                                    "role": role_name,
                                    "query": arg.get("search_query", ""),
                                    "round": arg.get("round", 1),
                                    "model": arg.get("model", ""),
                                })
                                yield format_sse("argument", {
                                    **arg,
                                    "evidence": updates.get("evidence_urls", []),
                                    "token_usage": updates.get("token_usage", 0),
                                })

                        elif node_name == "moderator_node":
                            yield format_sse("round_complete", {
                                "round": updates.get("round", 1) - 1,
                                "timestamp": _iso(),
                            })

                        elif node_name == "judge_node":
                            verdict = updates.get("verdict", {})
                            yield format_sse("verdict_preview", {
                                "verdict": verdict.get("verdict"),
                                "confidence": verdict.get("confidence"),
                                "token_usage": updates.get("token_usage", 0),
                            })

                # Check if execution finished without interrupt
                if not has_interrupted:
                    final_state = await graph.aget_state(config)
                    values = final_state.values if final_state else {}
                    verdict_obj = values.get("verdict") or {}
                    total_tokens = values.get("token_usage", 0)

                    verdict_str = verdict_obj.get("verdict", "MIXED")
                    conf_val = verdict_obj.get("confidence", 0.5)

                    yield format_sse("final_verdict", {
                        "thread_id": thread_id,
                        "verdict": verdict_str,
                        "confidence": conf_val,
                        "summary": verdict_obj.get("summary", ""),
                        "claim_breakdown": verdict_obj.get("claim_breakdown", []),
                        "citation_audit": verdict_obj.get("citation_audit", []),
                        "total_tokens": total_tokens,
                        "mode": configured_mode,
                        "timestamp": _iso(),
                    })

            except Exception as exc:
                logger.exception("Pipeline streaming failed for thread %s: %s", thread_id, exc)
                err_msg = str(exc)
                await update_debate(thread_id, status="error", report_json={"error": err_msg})
                yield format_sse("error", {"message": err_msg, "timestamp": _iso()})
    finally:
        reset_request_context(ctx_tokens)


# ==========================================
# Config & BYOAK Validation Endpoints
# ==========================================

@config_router.get("/config")
async def get_config_endpoint() -> dict[str, Any]:
    """Expose non-sensitive server configuration so UI knows if BYOAK is needed."""
    return {
        "server_key_configured": settings.server_key_configured,
        "default_models": {
            "guard": settings.GROQ_GUARD_MODEL,
            "decomposer": settings.GROQ_DECOMPOSER_MODEL,
            "proponent": settings.GROQ_PROPONENT_MODEL,
            "skeptic": settings.GROQ_SKEPTIC_MODEL,
            "judge": settings.GROQ_JUDGE_MODEL,
        },
        "model_presets": settings.get_model_presets(),
    }


@config_router.post("/validate-key")
async def validate_key_endpoint(payload: ValidateKeyRequest) -> dict[str, Any]:
    """Validate a user-supplied Groq API key in-memory with a minimal 1-token ping."""
    candidate = payload.api_key.strip()
    if not candidate or candidate.startswith("your_groq_api_key"):
        return {"valid": False, "error": "API key cannot be empty or a placeholder."}

    try:
        llm = ChatGroq(
            model="llama-3.1-8b-instant",
            api_key=candidate,
            temperature=0.0,
            max_tokens=1,
        )
        await llm.ainvoke([HumanMessage(content="ping")])
        return {"valid": True}
    except Exception as exc:
        err_text = str(exc)
        if "401" in err_text or "invalid_api_key" in err_text.lower() or "authentication" in err_text.lower():
            return {"valid": False, "error": "Invalid Groq API key (401 Unauthorized)."}
        return {"valid": False, "error": f"Key check failed: {err_text[:160]}"}


# ==========================================
# Debate Endpoints
# ==========================================

@router.post("", status_code=201)
async def create_debate_endpoint(
    payload: CreateDebateRequest,
    x_session_id: Optional[str] = Header(default=None, alias="X-Session-ID"),
) -> dict[str, Any]:
    """Create a new debate session and initialize SQLite state (no API keys stored)."""
    thread_id = str(uuid.uuid4())
    record = await create_debate(
        thread_id=thread_id,
        claim=payload.claim.strip(),
        max_rounds=payload.max_rounds,
        mode=payload.mode,
        session_id=x_session_id.strip() if x_session_id and x_session_id.strip() else None,
    )
    return {
        "thread_id": thread_id,
        "claim": record["claim"],
        "status": record["status"],
        "max_rounds": payload.max_rounds,
        "mode": payload.mode,
        "created_at": record["created_at"],
    }


@router.get("")
async def list_debates_endpoint(
    limit: int = Query(default=50, ge=1, le=100),
    x_session_id: Optional[str] = Header(default=None, alias="X-Session-ID"),
) -> list[dict[str, Any]]:
    """Fetch recent debates for the history sidebar, scoped by X-Session-ID when provided."""
    session_id = x_session_id.strip() if x_session_id and x_session_id.strip() else None
    return await list_debates(limit=limit, session_id=session_id)


@router.get("/{thread_id}")
async def get_debate_endpoint(thread_id: str) -> dict[str, Any]:
    """Fetch full debate report and state by thread_id."""
    debate = await get_debate(thread_id)
    if not debate:
        raise HTTPException(status_code=404, detail="Debate not found")
    return debate


@router.get("/{thread_id}/stream")
async def stream_debate_endpoint(
    thread_id: str,
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
    x_model_preset: Optional[str] = Header(default=None, alias="X-Model-Preset"),
    x_models: Optional[str] = Header(default=None, alias="X-Models"),
    x_temperature: Optional[str] = Header(default=None, alias="X-Temperature"),
) -> StreamingResponse:
    """Stream real-time SSE events for a debate execution."""
    debate = await get_debate(thread_id)
    if not debate:
        raise HTTPException(status_code=404, detail="Debate not found")

    resolved_models = _resolve_models(model_preset=x_model_preset, models_raw=x_models)
    try:
        resolved_temp = clamp_temperature(float(x_temperature)) if x_temperature is not None else None
    except ValueError:
        resolved_temp = None
    return StreamingResponse(
        debate_event_stream(
            thread_id=thread_id,
            api_key=x_api_key,
            models=resolved_models,
            temperature=resolved_temp,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{thread_id}/intervene")
async def intervene_debate_endpoint(
    thread_id: str,
    payload: InterveneRequest,
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
    x_model_preset: Optional[str] = Header(default=None, alias="X-Model-Preset"),
    x_models: Optional[str] = Header(default=None, alias="X-Models"),
    x_temperature: Optional[str] = Header(default=None, alias="X-Temperature"),
) -> StreamingResponse:
    """Resume a paused debate with human clarifying context and stream re-evaluation SSE."""
    debate = await get_debate(thread_id)
    if not debate:
        raise HTTPException(status_code=404, detail="Debate not found")

    resolved_models = _resolve_models(model_preset=x_model_preset, models_raw=x_models)
    try:
        resolved_temp = clamp_temperature(float(x_temperature)) if x_temperature is not None else None
    except ValueError:
        resolved_temp = None
    return StreamingResponse(
        debate_event_stream(
            thread_id=thread_id,
            resume_context=payload.human_context.strip(),
            api_key=x_api_key,
            models=resolved_models,
            temperature=resolved_temp,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
