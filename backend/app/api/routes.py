import asyncio
from datetime import datetime, timezone
import json
import logging
from typing import Any, AsyncGenerator, Optional
import uuid

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from langgraph.types import Command
from pydantic import BaseModel, Field

from app.db.sqlite import create_debate, get_debate, list_debates, update_debate
from app.graph.workflow import create_debate_graph, get_checkpointer

logger = logging.getLogger("crossexam.api")
router = APIRouter(prefix="/api/debates", tags=["debates"])


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
    max_rounds: int = Field(default=2, ge=1, le=4, description="Max debate rounds")


class InterveneRequest(BaseModel):
    human_context: str = Field(
        ..., min_length=2, description="Clarifying context or expert evidence"
    )


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
    config = {"configurable": {"thread_id": thread_id}}

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
                        "raw_claim": claim,
                        "sub_claims": [],
                        "round": 1,
                        "max_rounds": 2,
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
                    await update_debate(
                        thread_id,
                        status="paused",
                        report_json={
                            "reason": interrupt_val.get("reason"),
                            "confidence": interrupt_val.get("confidence"),
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
                    if node_name == "decomposer_node":
                        yield format_sse("sub_claims", {
                            "sub_claims": updates.get("sub_claims", []),
                            "token_usage": updates.get("token_usage", 0),
                        })

                    elif node_name == "proponent_node":
                        args = updates.get("proponent_args", [])
                        if args:
                            arg = args[-1]
                            yield format_sse("tool_call", {
                                "role": "proponent",
                                "query": arg.get("search_query", ""),
                                "round": arg.get("round", 1),
                                "model": arg.get("model", ""),
                            })
                            yield format_sse("argument", {**arg})

                    elif node_name == "skeptic_node":
                        args = updates.get("skeptic_args", [])
                        if args:
                            arg = args[-1]
                            yield format_sse("tool_call", {
                                "role": "skeptic",
                                "query": arg.get("search_query", ""),
                                "round": arg.get("round", 1),
                                "model": arg.get("model", ""),
                            })
                            yield format_sse("argument", {**arg})

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
                        })

            # Check if execution finished without interrupt
            if not has_interrupted:
                final_state = await graph.aget_state(config)
                values = final_state.values if final_state else {}
                verdict_obj = values.get("verdict") or {}
                total_tokens = values.get("token_usage", 0)

                verdict_str = verdict_obj.get("verdict", "MIXED")
                conf_val = verdict_obj.get("confidence", 0.5)

                full_report = {
                    "raw_claim": claim,
                    "sub_claims": values.get("sub_claims", []),
                    "verdict": verdict_str,
                    "confidence": conf_val,
                    "summary": verdict_obj.get("summary", ""),
                    "claim_breakdown": verdict_obj.get("claim_breakdown", []),
                    "citation_audit": verdict_obj.get("citation_audit", []),
                    "proponent_args": values.get("proponent_args", []),
                    "skeptic_args": values.get("skeptic_args", []),
                    "evidence_urls": values.get("evidence_urls", []),
                    "human_context": values.get("human_context"),
                    "total_tokens": total_tokens,
                }

                await update_debate(
                    thread_id,
                    status="completed",
                    verdict=verdict_str,
                    confidence=conf_val,
                    total_tokens=total_tokens,
                    report_json=full_report,
                )

                yield format_sse("final_verdict", {
                    "thread_id": thread_id,
                    "verdict": verdict_str,
                    "confidence": conf_val,
                    "summary": verdict_obj.get("summary", ""),
                    "claim_breakdown": verdict_obj.get("claim_breakdown", []),
                    "citation_audit": verdict_obj.get("citation_audit", []),
                    "total_tokens": total_tokens,
                    "timestamp": _iso(),
                })

        except Exception as exc:
            logger.exception("Pipeline streaming failed for thread %s: %s", thread_id, exc)
            err_msg = str(exc)
            await update_debate(thread_id, status="error", report_json={"error": err_msg})
            yield format_sse("error", {"message": err_msg, "timestamp": _iso()})


# ==========================================
# Endpoints
# ==========================================

@router.post("", status_code=201)
async def create_debate_endpoint(payload: CreateDebateRequest) -> dict[str, Any]:
    """Create a new debate session and initialize SQLite state."""
    thread_id = str(uuid.uuid4())
    record = await create_debate(thread_id=thread_id, claim=payload.claim.strip())
    return {
        "thread_id": thread_id,
        "claim": record["claim"],
        "status": record["status"],
        "max_rounds": payload.max_rounds,
        "created_at": record["created_at"],
    }


@router.get("")
async def list_debates_endpoint(
    limit: int = Query(default=50, ge=1, le=100)
) -> list[dict[str, Any]]:
    """Fetch recent debates for the history sidebar."""
    return await list_debates(limit=limit)


@router.get("/{thread_id}")
async def get_debate_endpoint(thread_id: str) -> dict[str, Any]:
    """Fetch full debate report and state by thread_id."""
    debate = await get_debate(thread_id)
    if not debate:
        raise HTTPException(status_code=404, detail="Debate not found")
    return debate


@router.get("/{thread_id}/stream")
async def stream_debate_endpoint(thread_id: str) -> StreamingResponse:
    """Stream real-time SSE events for a debate execution."""
    debate = await get_debate(thread_id)
    if not debate:
        raise HTTPException(status_code=404, detail="Debate not found")

    return StreamingResponse(
        debate_event_stream(thread_id=thread_id),
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
) -> StreamingResponse:
    """Resume a paused debate with human clarifying context and stream re-evaluation SSE."""
    debate = await get_debate(thread_id)
    if not debate:
        raise HTTPException(status_code=404, detail="Debate not found")

    return StreamingResponse(
        debate_event_stream(thread_id=thread_id, resume_context=payload.human_context.strip()),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
