import json
from unittest.mock import MagicMock, patch
import pytest
from httpx import ASGITransport, AsyncClient

from app.api.routes import _resolve_models, debate_event_stream
from app.config import resolve_api_key
from app.db.sqlite import create_debate, get_debate, init_db, list_debates
from app.graph.nodes import (
    _request_api_key,
    _request_models,
    _request_temperature,
    clamp_temperature,
    get_effective_model,
    get_effective_temperature,
    reset_request_context,
    set_request_context,
)
from app.main import app


def test_server_mode_unaffected():
    """When .env has a valid key and no request key is supplied, server key is used."""
    with patch("app.config.settings.GROQ_API_KEY", "gsk_server_key_123"):
        assert resolve_api_key(request_key=None) == "gsk_server_key_123"


def test_byoak_overrides_env():
    """When both server key and request key are present, request key wins."""
    with patch("app.config.settings.GROQ_API_KEY", "gsk_server_key_123"):
        assert resolve_api_key(request_key="gsk_user_byoak_456") == "gsk_user_byoak_456"


def test_resolve_models_presets_and_custom():
    """Verify model presets and custom slot overrides resolve cleanly."""
    fast_models = _resolve_models(model_preset="fast")
    assert fast_models is not None
    assert fast_models["judge"] == "llama-3.1-8b-instant"

    custom_models = _resolve_models(
        models_raw=json.dumps({"judge": "llama-3.3-70b-versatile", "invalid_slot": "ignored"})
    )
    assert custom_models == {"judge": "llama-3.3-70b-versatile"}


@pytest.mark.asyncio
async def test_api_config_endpoint(tmp_path):
    """Config endpoint reports server_key_configured=False when .env is empty and True when set."""
    test_db = str(tmp_path / "cfg_test.db")
    await init_db(test_db)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with patch("app.config.settings.GROQ_API_KEY", ""):
            resp = await client.get("/api/config")
            assert resp.status_code == 200
            data = resp.json()
            assert data["server_key_configured"] is False
            assert "balanced" in data["model_presets"]

        with patch("app.config.settings.GROQ_API_KEY", "gsk_live_server_key"):
            resp2 = await client.get("/api/config")
            assert resp2.status_code == 200
            assert resp2.json()["server_key_configured"] is True


@pytest.mark.asyncio
async def test_validate_key_rejects_placeholder():
    """Validate-key endpoint rejects empty or placeholder keys without hitting Groq."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/validate-key", json={"api_key": "your_groq_api_key_here"})
        assert resp.status_code == 200
        assert resp.json()["valid"] is False


@pytest.mark.asyncio
async def test_session_id_history_isolation(tmp_path):
    """Debates created with X-Session-ID are isolated per session in list_debates."""
    test_db = str(tmp_path / "session_test.db")
    with patch("app.config.settings.DEBATES_DB_PATH", test_db):
        await init_db(test_db)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r1 = await client.post(
                "/api/debates",
                headers={"X-Session-ID": "sess-alpha"},
                json={"claim": "Alpha claim about solar power.", "max_rounds": 1},
            )
            r2 = await client.post(
                "/api/debates",
                headers={"X-Session-ID": "sess-beta"},
                json={"claim": "Beta claim about wind turbines.", "max_rounds": 1},
            )
            assert r1.status_code == 201
            assert r2.status_code == 201

            alpha_list = (await client.get("/api/debates", headers={"X-Session-ID": "sess-alpha"})).json()
            assert len(alpha_list) == 1
            assert alpha_list[0]["claim"] == "Alpha claim about solar power."

            all_list = await list_debates(db_path=test_db)
            assert len(all_list) == 2


@pytest.mark.asyncio
async def test_byoak_key_never_stored_in_sqlite_or_sse_and_resets_context(tmp_path):
    """BYOAK API key must never appear in SQLite, SSE events, or linger in ContextVar."""
    test_db = str(tmp_path / "byoak_leak.db")
    ckpt_db = str(tmp_path / "byoak_ckpt.db")
    fake_user_key = "gsk_secret_byoak_user_key_999"
    thread_id = "thread-byoak-privacy-check"

    class _FakeGraph:
        async def aget_state(self, config):
            m = MagicMock()
            m.values = {
                "raw_claim": "Water boils at 100C at sea level.",
                "verdict": {
                    "verdict": "SUPPORTED",
                    "confidence": 0.95,
                    "summary": "Confirmed by physics.",
                    "claim_breakdown": [],
                    "citation_audit": [],
                },
                "token_usage": 42,
            }
            return m

        async def astream(self, stream_input, config=None, stream_mode=None):
            # Verify ContextVar is populated inside execution
            assert _request_api_key.get() == fake_user_key
            assert get_effective_model("judge", "default-judge") == "llama-3.3-70b-versatile"
            yield {
                "judge_node": {
                    "verdict": {"verdict": "SUPPORTED", "confidence": 0.95},
                    "token_usage": 42,
                }
            }

    class _FakeCompiledWorkflow:
        def compile(self, checkpointer=None):
            return _FakeGraph()

    with patch("app.config.settings.DEBATES_DB_PATH", test_db), \
         patch("app.config.settings.CHECKPOINTS_DB_PATH", ckpt_db), \
         patch("app.config.settings.GROQ_API_KEY", ""), \
         patch("app.api.routes.create_debate_graph", return_value=_FakeCompiledWorkflow()):
        await init_db(test_db)
        await create_debate(
            thread_id=thread_id,
            claim="Water boils at 100C at sea level.",
            max_rounds=1,
            session_id="sess-privacy",
            db_path=test_db,
        )

        events = []
        async for chunk in debate_event_stream(
            thread_id=thread_id,
            api_key=fake_user_key,
            models={"judge": "llama-3.3-70b-versatile"},
        ):
            events.append(chunk)

        # Key must NOT appear in any SSE chunk
        for ev in events:
            assert fake_user_key not in ev

        # Key must NOT appear in SQLite row
        row = await get_debate(thread_id, db_path=test_db)
        assert row is not None
        assert fake_user_key not in json.dumps(row)

    # ContextVar must be reset after stream closes
    assert _request_api_key.get() is None
    assert _request_models.get() is None
    assert _request_temperature.get() is None


def test_temperature_clamping_keeps_nodes_in_check():
    """User temperature is clamped to [0.0, 0.7] and Judge/Decomposer stay <= 0.3."""
    assert clamp_temperature(2.0) == 0.7
    assert clamp_temperature(-1.0) == 0.0
    assert clamp_temperature(0.45) == 0.45

    tokens = set_request_context(temperature=1.8)
    try:
        # Debaters get up to 0.7
        assert get_effective_temperature(0.3, max_temp=0.7) == 0.7
        # Judge / Decomposer stay strictly capped at 0.3
        assert get_effective_temperature(0.1, max_temp=0.3) == 0.3
    finally:
        reset_request_context(tokens)

    assert _request_temperature.get() is None
