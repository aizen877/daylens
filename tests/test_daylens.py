import datetime as dt
from pathlib import Path

import daylens
import daylens.categorizer
import daylens.collector
import daylens.config
import daylens.db


def test_categorize():
    assert daylens.categorize("python.exe", "VS Code project") == "coding"
    assert daylens.categorize("brave.exe", "YouTube Shorts") == "entertainment"
    assert daylens.categorize("unknown.exe", "something") == "other"
    assert daylens.categorizer.categorize("WINWORD.EXE", "Doc.docx") == "office"


def test_insert_and_summary(tmp_path: Path):
    db = tmp_path / "test.db"
    conn = daylens.connect(db)
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    daylens.add_activity(conn, now.isoformat(), (now + dt.timedelta(minutes=10)).isoformat(), "python.exe", "VS Code", 3, "test")
    rows = conn.execute("SELECT app, category, idle_seconds FROM activities").fetchall()
    assert len(rows) == 1
    assert rows[0]["category"] == "coding"
    assert rows[0]["idle_seconds"] == 3
    conn.close()


def test_demo_creates_four_records(tmp_path: Path, monkeypatch):
    db = tmp_path / "demo.db"
    monkeypatch.setattr(daylens.config, "DB_PATH", db)
    monkeypatch.setattr(daylens, "DB_PATH", db)
    inserted = daylens.demo(2)
    assert inserted >= 4
    conn = daylens.connect(db)
    assert conn.execute("SELECT COUNT(*) FROM activities").fetchone()[0] == inserted
    conn.close()


def test_pause_tracking_state():
    assert not daylens.is_paused()
    daylens.set_paused(True)
    assert daylens.collector.is_paused()
    daylens.set_paused(False)
    assert not daylens.is_paused()


def test_custom_category_rules(tmp_path: Path):
    db = tmp_path / "rules.db"
    conn = daylens.connect(db)
    daylens.save_category_rule(conn, "coding", "python, mycustomapp")
    assert daylens.categorize("mycustomapp.exe", "Project", conn) == "coding"
    conn.close()


def test_date_range_resolver():
    start, end = daylens.resolve_date_range("today")
    assert len(start) == 19
    assert len(end) == 19

    start7, end7 = daylens.db.resolve_date_range("7d")
    assert start7 < end7

    start_custom, end_custom = daylens.resolve_date_range("custom", "2026-05-15")
    assert "2026-05-15 00:00:00" in start_custom
    assert "2026-05-15 23:59:59" in end_custom
