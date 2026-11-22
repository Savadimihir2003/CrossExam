from typing import Any
from unittest.mock import MagicMock, patch
import pytest
from httpx import ASGITransport, AsyncClient
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.graph import StateGraph, START, END
from langgraph.types import Command, interrupt

from app.db.sqlite import create_debate, get_debate, init_db, list_debates, update_debate
from app.graph.nodes import (
    decomposer_node,
    fan_out_to_debaters,
    guard_node,
    hitl_gate_node,
    hitl_router,
    judge_node,
    moderator_node,
    moderator_router,
    persist_node,
    proponent_node,
    skeptic_node,
)
from app.graph.state import (
    ArgumentOutput,
    CitationAuditItem,
    ClaimBreakdownItem,
    DebateState,
    DecomposedClaims,
    VerdictSchema,
)
from app.graph.workflow import create_debate_graph
from app.main import app
from app.tools.search import _clean_text, search_duckduckgo


# ============================================================
# 1. SQLite Persistence Tests
# ============================================================

@pytest.mark.asyncio
async def test_sqlite_persistence(tmp_path):
    """Test full SQLite CRUD lifecycle for debate records."""
    db_file = str(tmp_path / "test_debates.db")
    await init_db(db_file)

    # 1. Create
    thread_id = "test-thread-001"
    created = await create_debate(
        thread_id=thread_id,
        claim="Global sea levels have risen 20cm since 1900.",
        db_path=db_file,
    )
    assert created["thread_id"] == thread_id
    assert created["status"] == "running"

    # 2. Get
    fetched = await get_debate(thread_id, db_path=db_file)
    assert fetched is not None
    assert fetched["claim"] == "Global sea levels have risen 20cm since 1900."

    # 3. Update status & verdict
    report = {
        "verdict": "SUPPORTED",
        "confidence": 0.94,
        "summary": "Documented by tide gauges and satellite altimetry.",
    }
    updated = await update_debate(
        thread_id=thread_id,
        status="completed",
        verdict="SUPPORTED",
        confidence=0.94,
        total_tokens=1250,
        report_json=report,
        db_path=db_file,
    )
    assert updated["status"] == "completed"
    assert updated["verdict"] == "SUPPORTED"
    assert updated["confidence"] == 0.94
    assert updated["total_tokens"] == 1250
    assert updated["report"]["summary"] == report["summary"]

    # 4. List
    debates = await list_debates(limit=10, db_path=db_file)
    assert len(debates) == 1
    assert debates[0]["thread_id"] == thread_id


# ============================================================
# 2. Search Tool & Text Cleaner Tests
# ============================================================

def test_search_clean_text():
    """Verify HTML stripping, whitespace collapsing, and word truncation."""
    html_input = "<div><p>NASA climate data confirms <b>accelerating</b> sea levels.</p></div>"
    cleaned = _clean_text(html_input, max_words=5)
    assert "<" not in cleaned
    assert ">" not in cleaned
    assert len(cleaned.split()) <= 6  # max 5 words + optional "..."


def test_search_empty_query():
    """Ensure empty or whitespace queries return safely without network call."""
    assert search_duckduckgo("") == []
    assert search_duckduckgo("   ") == []


@patch("duckduckgo_search.DDGS")
def test_search_mocked(mock_ddgs_cls):
    """Ensure search returns standard distilled schema."""
    mock_instance = MagicMock()
    mock_instance.text.return_value = [
        {
            "title": "NASA Sea Level Study",
            "href": "https://climate.nasa.gov/vital-signs/sea-level",
            "body": "Global sea levels have risen by about 8 inches in the last century.",
        }
    ]
    mock_ddgs_cls.return_value = mock_instance
    results = search_duckduckgo("sea level nasa", max_results=1)
    assert len(results) == 1
    assert results[0]["title"] == "NASA Sea Level Study"
    assert results[0]["url"].startswith("https://")


# ============================================================
# 3. LangGraph Execution & Mocked Node Tests
# ============================================================

