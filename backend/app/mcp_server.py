"""Lightweight zero-dependency MCP (Model Context Protocol) stdio server for CrossExam.

Allows AI coding assistants (Cursor, Claude Code, Antigravity) to invoke CrossExam
directly as an adversarial fact-checking tool over JSON-RPC 2.0 stdio.
"""

import asyncio
import json
import sys
import uuid
from typing import Any

from app.config import settings
from app.db.sqlite import create_debate, init_db, list_debates
from app.graph.workflow import create_debate_graph, get_checkpointer

SERVER_INFO = {"name": "crossexam-mcp", "version": "1.0.0"}
PROTOCOL_VERSION = "2024-11-05"

TOOLS = [
    {
        "name": "verify_claim",
        "description": (
            "Run an adversarial multi-agent Proponent vs. Skeptic debate with live DuckDuckGo "
            "search and HTTP citation verification to fact-check a claim."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "claim": {"type": "string", "description": "The factual claim to verify"},
                "max_rounds": {
                    "type": "integer",
                    "default": 3,
                    "minimum": 1,
                    "maximum": 4,
                    "description": "Number of adversarial debate rounds",
                },
                "mode": {
                    "type": "string",
                    "enum": ["general", "scientific", "financial", "security"],
                    "default": "general",
                    "description": "Domain jury framing mode",
                },
            },
            "required": ["claim"],
        },
    },
    {
        "name": "list_recent_debates",
        "description": "List recent persisted CrossExam fact-checking debates from SQLite.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "default": 10, "minimum": 1, "maximum": 50},
            },
        },
    },
]


async def _handle_tool_call(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    await init_db(settings.DEBATES_DB_PATH)

    if name == "list_recent_debates":
        limit = int(arguments.get("limit", 10))
        debates = await list_debates(limit=limit)
        return {
            "content": [{"type": "text", "text": json.dumps(debates, indent=2)}],
        }

    if name == "verify_claim":
        settings.validate_groq_api_key()
        claim = str(arguments.get("claim", "")).strip()
        if len(claim) < 3:
            raise ValueError("claim must be at least 3 characters")
        max_rounds = int(arguments.get("max_rounds", 3))
        mode = str(arguments.get("mode", "general"))

        thread_id = str(uuid.uuid4())
        await create_debate(thread_id=thread_id, claim=claim, max_rounds=max_rounds, mode=mode)
        config = {"configurable": {"thread_id": thread_id}}

        init_state = {
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

        async with get_checkpointer() as checkpointer:
            graph = create_debate_graph().compile(checkpointer=checkpointer)
            result = await graph.ainvoke(init_state, config=config)

        payload = {
            "thread_id": thread_id,
            "claim": claim,
            "mode": mode,
            "total_tokens": result.get("token_usage", 0),
            "verdict": result.get("verdict"),
        }
        return {
            "content": [{"type": "text", "text": json.dumps(payload, indent=2)}],
        }

    raise ValueError(f"Unknown tool: {name}")


async def _dispatch(request: dict[str, Any]) -> dict[str, Any] | None:
    req_id = request.get("id")
    method = request.get("method", "")
    params = request.get("params") or {}

    if method.startswith("notifications/"):
        return None

    try:
        if method == "initialize":
            result = {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {"tools": {}},
                "serverInfo": SERVER_INFO,
            }
        elif method == "tools/list":
            result = {"tools": TOOLS}
        elif method == "tools/call":
            result = await _handle_tool_call(params.get("name", ""), params.get("arguments") or {})
        else:
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {"code": -32601, "message": f"Method not found: {method}"},
            }
        return {"jsonrpc": "2.0", "id": req_id, "result": result}
    except Exception as exc:
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {"code": -32000, "message": str(exc)},
        }


async def serve_stdio() -> None:
    for line in sys.stdin:
        raw = line.strip()
        if not raw:
            continue
        try:
            req = json.loads(raw)
        except json.JSONDecodeError:
            continue
        resp = await _dispatch(req)
        if resp is not None:
            sys.stdout.write(json.dumps(resp) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    asyncio.run(serve_stdio())
