from unittest.mock import patch
import pytest
from app.db.sqlite import create_debate, get_debate, init_db, list_debates, update_debate


@pytest.mark.asyncio
async def test_sqlite_persistence(tmp_path):
    """Test full SQLite CRUD lifecycle for debate records including max_rounds and mode."""
    db_file = str(tmp_path / "test_debates.db")
    await init_db(db_file)

    thread_id = "test-thread-001"
    created = await create_debate(
        thread_id=thread_id,
        claim="Global sea levels have risen 20cm since 1900.",
        max_rounds=1,
        mode="scientific",
        db_path=db_file,
    )
    assert created["thread_id"] == thread_id
    assert created["status"] == "running"
    assert created["max_rounds"] == 1
    assert created["mode"] == "scientific"

    fetched = await get_debate(thread_id, db_path=db_file)
    assert fetched is not None
    assert fetched["claim"] == "Global sea levels have risen 20cm since 1900."
    assert fetched["max_rounds"] == 1
    assert fetched["mode"] == "scientific"

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

    debates = await list_debates(limit=10, db_path=db_file)
    assert len(debates) == 1
    assert debates[0]["thread_id"] == thread_id
    assert debates[0]["max_rounds"] == 1
    assert debates[0]["mode"] == "scientific"
