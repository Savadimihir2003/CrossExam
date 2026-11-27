import argparse
import asyncio
import json
import sys
import uuid
from typing import Any

from langgraph.types import Command

from app.config import settings
from app.db.sqlite import create_debate, init_db
from app.graph.workflow import create_debate_graph, get_checkpointer


async def run_cli_debate(claim: str, max_rounds: int, mode: str, json_output: bool) -> int:
    """Execute an adversarial CrossExam debate directly from the terminal."""
    try:
        settings.validate_groq_api_key()
    except RuntimeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    await init_db(settings.DEBATES_DB_PATH)
    thread_id = str(uuid.uuid4())
    await create_debate(thread_id=thread_id, claim=claim, max_rounds=max_rounds, mode=mode)

    config = {"configurable": {"thread_id": thread_id}}
    init_state: dict[str, Any] = {
        "thread_id": thread_id,
        "raw_claim": claim,
        "mode": mode,
        "sub_claims": [],
        "round": 1,
        "max_rounds": max_rounds,
        "proponent_args": [],
        "skeptic_args": [],
        "evidence_urls": [],
        "human_context": None,
        "verdict": None,
        "token_usage": 0,
        "guard_flagged": False,
        "rescored": False,
    }

    if not json_output:
        print(f"\n=== CrossExam CLI (mode={mode}, rounds={max_rounds}, thread={thread_id[:8]}) ===")
        print(f"Claim: {claim}\n")

    async with get_checkpointer() as checkpointer:
        graph = create_debate_graph().compile(checkpointer=checkpointer)
        stream_input: Any = init_state

        while True:
            interrupted = False
            async for chunk in graph.astream(stream_input, config=config, stream_mode="updates"):
                if "__interrupt__" in chunk:
                    interrupted = True
                    iv = chunk["__interrupt__"][0].value
                    if json_output:
                        # Non-interactive JSON mode: abort cleanly with interrupt info
                        print(json.dumps({"status": "paused", "interrupt": iv}, indent=2))
                        return 2
                    print(f"\n[HITL INTERRUPT] {iv.get('question')}")
                    user_ctx = input("Provide clarifying context (or press Enter to skip): ").strip()
                    stream_input = Command(resume=user_ctx or "Proceed with best available evidence.")
                    break
                elif not json_output:
                    for node_name in chunk:
                        print(f"  -> {node_name} completed")

            if not interrupted:
                break

        final_state = await graph.aget_state(config)
        values = final_state.values if final_state else {}
        verdict = values.get("verdict") or {}

        if json_output:
            print(json.dumps({
                "thread_id": thread_id,
                "claim": claim,
                "mode": mode,
                "total_tokens": values.get("token_usage", 0),
                **verdict,
            }, indent=2))
            return 0

        print("\n================ VERDICT ================")
        print(f"Verdict    : {verdict.get('verdict', 'UNKNOWN')}")
        print(f"Confidence : {float(verdict.get('confidence', 0.0)) * 100:.0f}%")
        print(f"Tokens     : {values.get('token_usage', 0)}")
        print(f"\nSummary:\n{verdict.get('summary', '')}\n")

        citations = verdict.get("citation_audit") or []
        if citations:
            print("Citation Audit:")
            for c in citations:
                print(f"  - [{c.get('reliability')}] [{c.get('url_status', 'unverified')}] {c.get('url')}")
        print("=========================================\n")
        return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="CrossExam Adversarial Fact-Checker CLI")
    parser.add_argument("claim", help="The claim or proposition to fact-check")
    parser.add_argument("--rounds", type=int, default=3, choices=[1, 2, 3, 4], help="Debate rounds (default: 3)")
    parser.add_argument(
        "--mode",
        default="general",
        choices=["general", "scientific", "financial", "security"],
        help="Domain jury framing mode",
    )
    parser.add_argument("--json", action="store_true", help="Output final verdict as JSON")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(run_cli_debate(args.claim, args.rounds, args.mode, args.json)))


if __name__ == "__main__":
    main()
