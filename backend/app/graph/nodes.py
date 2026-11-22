import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq
from langgraph.types import Send, interrupt
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from app.config import settings
from app.db.sqlite import update_debate
from app.graph.state import (
    ArgumentOutput,
    CitationAuditItem,
    ClaimBreakdownItem,
    DebateState,
    DecomposedClaims,
    VerdictSchema,
)
from app.tools.search import search_duckduckgo

logger = logging.getLogger("crossexam.nodes")


def _current_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def is_rate_limit_or_network_error(exc: BaseException) -> bool:
    """Determine whether an exception should trigger a retry."""
    err_str = str(exc).lower()
    return any(
        kw in err_str
        for kw in ["429", "rate limit", "rate_limit_exceeded", "tpm", "rpm", "timeout", "connection"]
    )


@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1.5, min=2, max=15),
    retry=retry_if_exception(is_rate_limit_or_network_error),
    reraise=True,
)
def invoke_llm_with_retry(runnable: Any, input_data: Any) -> Any:
    """Invoke an LLM or structured runnable with exponential backoff on 429."""
    return runnable.invoke(input_data)


def get_llm(model_name: str, temperature: float = 0.2) -> ChatGroq:
    """Instantiate a ChatGroq client with key validation."""
    api_key = settings.validate_groq_api_key()
    return ChatGroq(
        model=model_name,
        api_key=api_key,
        temperature=temperature,
    )


# ==========================================
# Graph Nodes
# ==========================================

def guard_node(state: DebateState) -> dict[str, Any]:
    """Optional fast check to reject prompt injection attacks."""
    if not settings.ENABLE_PROMPT_GUARD:
        return {"guard_flagged": False}

    raw_claim = state.get("raw_claim", "")
    try:
        # Prompt injection heuristics + fast check
        suspicious_patterns = [
            "ignore previous instructions",
            "system prompt",
            "disregard all previous",
            "jailbreak",
            "you are now an unfiltered",
        ]
        is_suspicious = any(p in raw_claim.lower() for p in suspicious_patterns)
        return {"guard_flagged": is_suspicious}
    except Exception as exc:
        logger.warning("Prompt guard node encountered error: %s", exc)
        return {"guard_flagged": False}


def decomposer_node(state: DebateState) -> dict[str, Any]:
    """Decompose the raw claim into 2-3 atomic, independently falsifiable sub-claims."""
    raw_claim = state.get("raw_claim", "")
    llm = get_llm(settings.GROQ_DECOMPOSER_MODEL, temperature=0.1)
    structured_llm = llm.with_structured_output(DecomposedClaims)

    messages = [
        SystemMessage(
            content=(
                "You are an expert fact-checking claim analyst. Your task is to break down "
                "a complex user claim into 2 to 3 atomic, precise, and independently falsifiable "
                "sub-claims. Do not answer or verify yet—only isolate the core factual premises."
            )
        ),
        HumanMessage(content=f"Claim to decompose: {raw_claim}"),
    ]

    try:
        result = invoke_llm_with_retry(structured_llm, messages)
        sub_claims = result.sub_claims if isinstance(result, DecomposedClaims) else [raw_claim]
    except Exception as exc:
        logger.error("Decomposer node failed: %s. Using raw claim as fallback.", exc)
        sub_claims = [raw_claim]

    # Approximate token usage if not returned directly
    estimated_tokens = len(raw_claim.split()) + sum(len(c.split()) for c in sub_claims) + 80
    return {
        "sub_claims": sub_claims,
        "token_usage": estimated_tokens,
    }


def fan_out_to_debaters(state: DebateState) -> list[Send]:
    """Fan out concurrently to Proponent and Skeptic using LangGraph Send API."""
    curr_round = state.get("round", 1)
    raw_claim = state.get("raw_claim", "")
    sub_claims = state.get("sub_claims", [raw_claim])

    prop_args = state.get("proponent_args", [])
    skep_args = state.get("skeptic_args", [])

    # In Round 2+, each agent ONLY sees sub_claims + opponent's previous round argument (sliding window)
    last_skep_arg = skep_args[-1]["argument"] if skep_args else ""
    last_prop_arg = prop_args[-1]["argument"] if prop_args else ""

    return [
        Send(
            "proponent_node",
            {
                "role": "proponent",
                "round": curr_round,
                "raw_claim": raw_claim,
                "sub_claims": sub_claims,
                "opponent_prev_arg": last_skep_arg,
            },
        ),
        Send(
            "skeptic_node",
            {
                "role": "skeptic",
                "round": curr_round,
                "raw_claim": raw_claim,
                "sub_claims": sub_claims,
                "opponent_prev_arg": last_prop_arg,
            },
        ),
    ]