def test_guard_node_pass():
    """Verify guard node allows normal claims through."""
    state: DebateState = {
        "raw_claim": "The Great Wall of China is visible from space with the naked eye.",
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
    result = guard_node(state)
    assert result["guard_flagged"] is False


@patch("app.graph.nodes.get_llm")
def test_decomposer_node(mock_get_llm):
    """Verify decomposer node returns atomic sub-claims using structured output."""
    mock_llm = MagicMock()
    mock_structured = MagicMock()
    mock_structured.invoke.return_value = DecomposedClaims(
        sub_claims=[
            "The Great Wall of China has sufficient width to be visible from low Earth orbit.",
            "Astronauts have visually confirmed seeing it with the naked eye.",
        ]
    )
    mock_llm.with_structured_output.return_value = mock_structured
    mock_get_llm.return_value = mock_llm

    state: DebateState = {
        "raw_claim": "The Great Wall of China is visible from space with the naked eye.",
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

    result = decomposer_node(state)
    assert len(result["sub_claims"]) == 2
    assert "orbit" in result["sub_claims"][0]
    assert result["token_usage"] > 0


def test_fan_out_to_debaters():
    """Verify fan_out_to_debaters produces Send() calls for both Proponent and Skeptic."""
    state: DebateState = {
        "raw_claim": "Test claim",
        "sub_claims": ["Sub 1", "Sub 2"],
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
    sends = fan_out_to_debaters(state)
    assert len(sends) == 2
    targets = {s.node for s in sends}
    assert targets == {"proponent_node", "skeptic_node"}


@patch("app.graph.nodes.search_duckduckgo")
@patch("app.graph.nodes.get_llm")
def test_proponent_and_skeptic_nodes(mock_get_llm, mock_search):
    """Verify debater nodes create cited arguments with proper schemas."""
    mock_search.return_value = [
        {"title": "Fact Check", "url": "https://example.com/source", "snippet": "Evidence snippet"}
    ]
    mock_llm = MagicMock()
    mock_structured = MagicMock()
    mock_structured.invoke.return_value = ArgumentOutput(
        search_query="test query",
        argument="Rigorous evaluation confirms this assertion.",
        cited_urls=["https://example.com/source"],
    )
    mock_llm.with_structured_output.return_value = mock_structured
    mock_get_llm.return_value = mock_llm

    prop_result = proponent_node({
        "role": "proponent",
        "round": 1,
        "raw_claim": "Test claim",
        "sub_claims": ["Sub 1"],
        "opponent_prev_arg": "",
    })
    assert len(prop_result["proponent_args"]) == 1
    assert prop_result["proponent_args"][0]["role"] == "proponent"
    assert prop_result["proponent_args"][0]["citations"] == ["https://example.com/source"]

    skep_result = skeptic_node({
        "role": "skeptic",
        "round": 1,
        "raw_claim": "Test claim",
        "sub_claims": ["Sub 1"],
        "opponent_prev_arg": "Prop arg",
    })
    assert len(skep_result["skeptic_args"]) == 1
    assert skep_result["skeptic_args"][0]["role"] == "skeptic"


def test_moderator_loop_routing():
    """Verify moderator_router loops if round <= max_rounds and branches to judge when done."""
    # Round 1 with max 2 -> loops via fan_out Send()
    state_loop: DebateState = {
        "raw_claim": "Claim",
        "sub_claims": ["Sub 1"],
        "round": 2,  # moderator_node has incremented to 2
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
    route_loop = moderator_router(state_loop)
    assert isinstance(route_loop, list)
    assert len(route_loop) == 2  # Send calls

    # Round 3 with max 2 -> advances to judge_node
    state_done: DebateState = {
        **state_loop,
        "round": 3,
        "max_rounds": 2,
    }
    route_done = moderator_router(state_done)
    assert route_done == "judge_node"


# ============================================================
# 4. HITL Interrupt and Command Resume Cycle
# ============================================================

@pytest.mark.asyncio
async def test_hitl_interrupt_and_command_resume():
    """Test full LangGraph interrupt() when confidence < 0.75 and resume via Command()."""
    class MockGraphState(DebateState):
        pass

    async with AsyncSqliteSaver.from_conn_string(":memory:") as cp:
        await cp.setup()

        def mock_judge(state: DebateState):
            if state.get("human_context"):
                # Human clarification elevated confidence
                verdict = {
                    "verdict": "SUPPORTED",
                    "confidence": 0.92,
                    "summary": f"Affirmed after expert evidence: {state['human_context']}",
                    "claim_breakdown": [],
                    "citation_audit": [],
                }
                return {"verdict": verdict, "rescored": True}
            else:
                verdict = {
                    "verdict": "UNVERIFIABLE",
                    "confidence": 0.55,
                    "summary": "Ambiguous evidence requires human clarification.",
                    "claim_breakdown": [],
                    "citation_audit": [],
                }
                return {"verdict": verdict, "rescored": False}

        builder = StateGraph(DebateState)
        builder.add_node("judge_node", mock_judge)
        builder.add_node("hitl_gate_node", hitl_gate_node)
        builder.add_node("persist_node", persist_node)

        builder.add_edge(START, "judge_node")
        builder.add_edge("judge_node", "hitl_gate_node")
        builder.add_conditional_edges("hitl_gate_node", hitl_router, ["judge_node", "persist_node"])
        builder.add_edge("persist_node", END)

        graph = builder.compile(checkpointer=cp)
        cfg = {"configurable": {"thread_id": "hitl-test-thread"}}

        init_input = {
            "raw_claim": "The moon landing photos show non-parallel shadows.",
            "sub_claims": [],
            "round": 1,
            "max_rounds": 1,
            "proponent_args": [],
            "skeptic_args": [],
            "evidence_urls": [],
            "human_context": None,
            "verdict": None,
            "token_usage": 0,
            "guard_flagged": False,
            "rescored": False,
        }

        # Step 1: Initial invocation -> pauses at hitl_gate_node
        interrupted_events = []
        async for chunk in graph.astream(init_input, cfg, stream_mode="updates"):
            interrupted_events.append(chunk)

        state_after_run1 = await graph.aget_state(cfg)
        assert len(state_after_run1.tasks) > 0
        interrupt_val = state_after_run1.tasks[0].interrupts[0].value
        assert interrupt_val["reason"] == "low_confidence"
        assert interrupt_val["confidence"] == 0.55

        # Step 2: Resume with Command(resume="Perspective projection on uneven lunar topography causes this.")
        resume_events = []
        async for chunk in graph.astream(
            Command(resume="Perspective projection on uneven lunar topography causes this."),
            cfg,
            stream_mode="updates",
        ):
            resume_events.append(chunk)

        state_after_resume = await graph.aget_state(cfg)
        final_verdict = state_after_resume.values["verdict"]
        assert final_verdict["confidence"] == 0.92
        assert final_verdict["verdict"] == "SUPPORTED"
        assert state_after_resume.values["rescored"] is True


# ============================================================
# 5. FastAPI Endpoints Integration Tests
# ============================================================

@pytest.mark.asyncio
async def test_fastapi_endpoints(tmp_path):
    """Test REST endpoints: health check, create debate, list debates, get debate."""
    test_db = str(tmp_path / "api_test.db")
    with patch("app.config.settings.DEBATES_DB_PATH", test_db):
        await init_db(test_db)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Health
            res_health = await client.get("/health")
            assert res_health.status_code == 200
            assert res_health.json()["status"] == "healthy"

            # Create debate
            res_create = await client.post(
                "/api/debates",
                json={"claim": "Quantum computers can break RSA-2048 today.", "max_rounds": 2},
            )
            assert res_create.status_code == 201
            body = res_create.json()
            thread_id = body["thread_id"]
            assert body["claim"] == "Quantum computers can break RSA-2048 today."
            assert body["status"] == "running"

            # List debates
            res_list = await client.get("/api/debates")
            assert res_list.status_code == 200
            debates = res_list.json()
            assert any(d["thread_id"] == thread_id for d in debates)

            # Get single debate
            res_get = await client.get(f"/api/debates/{thread_id}")
            assert res_get.status_code == 200
            assert res_get.json()["thread_id"] == thread_id


def test_missing_groq_api_key_fails_gracefully():
    """Verify clear error message is raised when GROQ_API_KEY is empty or missing."""
    with patch("app.config.settings.GROQ_API_KEY", ""):
        with pytest.raises(RuntimeError) as exc_info:
            from app.config import settings
            settings.validate_groq_api_key()
        assert "GROQ_API_KEY is missing or invalid" in str(exc_info.value)

