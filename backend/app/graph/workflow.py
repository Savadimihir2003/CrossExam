from contextlib import asynccontextmanager
from typing import AsyncGenerator
import aiosqlite
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.graph import StateGraph, START, END

from app.config import settings
from app.graph.nodes import (
    decomposer_node,
    fan_out_to_debaters,
    guard_node,
    guard_router,
    hitl_gate_node,
    hitl_router,
    judge_node,
    moderator_node,
    moderator_router,
    persist_node,
    proponent_node,
    skeptic_node,
)
from app.graph.state import DebateState


def create_debate_graph():
    """Build the compiled StateGraph for the CrossExam debate engine."""
    builder = StateGraph(DebateState)

    # Add all nodes
    builder.add_node("guard_node", guard_node)
    builder.add_node("decomposer_node", decomposer_node)
    builder.add_node("proponent_node", proponent_node)
    builder.add_node("skeptic_node", skeptic_node)
    builder.add_node("moderator_node", moderator_node)
    builder.add_node("judge_node", judge_node)
    builder.add_node("hitl_gate_node", hitl_gate_node)
    builder.add_node("persist_node", persist_node)

    # Edges
    builder.add_edge(START, "guard_node")

    # Guard node either halts on injection to persist_node or proceeds to decomposer
    builder.add_conditional_edges(
        "guard_node",
        guard_router,
        ["decomposer_node", "persist_node"],
    )

    # Decomposer fans out concurrently to Proponent & Skeptic
    builder.add_conditional_edges(
        "decomposer_node",
        fan_out_to_debaters,
        ["proponent_node", "skeptic_node"],
    )

    # Debaters sync back into Moderator
    builder.add_edge("proponent_node", "moderator_node")
    builder.add_edge("skeptic_node", "moderator_node")

    # Moderator either loops another round or moves to Judge
    builder.add_conditional_edges(
        "moderator_node",
        moderator_router,
        ["proponent_node", "skeptic_node", "judge_node"],
    )

    # Judge moves to HITL Gate
    builder.add_edge("judge_node", "hitl_gate_node")

    # HITL Gate either re-routes to Judge for re-scoring or to Persist
    builder.add_conditional_edges(
        "hitl_gate_node",
        hitl_router,
        ["judge_node", "persist_node"],
    )

    builder.add_edge("persist_node", END)
    return builder


@asynccontextmanager
async def get_checkpointer(db_path: str | None = None) -> AsyncGenerator[AsyncSqliteSaver, None]:
    """Provide an async sqlite checkpointer context."""
    path = db_path or settings.CHECKPOINTS_DB_PATH
    async with aiosqlite.connect(path) as conn:
        checkpointer = AsyncSqliteSaver(conn)
        # Ensure checkpoint tables are created
        await checkpointer.setup()
        yield checkpointer