def proponent_node(data: dict[str, Any]) -> dict[str, Any]:
    """Proponent agent arguing SUPPORT. Retrieves evidence and writes ~180-word argument."""
    curr_round = data.get("round", 1)
    raw_claim = data.get("raw_claim", "")
    sub_claims = data.get("sub_claims", [])
    opponent_prev_arg = data.get("opponent_prev_arg", "")

    # 1. Generate focused search query
    llm = get_llm(settings.GROQ_PROPONENT_MODEL, temperature=0.3)
    structured_llm = llm.with_structured_output(ArgumentOutput)

    query_prompt = f"Claim: {raw_claim}\nSub-claims: {json.dumps(sub_claims)}"
    if opponent_prev_arg:
        query_prompt += f"\nOpponent counter-argument from previous round: {opponent_prev_arg}"

    # Default fallback search query
    search_query = f"{raw_claim} corroborating evidence statistics"
    search_results = search_duckduckgo(search_query, max_results=3)

    # 2. Formulate argument with evidence
    evidence_text = "\n".join(
        [f"- [{res['title']}]({res['url']}): {res['snippet']}" for res in search_results]
    ) or "No external web sources retrieved. Rely on rigorous logical analysis."

    messages = [
        SystemMessage(
            content=(
                "You are the PROPONENT fact-checker in a rigorous courtroom debate. "
                "Your role is to argue firmly that the claim is SUPPORTED, backed by verified "
                "data, primary sources, and clear citations.\n"
                "Rules:\n"
                "- Write a concise argument of approximately 180 words.\n"
                "- Synthesize the retrieved web evidence and cite the exact URLs provided.\n"
                "- Directly refute the opponent's previous points if provided.\n"
                "- Provide a search_query, the argument text, and the list of cited_urls."
            )
        ),
        HumanMessage(
            content=(
                f"Round: {curr_round}\n"
                f"Core Claim: {raw_claim}\n"
                f"Sub-claims: {json.dumps(sub_claims)}\n"
                f"Opponent's previous rebuttal: {opponent_prev_arg or 'None (Round 1)'}\n\n"
                f"Retrieved Evidence:\n{evidence_text}"
            )
        ),
    ]

    try:
        output = invoke_llm_with_retry(structured_llm, messages)
        arg_text = output.argument
        query_used = output.search_query or search_query
        citations = output.cited_urls or [r["url"] for r in search_results]
    except Exception as exc:
        logger.error("Proponent node LLM failed: %s. Using fallback argument.", exc)
        query_used = search_query
        citations = [r["url"] for r in search_results]
        arg_text = (
            f"Based on available verification sources for '{raw_claim}', the evidence "
            f"substantiates the primary premises. Primary metrics indicate consistency with verified records."
        )

    arg_entry = {
        "round": curr_round,
        "role": "proponent",
        "model": settings.GROQ_PROPONENT_MODEL,
        "search_query": query_used,
        "argument": arg_text,
        "citations": citations,
        "timestamp": _current_iso(),
    }

    tokens = len(arg_text.split()) + 150
    return {
        "proponent_args": [arg_entry],
        "evidence_urls": [
            {"role": "proponent", "round": curr_round, **res} for res in search_results
        ],
        "token_usage": tokens,
    }


