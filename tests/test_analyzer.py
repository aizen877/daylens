from pathlib import Path
import json

from daylens.analyzer import analyze_youtube_video, determine_primary_topic, determine_purpose
from daylens.db import connect
import daylens.server as server


def test_analyzer_topic_and_purpose_heuristics():
    title_coding = "Python FastAPI Tutorial: Build a REST API in 20 Minutes"
    assert determine_primary_topic(title_coding) == "Software & Web Development"
    assert determine_purpose(title_coding) == "Educational Tutorial & Guide"

    title_gaming = "Free Fire Epic Highlights & Gameplay"
    assert determine_primary_topic(title_gaming) == "Gaming & Live Streaming"

    title_ai = "Claude 3.5 Sonnet RAG Architecture Explained"
    assert determine_primary_topic(title_ai) == "Artificial Intelligence & ML"


def test_analyze_youtube_video_persistence(tmp_path: Path):
    db_path = tmp_path / "analyzer.db"
    conn = connect(db_path)

    # Insert sample video & transcript
    conn.execute("""
        INSERT INTO youtube_videos(video_id, url, title, channel_name, duration_seconds, video_type, created_at, updated_at)
        VALUES ('yt_test_123', 'https://youtube.com/watch?v=yt_test_123', 'Async Python & Web Scraping Tutorial', 'Dev Channel', 600, 'long', '2026-08-07T00:00:00Z', '2026-08-07T00:00:00Z')
    """)
    conn.execute("""
        INSERT INTO youtube_transcripts(video_id, status, language, transcript_type, full_text, segments_json, retrieved_at)
        VALUES ('yt_test_123', 'available', 'en', 'auto', 'Welcome to Python scraping tutorial. In this guide we use AsyncIO and BeautifulSoup to parse HTML.', '[{"start": 0, "duration": 10, "text": "Welcome to Python scraping tutorial."}, {"start": 10, "duration": 20, "text": "In this guide we use AsyncIO to parse HTML."}]', '2026-08-07T00:00:00Z')
    """)
    conn.commit()

    result = analyze_youtube_video('yt_test_123', conn)
    assert result["video_id"] == "yt_test_123"
    assert result["primary_topic"] == "Software & Web Development"
    assert "Tutorial" in result["purpose"]
    assert result["learning_label"] == "learning"
    assert len(result["key_points"]) > 0
    assert len(result["takeaways"]) > 0

    # Verify database persistence
    row = conn.execute("SELECT * FROM youtube_analyses WHERE video_id = 'yt_test_123'").fetchone()
    assert row is not None
    assert row["primary_topic"] == "Software & Web Development"
    assert "Tutorial" in row["purpose"]
    assert "Developers" in row["target_audience"]
    conn.close()
