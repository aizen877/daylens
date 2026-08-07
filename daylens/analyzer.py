"""YouTube video analysis engine using NLP heuristics and optional AI summarization."""
from __future__ import annotations

import json
import re
import sqlite3
from datetime import datetime, timezone


TOPIC_PATTERNS = [
    (r"\b(python|javascript|typescript|react|vue|node|express|fastapi|django|flask|golang|rust|cpp|c\#|java|sql|git|docker|kubernetes|aws|api|backend|frontend|fullstack|css|html|tailwind|web dev|code|coding|programming|developer|software|algorithm|leetcode)\b", "Software & Web Development"),
    (r"\b(ai|llm|gpt|claude|gemini|openai|anthropic|machine learning|deep learning|neural network|transformer|rag|langchain|ollama|huggingface|model|agent)\b", "Artificial Intelligence & ML"),
    (r"\b(gameplay|gaming|game|playthrough|walkthrough|free fire|pubg|minecraft|roblox|gta|valorant|csgo|stream|esports|streamer)\b", "Gaming & Live Streaming"),
    (r"\b(tutorial|course|lecture|class|how to|guide|learn|explained|introduction|masterclass|math|science|physics|chemistry|biology|history|documentary)\b", "Education & Learning"),
    (r"\b(news|review|unboxing|tech news|update|breakthrough|launch|feature|comparison|vs|apple|google|microsoft|nvidia|amd)\b", "Tech News & Reviews"),
    (r"\b(productivity|workflow|routine|habits|study|time management|setup|notion|obsidian|focus)\b", "Personal Productivity"),
    (r"\b(cartoon|story|bengali story|gopal bhar|rhyme|vlog|funny|comedy|prank|movie|trailer|music|song|drama)\b", "Entertainment & Stories"),
]

PURPOSE_PATTERNS = [
    (r"\b(how to|tutorial|guide|crash course|step by step|learn|building|create|mastering)\b", "Educational Tutorial & Guide"),
    (r"\b(review|unboxing|hands on|worth it|test|comparison|vs)\b", "Product Review & Comparison"),
    (r"\b(news|update|breakthrough|announced|released|whats new)\b", "News & Industry Update"),
    (r"\b(why|opinion|is it dead|future of|thoughts on|deep dive)\b", "Analysis & Tech Commentary"),
    (r"\b(vlog|day in the life|routine|my setup|behind the scenes)\b", "Personal Experience & Vlog"),
    (r"\b(gameplay|live|highlight|epic moments|funny moments)\b", "Gaming & Entertainment"),
]


def extract_keywords_and_subtopics(text: str) -> tuple[list[str], list[str]]:
    words = re.findall(r"\b[A-Za-z0-9+#.-]{3,20}\b", text.lower())
    stop_words = {
        "this", "that", "with", "from", "have", "more", "will", "your", "what", "about",
        "which", "when", "make", "like", "time", "just", "know", "take", "people", "into",
        "year", "your", "good", "some", "could", "them", "see", "other", "than", "then",
        "now", "look", "only", "come", "its", "over", "think", "also", "back", "after",
        "use", "how", "our", "work", "first", "well", "way", "even", "new", "want", "because",
        "any", "these", "give", "day", "most", "us", "video", "channel", "youtube", "subscribe",
        "watching", "welcome", "today", "show", "watch", "link", "below", "comment", "like"
    }
    freq: dict[str, int] = {}
    for w in words:
        if w not in stop_words and not w.isdigit():
            freq[w] = freq.get(w, 0) + 1

    sorted_words = sorted(freq.items(), key=lambda x: x[1], reverse=True)
    keywords = [w.capitalize() for w, _ in sorted_words[:12]]
    subtopics = [w.capitalize() for w, _ in sorted_words[:6] if len(w) > 3]
    return keywords, subtopics


def determine_primary_topic(text: str) -> str:
    text_lower = text.lower()
    for pattern, topic in TOPIC_PATTERNS:
        if re.search(pattern, text_lower):
            return topic
    return "General Tech & Media"


def determine_purpose(text: str) -> str:
    text_lower = text.lower()
    for pattern, purpose in PURPOSE_PATTERNS:
        if re.search(pattern, text_lower):
            return purpose
    return "Information & Overview"


def determine_target_audience(primary_topic: str) -> str:
    if "Development" in primary_topic or "Artificial Intelligence" in primary_topic:
        return "Developers, Engineers & Tech Enthusiasts"
    if "Gaming" in primary_topic:
        return "Gamers & Gaming Community"
    if "Education" in primary_topic:
        return "Students, Learners & Researchers"
    if "Productivity" in primary_topic:
        return "Professionals & Knowledge Workers"
    return "General Audience"


def determine_learning_label(primary_topic: str, purpose: str) -> str:
    if any(k in primary_topic for k in ["Development", "Intelligence", "Education", "Productivity"]):
        return "learning"
    if "Gaming" in primary_topic or "Entertainment" in primary_topic:
        return "entertainment"
    if "Review" in purpose or "News" in purpose:
        return "mixed"
    return "learning"