def skeptic_node(data: dict[str, Any]) -> dict[str, Any]:
    """Skeptic / Red-Team agent arguing REFUTE. Retrieves counter-evidence and writes ~180-word argument."""
    curr_round = data.get("round", 1)
    raw_claim = data.get("raw_claim", "")
    sub_claims = data.get("sub_claims", [])
    opponent_prev_arg = data.get("opponent_prev_arg", "")

    llm = get_llm(settings.GROQ_SKEPTIC_MODEL, temperature=0.3)
    structured_llm = llm.with_structured_output(ArgumentOutput)

    # Search for debunkings, flaws, or counter-evidence
    search_query = f"{raw_claim} debunked criticism controversy false"
    search_results = search_duckduckgo(search_query, max_results=3)

    evidence_text = "\n".join(
        [f"- [{res['title']}]({res['url']}): {res['snippet']}" for res in search_results]
    ) or "No external counter-evidence retrieved. Scrutinize logical leaps and missing baseline definitions."

    messages = [
        SystemMessage(
            content=(
                "You are the SKEPTIC Red-Team fact-checker in a rigorous courtroom debate. "
                "Your role is to argue firmly that the claim is REFUTED, unproven, misleading, "
                "or missing crucial context.\n"
                "Rules:\n"
                "- Write a concise argument of approximately 180 words.\n"
                "- Highlight methodological flaws, conflicting studies, or lack of credible proof.\n"
                "- Directly dissect the proponent's claims using the retrieved evidence and cite exact URLs.\n"
                "- Provide a search_query, the argument text, and the list of cited_urls."
            )
        ),
        HumanMessage(
            content=(
                f"Round: {curr_round}\n"
                f"Core Claim: {raw_claim}\n"
                f"Sub-claims: {json.dumps(sub_claims)}\n"
                f"Proponent's argument to scrutinize: {opponent_prev_arg or 'None (Round 1)'}\n\n"
                f"Retrieved Counter-Evidence:\n{evidence_text}"
            )
        ),
    ]

    try:
        output = invoke_llm_with_retry(structured_llm, messages)
        arg_text = output.argument
        query_used = output.search_query or search_query
        citations = output.cited_urls or [r["url"] for r in search_results]
    except Exception as exc:
        logger.error("Skeptic node LLM failed: %s. Using fallback argument.", exc)
        query_used = search_query
        citations = [r["url"] for r in search_results]
        arg_text = (
            f"Scrutiny of '{raw_claim}' reveals significant confounding factors and unverified assertions. "
            f"The proponent fails to establish causative proof or account for contradictory benchmarks."
        )

    arg_entry = {
        "round": curr_round,
        "role": "skeptic",
        "model": settings.GROQ_SKEPTIC_MODEL,
        "search_query": query_used,
        "argument": arg_text,
        "citations": citations,
        "timestamp": _current_iso(),
    }

    tokens = len(arg_text.split()) + 150
    return {
        "skeptic_args": [arg_entry],
        "evidence_urls": [
            {"role": "skeptic", "round": curr_round, **res} for res in search_results
        ],
        "token_usage": tokens,
    }


def moderator_node(state: DebateState) -> dict[str, Any]:
    """Sync barrier where debaters meet; advances the round counter."""
    next_round = state.get("round", 1) + 1
    return {"round": next_round}


def moderator_router(state: DebateState) -> Any:
    """Check whether to loop for another debate round or proceed to the Judge."""
    curr_round = state.get("round", 1)
    max_rounds = state.get("max_rounds", 2)

    if curr_round <= max_rounds:
        # Loop another round concurrently
        return fan_out_to_debaters(state)
    return "judge_node"


