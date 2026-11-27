from unittest.mock import patch
import pytest
from httpx import ASGITransport, AsyncClient

from app.api.routes import debate_event_stream
from app.config import settings
from app.db.sqlite import create_debate, get_debate, init_db
from app.main import app
from app.mcp_server import _dispatch


@pytest.mark.asyncio
async def test_fastapi_endpoints_and_jury_mode(tmp_path):
    """Test REST endpoints: health check, create debate with mode, list, and get."""
    test_db = str(tmp_path / "api_test.db")
    with patch("app.config.settings.DEBATES_DB_PATH", test_db):
        await init_db(test_db)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res_health = await client.get("/health")
            assert res_health.status_code == 200
            assert res_health.json()["status"] == "healthy"

            res_create = await client.post(
                "/api/debates",
                json={
                    "claim": "mRNA vaccines alter human DNA.",
                    "max_rounds": 3,
                    "mode": "scientific",
                },
            )
            assert res_create.status_code == 201
            body = res_create.json()
            thread_id = body["thread_id"]
            assert body["max_rounds"] == 3
            assert body["mode"] == "scientific"

            res_list = await client.get("/api/debates")
            assert res_list.status_code == 200
            assert any(d["thread_id"] == thread_id for d in res_list.json())

            res_get = await client.get(f"/api/debates/{thread_id}")
            assert res_get.status_code == 200
            assert res_get.json()["mode"] == "scientific"


def test_missing_groq_api_key_fails_gracefully():
    """Verify clear error message is raised when GROQ_API_KEY is empty or missing."""
    with patch("app.config.settings.GROQ_API_KEY", ""):
        with pytest.raises(RuntimeError) as exc_info:
            settings.validate_groq_api_key()
        assert "GROQ_API_KEY is missing or invalid" in str(exc_info.value)


@pytest.mark.asyncio
async def test_stream_missing_key_emits_error_and_persists(tmp_path):
    """Verify missing GROQ_API_KEY emits an SSE error event and marks SQLite status='error'."""
    test_db = str(tmp_path / "missing_key.db")
    await init_db(test_db)
    thread_id = "test-missing-key-stream"

    with patch("app.config.settings.DEBATES_DB_PATH", test_db), \
         patch("app.config.settings.GROQ_API_KEY", ""):
        await create_debate(thread_id=thread_id, claim="Test claim", max_rounds=1, db_path=test_db)
        events = []
        async for chunk in debate_event_stream(thread_id):
            events.append(chunk)

        assert any("event: error" in ev for ev in events)
        assert any("GROQ_API_KEY is missing or invalid" in ev for ev in events)
        saved = await get_debate(thread_id, db_path=test_db)
        assert saved["status"] == "error"


@pytest.mark.asyncio
async def test_mcp_server_dispatch(tmp_path):
    """Verify MCP stdio JSON-RPC dispatch supports initialize, tools/list, and list_recent_debates."""
    test_db = str(tmp_path / "mcp_test.db")
    with patch("app.config.settings.DEBATES_DB_PATH", test_db):
        await init_db(test_db)
        init_resp = await _dispatch({"jsonrpc": "2.0", "id": 1, "method": "initialize"})
        assert init_resp["result"]["serverInfo"]["name"] == "crossexam-mcp"

        list_resp = await _dispatch({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
        tool_names = {t["name"] for t in list_resp["result"]["tools"]}
        assert tool_names == {"verify_claim", "list_recent_debates"}

        call_resp = await _dispatch({
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {"name": "list_recent_debates", "arguments": {"limit": 5}},
        })
        assert "content" in call_resp["result"]
