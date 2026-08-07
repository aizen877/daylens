import json
import sqlite3
from pathlib import Path

import pytest

import daylens.server as server
from daylens.db import connect


def test_ingest_endpoint_accepts_valid_browser_event(tmp_path, monkeypatch):
    db = tmp_path / "ingest.db"
    monkeypatch.setattr(server, "connect", lambda: connect(db))
    payload = {
        "source": "brave",
        "event_type": "active_tab",
        "domain": "www.youtube.com",
        "title": "Python tutorial",
        "started_at": "2026-08-05T10:00:00+00:00",
        "ended_at": "2026-08-05T10:01:00+00:00",
    }
    result = server.ingest_event(payload)
    assert result["accepted"] is True
    conn = connect(db)
    row = conn.execute("SELECT source, app, window_title, category FROM activities").fetchone()
    assert row["source"] == "brave"
    assert row["app"] == "youtube.com"
    assert row["window_title"] == "Python tutorial"
    assert row["category"] == "coding"


def test_ingest_rejects_sensitive_domain(tmp_path, monkeypatch):
    db = tmp_path / "blocked.db"
    monkeypatch.setattr(server, "connect", lambda: connect(db))
    monkeypatch.setattr(server, "BLOCKED_DOMAIN_PARTS", ("bank",))
    payload = {"source": "chrome", "event_type": "active_tab", "domain": "bank.example", "title": "Account"}
    with pytest.raises(ValueError, match="blocked"):
        server.ingest_event(payload)
    conn = connect(db)
    assert conn.execute("SELECT COUNT(*) FROM activities").fetchone()[0] == 0



def test_ingest_strips_www_and_url_data():
    normalized = server.normalize_ingest_payload({
        "source": "firefox", "event_type": "active_tab",
        "domain": "www.example.com", "title": "Example", "url": "https://example.com/a?secret=1"
    })
    assert normalized["domain"] == "example.com"
    assert "secret" not in json.dumps(normalized)


def test_ingest_handles_incognito_and_favicon(tmp_path, monkeypatch):
    db = tmp_path / "incognito.db"
    monkeypatch.setattr(server, "connect", lambda: connect(db))
    payload = {
        "source": "brave",
        "event_type": "active_tab",
        "domain": "github.com",
        "title": "Private Repo",
        "favIconUrl": "https://github.com/favicon.ico",
        "is_incognito": True,
        "started_at": "2026-08-05T10:00:00+00:00",
        "ended_at": "2026-08-05T10:01:00+00:00",
    }
    result = server.ingest_event(payload)
    assert result["accepted"] is True
    conn = connect(db)
    row = conn.execute("SELECT source, app, window_title, metadata_json FROM activities").fetchone()
    assert row["source"] == "brave"
    assert row["app"] == "github.com"
    assert "[Private]" in row["window_title"]
    metadata = json.loads(row["metadata_json"])
    assert metadata["is_incognito"] is True
    assert metadata["favIconUrl"] == "https://github.com/favicon.ico"


def test_youtube_watch_time_ingestion_and_isolation(tmp_path, monkeypatch):
    db = tmp_path / "yt_test.db"
    monkeypatch.setattr(server, "connect", lambda: connect(db))

    payload_a = {
        "source": "youtube",
        "event_type": "youtube_play",
        "domain": "youtube.com",
        "title": "Video A",
        "video_id": "vidA",
        "channel": "Channel A",
        "video_type": "long",
        "position_seconds": 10,
        "actual_watch_seconds": 45,
        "started_at": "2026-08-05T10:00:00+00:00",
        "ended_at": "2026-08-05T10:00:45+00:00",
    }
    server.ingest_event(payload_a)

    conn = connect(db)
    rows = conn.execute("SELECT window_title, metadata_json FROM activities").fetchall()
    assert len(rows) == 1
    meta = json.loads(rows[0]["metadata_json"])
    assert meta["actual_watch_seconds"] == 45
    assert meta["video_id"] == "vidA"
    conn.close()

    # Now ingest a different video on YouTube
    payload_b = {
        "source": "youtube",
        "event_type": "youtube_play",
        "domain": "youtube.com",
        "title": "Video B",
        "video_id": "vidB",
        "channel": "Channel B",
        "video_type": "long",
        "position_seconds": 5,
        "actual_watch_seconds": 30,
        "started_at": "2026-08-05T10:01:00+00:00",
        "ended_at": "2026-08-05T10:01:30+00:00",
    }
    server.ingest_event(payload_b)

    conn = connect(db)
    rows = conn.execute("SELECT window_title, metadata_json FROM activities ORDER BY id ASC").fetchall()
    # Must have 2 distinct records for 2 distinct videos
    assert len(rows) == 2
    meta_a = json.loads(rows[0]["metadata_json"])
    meta_b = json.loads(rows[1]["metadata_json"])
    assert meta_a["video_id"] == "vidA"
    assert meta_b["video_id"] == "vidB"
    conn.close()