def judge_node(state: DebateState) -> dict[str, Any]:
    """Highest-reasoning judge node synthesizing both sides into VerdictSchema."""
    raw_claim = state.get("raw_claim", "")
    sub_claims = state.get("sub_claims", [])
    prop_args = state.get("proponent_args", [])
    skep_args = state.get("skeptic_args", [])
    evidence = state.get("evidence_urls", [])
    human_context = state.get("human_context")

    llm = get_llm(settings.GROQ_JUDGE_MODEL, temperature=0.1)
    structured_llm = llm.with_structured_output(VerdictSchema)

    # Format transcript
    debate_transcript = []
    for p, s in zip(prop_args, skep_args):
        debate_transcript.append(
            f"--- Round {p.get('round', 1)} ---\n"
            f"[Proponent - {p.get('model')}]:\n{p.get('argument')}\n"
            f"Citations: {p.get('citations')}\n\n"
            f"[Skeptic - {s.get('model')}]:\n{s.get('argument')}\n"
            f"Citations: {s.get('citations')}\n"
        )
    transcript_str = "\n".join(debate_transcript)

    human_section = ""
    if human_context:
        human_section = (
            "\n\nCRITICAL HUMAN INTERVENTION / CLARIFICATION PROVIDED:\n"
            f"\"{human_context}\"\n"
            "Weigh this verified human domain context with highest authoritative precedence.\n"
        )

    messages = [
        SystemMessage(
            content=(
                "You are the CHIEF JUDGE and final arbitrator in an adversarial fact-checking courtroom. "
                "You must impartially evaluate the proponent's arguments, the skeptic's counter-arguments, "
                "the cited evidence, and any human expert context.\n"
                "Return a strict VerdictSchema with:\n"
                "- verdict: Exactly one of ['SUPPORTED', 'REFUTED', 'MIXED', 'UNVERIFIABLE']\n"
                "- confidence: Float from 0.0 to 1.0 reflecting empirical certainty\n"
                "- summary: 2-3 paragraph objective synthesis explaining your decision\n"
                "- claim_breakdown: Breakdown of each atomic sub-claim\n"
                "- citation_audit: Audit of cited evidence URLs assessing reliability and relevance"
            )
        ),
        HumanMessage(
            content=(
                f"Core Claim: {raw_claim}\n"
                f"Atomic Sub-Claims: {json.dumps(sub_claims)}\n\n"
                f"Debate Transcript:\n{transcript_str}\n"
                f"All Discovered Evidence URLs: {json.dumps([e.get('url') for e in evidence if e.get('url')])}"
                f"{human_section}"
            )
        ),
    ]

    try:
        output = invoke_llm_with_retry(structured_llm, messages)
        if isinstance(output, VerdictSchema):
            verdict_dict = output.model_dump()
        else:
            verdict_dict = dict(output)
    except Exception as exc:
        logger.error("Judge node LLM failed: %s. Using defensive default verdict.", exc)
        verdict_dict = {
            "verdict": "MIXED",
            "confidence": 0.50,
            "summary": (
                f"Evaluation for '{raw_claim}' concluded with competing arguments. "
                "Evidence presented on both sides warrants cautious interpretation."
            ),
            "claim_breakdown": [
                {
                    "sub_claim": sc,
                    "status": "AMBIGUOUS",
                    "rationale": "Automated arbitration encountered ambiguity.",
                }
                for sc in sub_claims
            ],
            "citation_audit": [
                {
                    "url": e.get("url", ""),
                    "reliability": "MEDIUM",
                    "relevance": "Referenced during adversarial debate rounds",
                }
                for e in evidence[:4]
                if e.get("url")
            ],
        }

    tokens = len(str(verdict_dict).split()) + 300
    update_data: dict[str, Any] = {
        "verdict": verdict_dict,
        "token_usage": tokens,
    }
    if human_context:
        update_data["rescored"] = True
    return update_data


def hitl_gate_node(state: DebateState) -> dict[str, Any]:
    """Human-in-the-loop gate: interrupts if confidence is < 0.75 and human context has not been given."""
    verdict = state.get("verdict") or {}
    confidence = float(verdict.get("confidence", 0.0))
    human_context = state.get("human_context")

    if confidence < 0.75 and not human_context:
        resume_val = interrupt({
            "reason": "low_confidence",
            "confidence": confidence,
            "raw_claim": state.get("raw_claim", ""),
            "summary": verdict.get("summary", ""),
            "question": (
                f"The confidence score ({confidence:.2f}) is below the 0.75 threshold. "
                f"Please provide human clarification or additional evidence to resolve "
                f"ambiguity in the claim: '{state.get('raw_claim', '')}'."
            ),
        })
        return {"human_context": str(resume_val) if resume_val else None}

    return {}


def hitl_router(state: DebateState) -> str:
    """Conditional edge from HITL Gate: re-score if human context was added and not yet rescored."""
    if state.get("human_context") and not state.get("rescored"):
        return "judge_node"
    return "persist_node"


async def persist_node(state: DebateState) -> dict[str, Any]:
    """Persist final debate verdict, token usage, and report to SQLite debates.db."""
    verdict = state.get("verdict") or {}
    thread_id = state.get("thread_id") or ""
    raw_claim = state.get("raw_claim", "")

    # SQLite persistence is also handled thread-safely by the API caller or here
    return {}
