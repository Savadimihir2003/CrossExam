from contextlib import asynccontextmanager
import json
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Optional
import aiosqlite

from app.config import settings


def _current_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


@asynccontextmanager
async def _connect(path: str) -> AsyncGenerator[aiosqlite.Connection, None]:
    """Open an aiosqlite connection configured with WAL mode and busy timeout."""
    async with aiosqlite.connect(path) as db:
        await db.execute("PRAGMA journal_mode=WAL;")
        await db.execute("PRAGMA busy_timeout=5000;")
        yield db


async def init_db(db_path: Optional[str] = None) -> None:
    """Initialize the SQLite debates table if it does not exist."""
    path = db_path or settings.DEBATES_DB_PATH
    async with _connect(path) as db:
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS debates (
                thread_id TEXT PRIMARY KEY,
                claim TEXT NOT NULL,
                status TEXT NOT NULL,
                max_rounds INTEGER DEFAULT 3,
                mode TEXT DEFAULT 'general',
                verdict TEXT,
                confidence REAL,
                total_tokens INTEGER DEFAULT 0,
                report_json TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_debates_created_at ON debates (created_at DESC);"
        )
        for alter_sql in (
            "ALTER TABLE debates ADD COLUMN max_rounds INTEGER DEFAULT 3;",
            "ALTER TABLE debates ADD COLUMN mode TEXT DEFAULT 'general';",
        ):
            try:
                await db.execute(alter_sql)
            except Exception:
                pass
        await db.commit()


async def create_debate(
    thread_id: str,
    claim: str,
    status: str = "running",
    max_rounds: int = 3,
    mode: str = "general",
    db_path: Optional[str] = None,
) -> dict[str, Any]:
    """Create a new debate record in SQLite."""
    path = db_path or settings.DEBATES_DB_PATH
    now = _current_timestamp()
    async with _connect(path) as db:
        await db.execute(
            """
            INSERT INTO debates (
                thread_id, claim, status, max_rounds, mode, verdict, confidence,
                total_tokens, report_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, NULL, NULL, 0, NULL, ?, ?)
            """,
            (thread_id, claim, status, max_rounds, mode, now, now),
        )
        await db.commit()

    return {
        "thread_id": thread_id,
        "claim": claim,
        "status": status,
        "max_rounds": max_rounds,
        "mode": mode,
        "verdict": None,
        "confidence": None,
        "total_tokens": 0,
        "report_json": None,
        "created_at": now,
        "updated_at": now,
    }


async def update_debate(
    thread_id: str,
    status: Optional[str] = None,
    verdict: Optional[str] = None,
    confidence: Optional[float] = None,
    total_tokens: Optional[int] = None,
    report_json: Optional[str | dict] = None,
    db_path: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Update an existing debate record."""
    path = db_path or settings.DEBATES_DB_PATH
    now = _current_timestamp()

    # Normalize report_json if passed as dict
    report_str = (
        json.dumps(report_json)
        if isinstance(report_json, dict)
        else report_json
    )

    updates = ["updated_at = ?"]
    params: list[Any] = [now]

    if status is not None:
        updates.append("status = ?")
        params.append(status)
    if verdict is not None:
        updates.append("verdict = ?")
        params.append(verdict)
    if confidence is not None:
        updates.append("confidence = ?")
        params.append(confidence)
    if total_tokens is not None:
        updates.append("total_tokens = ?")
        params.append(total_tokens)
    if report_str is not None:
        updates.append("report_json = ?")
        params.append(report_str)

    params.append(thread_id)
    query = f"UPDATE debates SET {', '.join(updates)} WHERE thread_id = ?"

    async with aiosqlite.connect(path) as db:
        await db.execute(query, tuple(params))
        await db.commit()

    return await get_debate(thread_id, db_path=path)


async def get_debate(
    thread_id: str,
    db_path: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Fetch a single debate by thread_id."""
    path = db_path or settings.DEBATES_DB_PATH
    async with aiosqlite.connect(path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """
            SELECT thread_id, claim, status, max_rounds, mode, verdict, confidence,
                   total_tokens, report_json, created_at, updated_at
            FROM debates
            WHERE thread_id = ?
            """,
            (thread_id,),
        ) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            result = dict(row)
            if result.get("report_json"):
                try:
                    result["report"] = json.loads(result["report_json"])
                except Exception:
                    result["report"] = None
            else:
                result["report"] = None
            return result


async def list_debates(
    limit: int = 50,
    db_path: Optional[str] = None,
) -> list[dict[str, Any]]:
    """List recent debates ordered by creation time descending."""
    path = db_path or settings.DEBATES_DB_PATH
    async with aiosqlite.connect(path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """
            SELECT thread_id, claim, status, max_rounds, mode, verdict, confidence,
                   total_tokens, report_json, created_at, updated_at
            FROM debates
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (limit,),
        ) as cursor:
            rows = await cursor.fetchall()
            results = []
            for row in rows:
                item = dict(row)
                if item.get("report_json"):
                    try:
                        item["report"] = json.loads(item["report_json"])
                    except Exception:
                        item["report"] = None
                else:
                    item["report"] = None
                results.append(item)
            return results