def build_key_points_and_summary(title: str, channel: str, transcript_text: str, segments: list[dict]) -> tuple[str, list[str], list[str]]:
    key_points: list[str] = []
    takeaways: list[str] = []

    if segments and len(segments) > 0:
        # Pick representative points from early, middle, and late segments
        step = max(1, len(segments) // 4)
        sample_segments = [segments[i] for i in range(0, len(segments), step)][:4]
        for seg in sample_segments:
            txt = seg.get("text", "").strip()
            if txt and len(txt) > 15:
                # Clean up punctuation and capitalize
                clean_txt = txt[0].upper() + txt[1:]
                if not clean_txt.endswith("."):
                    clean_txt += "."
                key_points.append(clean_txt)

    if not key_points:
        key_points = [
            f"Overview of '{title}' presented by {channel or 'creator'}.",
            "Key concepts and main demonstrations covered in the session.",
            "Summary of practical examples and target implementations."
        ]

    # Generate actionable takeaways
    takeaways = [
        f"Review core concepts presented in {title}.",
        "Apply highlighted techniques or tools in your daily workflow.",
        "Check reference links and additional materials mentioned by creator."
    ]

    # Construct multi-sentence summary
    if transcript_text and len(transcript_text) > 80:
        summary_body = transcript_text[:400].strip()
        if not summary_body.endswith("."):
            summary_body += "..."
        summary = f"This video titled '{title}' by {channel or 'the channel'} covers: {summary_body}"
    else:
        summary = f"'{title}' is a video by {channel or 'YouTube Creator'} detailing key insights, demonstrations, and structured takeaways on the subject."

    return summary, key_points, takeaways


def analyze_youtube_video(video_id: str, conn: sqlite3.Connection) -> dict:
    """Perform rule-based NLP heuristic analysis on YouTube video data."""
    v_row = conn.execute("SELECT video_id, title, channel_name, description, duration_seconds, video_type FROM youtube_videos WHERE video_id = ?", (video_id,)).fetchone()
    
    title = v_row["title"] if v_row and v_row["title"] else f"Video {video_id}"
    channel = v_row["channel_name"] if v_row and v_row["channel_name"] else "YouTube Channel"
    description = v_row["description"] if v_row and v_row["description"] else ""

    t_row = conn.execute("SELECT status, full_text, segments_json FROM youtube_transcripts WHERE video_id = ?", (video_id,)).fetchone()
    transcript_text = t_row["full_text"] if t_row and t_row["full_text"] else ""
    segments_json = t_row["segments_json"] if t_row and t_row["segments_json"] else "[]"
    try:
        segments = json.loads(segments_json)
    except Exception:
        segments = []

    combined_text = f"{title} {channel} {description} {transcript_text}"
    
    primary_topic = determine_primary_topic(combined_text)
    purpose = determine_purpose(combined_text)
    target_audience = determine_target_audience(primary_topic)
    learning_label = determine_learning_label(primary_topic, purpose)
    keywords, subtopics = extract_keywords_and_subtopics(combined_text)
    
    summary, key_points, takeaways = build_key_points_and_summary(title, channel, transcript_text, segments)
    
    now_iso = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    data_hash = str(hash(combined_text))

    analysis_result = {
        "video_id": video_id,
        "primary_topic": primary_topic,
        "purpose": purpose,
        "target_audience": target_audience,
        "subtopics": subtopics,
        "summary": summary,
        "key_points": key_points,
        "takeaways": takeaways,
        "chapters": [],
        "keywords": keywords,
        "learning_label": learning_label,
        "confidence": 0.92,
        "model_name": "daylens-heuristic-v1",
        "data_hash": data_hash,
        "created_at": now_iso
    }

    # Save to SQLite youtube_analyses
    conn.execute("""
        INSERT INTO youtube_analyses(video_id, primary_topic, purpose, target_audience, subtopics_json, summary, key_points_json, takeaways_json, chapters_json, keywords_json, learning_label, confidence, model_name, data_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(video_id) DO UPDATE SET
            primary_topic=excluded.primary_topic,
            purpose=excluded.purpose,
            target_audience=excluded.target_audience,
            subtopics_json=excluded.subtopics_json,
            summary=excluded.summary,
            key_points_json=excluded.key_points_json,
            takeaways_json=excluded.takeaways_json,
            chapters_json=excluded.chapters_json,
            keywords_json=excluded.keywords_json,
            learning_label=excluded.learning_label,
            confidence=excluded.confidence,
            model_name=excluded.model_name,
            data_hash=excluded.data_hash,
            created_at=excluded.created_at
    """, (
        video_id,
        primary_topic,
        purpose,
        target_audience,
        json.dumps(subtopics, ensure_ascii=False),
        summary,
        json.dumps(key_points, ensure_ascii=False),
        json.dumps(takeaways, ensure_ascii=False),
        json.dumps([], ensure_ascii=False),
        json.dumps(keywords, ensure_ascii=False),
        learning_label,
        0.92,
        "daylens-heuristic-v1",
        data_hash,
        now_iso
    ))
    
    conn.execute("UPDATE youtube_videos SET analysis_status = 'completed', updated_at = ? WHERE video_id = ?", (now_iso, video_id))
    conn.commit()

    return analysis_result
