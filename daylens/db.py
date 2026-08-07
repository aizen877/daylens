"""SQLite storage, connection handling, and activity data queries."""
from __future__ import annotations

import datetime as dt
import json
import sqlite3
from pathlib import Path

import daylens.config as config
from daylens.categorizer import categorize, seed_category_rules


def utc_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0)


def iso_now() -> str:
    return utc_now().isoformat()


def connect(db_path: Path | str | None = None) -> sqlite3.Connection:
    if db_path is None:
        db_path = config.DB_PATH
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        app TEXT NOT NULL,
        window_title TEXT NOT NULL,
        category TEXT NOT NULL,
        idle_seconds INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'collector',
        metadata_json TEXT NOT NULL DEFAULT '{}'
    )""")
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(activities)")}
    if "metadata_json" not in columns:
        conn.execute("ALTER TABLE activities ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'")
    conn.execute("""CREATE TABLE IF NOT EXISTS youtube_videos (
        video_id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        channel_name TEXT NOT NULL DEFAULT '',
        language TEXT NOT NULL DEFAULT '',
        duration_seconds INTEGER NOT NULL DEFAULT 0,
        video_type TEXT NOT NULL DEFAULT 'long',
        thumbnail_url TEXT NOT NULL DEFAULT '',
        published_at TEXT NOT NULL DEFAULT '',
        transcript_status TEXT NOT NULL DEFAULT 'unknown',
        analysis_status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS youtube_watch_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        watch_seconds INTEGER NOT NULL DEFAULT 0,
        last_position_seconds INTEGER NOT NULL DEFAULT 0,
        completed INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(video_id) REFERENCES youtube_videos(video_id)
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS youtube_transcripts (
        video_id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'unknown',
        language TEXT NOT NULL DEFAULT '',
        transcript_type TEXT NOT NULL DEFAULT '',
        full_text TEXT NOT NULL DEFAULT '',
        segments_json TEXT NOT NULL DEFAULT '[]',
        retrieved_at TEXT NOT NULL DEFAULT '',
        FOREIGN KEY(video_id) REFERENCES youtube_videos(video_id)
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS youtube_analyses (
        video_id TEXT PRIMARY KEY,
        primary_topic TEXT NOT NULL DEFAULT '',
        subtopics_json TEXT NOT NULL DEFAULT '[]',
        summary TEXT NOT NULL DEFAULT '',
        key_points_json TEXT NOT NULL DEFAULT '[]',
        chapters_json TEXT NOT NULL DEFAULT '[]',
        keywords_json TEXT NOT NULL DEFAULT '[]',
        learning_label TEXT NOT NULL DEFAULT '',
        confidence REAL NOT NULL DEFAULT 0,
        model_name TEXT NOT NULL DEFAULT '',
        data_hash TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY(video_id) REFERENCES youtube_videos(video_id)
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS category_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT UNIQUE NOT NULL,
        keywords TEXT NOT NULL
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS app_icons (
        app TEXT PRIMARY KEY,
        icon_data TEXT NOT NULL
    )""")
    conn.commit()
    seed_category_rules(conn)
    return conn


def add_activity(conn: sqlite3.Connection, started_at: str, ended_at: str, app: str,
                 title: str, idle_seconds: int = 0, source: str = "collector",
                 metadata: dict | None = None) -> None:
    cat = categorize(app, title, conn)
    conn.execute(
        "INSERT INTO activities(started_at, ended_at, app, window_title, category, idle_seconds, source, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (started_at, ended_at, app or "Unknown", title or "", cat, int(idle_seconds), source, json.dumps(metadata or {}, ensure_ascii=False)),
    )
    conn.commit()


def resolve_date_range(range_type: str, custom_date: str | None = None) -> tuple[str, str]:
    now_local = dt.datetime.now().astimezone()
    today_start = now_local.replace(hour=0, minute=0, second=0, microsecond=0)

    if range_type == "7d":
        start = today_start - dt.timedelta(days=6)
        end = now_local.replace(hour=23, minute=59, second=59)
    elif range_type == "30d":
        start = today_start - dt.timedelta(days=29)
        end = now_local.replace(hour=23, minute=59, second=59)
    elif range_type == "custom" and custom_date:
        try:
            d = dt.date.fromisoformat(custom_date)
            start = dt.datetime(d.year, d.month, d.day, 0, 0, 0, tzinfo=now_local.tzinfo)
            end = dt.datetime(d.year, d.month, d.day, 23, 59, 59, tzinfo=now_local.tzinfo)
        except Exception:
            start = today_start
            end = now_local.replace(hour=23, minute=59, second=59)
    elif range_type == "all":
        start = dt.datetime(2000, 1, 1, 0, 0, 0, tzinfo=now_local.tzinfo)
        end = now_local.replace(hour=23, minute=59, second=59)
    else:  # today
        start = today_start
        end = now_local.replace(hour=23, minute=59, second=59)

    return start.strftime("%Y-%m-%d %H:%M:%S"), end.strftime("%Y-%m-%d %H:%M:%S")


def merge_intervals(intervals: list[tuple[dt.datetime, dt.datetime]]) -> float:
    if not intervals:
        return 0.0
    sorted_inv = sorted(intervals, key=lambda x: x[0])
    merged = []
    cs, ce = sorted_inv[0]
    for s, e in sorted_inv[1:]:
        if s <= ce:
            ce = max(ce, e)
        else:
            merged.append((cs, ce))
            cs, ce = s, e
    merged.append((cs, ce))
    return sum((e - s).total_seconds() for s, e in merged) / 60.0


def summary(conn: sqlite3.Connection, date_from: str | None = None, date_to: str | None = None) -> list[dict]:
    if not date_from or not date_to:
        date_from, date_to = resolve_date_range("today")

    rows = conn.execute("""
        SELECT category, app, started_at, ended_at, idle_seconds
        FROM activities
        WHERE datetime(started_at, 'localtime') BETWEEN datetime(?) AND datetime(?)
    """, (date_from, date_to)).fetchall()

    grouped: dict[tuple[str, str], list[tuple[dt.datetime, dt.datetime]]] = {}
    sessions_map: dict[tuple[str, str], int] = {}
    idle_map: dict[tuple[str, str], float] = {}

    for r in rows:
        key = (r["category"], r["app"])
        sessions_map[key] = sessions_map.get(key, 0) + 1
        idle_map[key] = idle_map.get(key, 0.0) + (r["idle_seconds"] or 0)
        try:
            s = dt.datetime.fromisoformat(r["started_at"].replace(" ", "T").replace("Z", "+00:00"))
            e = dt.datetime.fromisoformat(r["ended_at"].replace(" ", "T").replace("Z", "+00:00"))
            if e > s:
                grouped.setdefault(key, []).append((s, e))
        except Exception:
            pass

    results = []
    for (cat, app), intervals in grouped.items():
        mins = merge_intervals(intervals)
        results.append({
            "category": cat,
            "app": app,
            "sessions": sessions_map.get((cat, app), 0),
            "minutes": round(mins, 1),
            "idle_seconds": idle_map.get((cat, app), 0.0)
        })

    results.sort(key=lambda x: x["minutes"], reverse=True)
    return results


def app_summary(conn: sqlite3.Connection, date_from: str | None = None, date_to: str | None = None) -> list[dict]:
    if not date_from or not date_to:
        date_from, date_to = resolve_date_range("today")

    rows = conn.execute("""
        SELECT app, category, source, started_at, ended_at, idle_seconds
        FROM activities
        WHERE datetime(started_at, 'localtime') BETWEEN datetime(?) AND datetime(?)
    """, (date_from, date_to)).fetchall()

    grouped: dict[tuple[str, str, str], list[tuple[dt.datetime, dt.datetime]]] = {}
    sessions_map: dict[tuple[str, str, str], int] = {}
    idle_map: dict[tuple[str, str, str], float] = {}

    for r in rows:
        key = (r["app"], r["category"], r["source"] or "collector")
        sessions_map[key] = sessions_map.get(key, 0) + 1
        idle_map[key] = idle_map.get(key, 0.0) + (r["idle_seconds"] or 0)
        try:
            s = dt.datetime.fromisoformat(r["started_at"].replace(" ", "T").replace("Z", "+00:00"))
            e = dt.datetime.fromisoformat(r["ended_at"].replace(" ", "T").replace("Z", "+00:00"))
            if e > s:
                grouped.setdefault(key, []).append((s, e))
        except Exception:
            pass

    results = []
    for (app, cat, src), intervals in grouped.items():
        mins = merge_intervals(intervals)
        results.append({
            "app": app,
            "category": cat,
            "source": src,
            "sessions": sessions_map.get((app, cat, src), 0),
            "minutes": round(mins, 1),
            "idle_seconds": idle_map.get((app, cat, src), 0.0)
        })

    results.sort(key=lambda x: x["minutes"], reverse=True)
    return results


def get_hourly_stats(conn: sqlite3.Connection, date_from: str, date_to: str) -> list[dict]:
    rows = conn.execute("""
        SELECT strftime('%H:00', datetime(started_at, 'localtime')) AS hour_slot,
               started_at, ended_at
        FROM activities
        WHERE datetime(started_at, 'localtime') BETWEEN datetime(?) AND datetime(?)
    """, (date_from, date_to)).fetchall()

    slots_map: dict[str, list[tuple[dt.datetime, dt.datetime]]] = {}
    for r in rows:
        slot = r["hour_slot"]
        try:
            s = dt.datetime.fromisoformat(r["started_at"].replace(" ", "T").replace("Z", "+00:00"))
            e = dt.datetime.fromisoformat(r["ended_at"].replace(" ", "T").replace("Z", "+00:00"))
            if e > s:
                slots_map.setdefault(slot, []).append((s, e))
        except Exception:
            pass

    data_map: dict[str, float] = {}
    for slot, intervals in slots_map.items():
        sorted_inv = sorted(intervals, key=lambda x: x[0])
        merged = []
        if sorted_inv:
            cs, ce = sorted_inv[0]
            for s, e in sorted_inv[1:]:
                if s <= ce:
                    ce = max(ce, e)
                else:
                    merged.append((cs, ce))
                    cs, ce = s, e
            merged.append((cs, ce))
        total_mins = sum((e - s).total_seconds() for s, e in merged) / 60.0
        data_map[slot] = min(60.0, round(total_mins, 1))

    result = []
    for h in range(24):
        slot = f"{h:02d}:00"
        result.append({"hour": slot, "minutes": data_map.get(slot, 0.0)})
    return result


def report() -> str:
    conn = connect()
    date_from, date_to = resolve_date_range("today")
    rows = summary(conn, date_from, date_to)
    total = sum(float(row["minutes"] or 0) for row in rows)
    lines = [f"DayLens report — {dt.datetime.now().astimezone().date().isoformat()}", f"Tracked time: {total:.1f} minutes", ""]
    lines += [f"- {row['category']}: {row['minutes']:.1f} min ({row['app']})" for row in rows]
    conn.close()
    return "\n".join(lines)
