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


def to_local_dt(iso_str: str) -> dt.datetime | None:
    if not iso_str:
        return None
    try:
        clean_iso = iso_str.replace(" ", "T")
        if not clean_iso.endswith("Z") and "+" not in clean_iso and "-" not in clean_iso[10:]:
            clean_iso += "Z"
        if clean_iso.endswith("Z"):
            clean_iso = clean_iso[:-1] + "+00:00"
        d = dt.datetime.fromisoformat(clean_iso)
        if d.tzinfo is None:
            d = d.replace(tzinfo=dt.timezone.utc)
        return d.astimezone()
    except Exception:
        return None


def connect(db_path: Path | str | None = None) -> sqlite3.Connection:
    if db_path is None:
        db_path = config.DB_PATH
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
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

    # Performance Indexes
    conn.execute("CREATE INDEX IF NOT EXISTS idx_activities_started ON activities(started_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_activities_app ON activities(app)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_activities_cat ON activities(category)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_activities_source ON activities(source)")

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
        purpose TEXT NOT NULL DEFAULT '',
        target_audience TEXT NOT NULL DEFAULT '',
        subtopics_json TEXT NOT NULL DEFAULT '[]',
        summary TEXT NOT NULL DEFAULT '',
        key_points_json TEXT NOT NULL DEFAULT '[]',
        takeaways_json TEXT NOT NULL DEFAULT '[]',
        chapters_json TEXT NOT NULL DEFAULT '[]',
        keywords_json TEXT NOT NULL DEFAULT '[]',
        learning_label TEXT NOT NULL DEFAULT '',
        confidence REAL NOT NULL DEFAULT 0,
        model_name TEXT NOT NULL DEFAULT '',
        data_hash TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY(video_id) REFERENCES youtube_videos(video_id)
    )""")
    ya_cols = {row["name"] for row in conn.execute("PRAGMA table_info(youtube_analyses)")}
    if "purpose" not in ya_cols:
        conn.execute("ALTER TABLE youtube_analyses ADD COLUMN purpose TEXT NOT NULL DEFAULT ''")
    if "target_audience" not in ya_cols:
        conn.execute("ALTER TABLE youtube_analyses ADD COLUMN target_audience TEXT NOT NULL DEFAULT ''")
    if "takeaways_json" not in ya_cols:
        conn.execute("ALTER TABLE youtube_analyses ADD COLUMN takeaways_json TEXT NOT NULL DEFAULT '[]'")

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
    elif range_type == "all":
        return "1970-01-01 00:00:00", "2099-12-31 23:59:59"
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


def get_all_stats(conn: sqlite3.Connection, range_type: str, custom_date: str | None = None) -> dict:
    date_from, date_to = resolve_date_range(range_type, custom_date)

    if range_type == "all":
        rows = conn.execute("SELECT category, app, source, started_at, ended_at, idle_seconds FROM activities").fetchall()
    else:
        search_start = date_from[:10]
        rows = conn.execute(
            "SELECT category, app, source, started_at, ended_at, idle_seconds FROM activities WHERE started_at >= ?",
            (search_start,)
        ).fetchall()

    try:
        d_start = dt.datetime.strptime(date_from[:10], "%Y-%m-%d").date()
        d_end = dt.datetime.strptime(date_to[:10], "%Y-%m-%d").date()
    except Exception:
        d_start = dt.date.today()
        d_end = dt.date.today()

    is_all_time = range_type == "all"

    app_grouped: dict[tuple[str, str, str], list[tuple[dt.datetime, dt.datetime]]] = {}
    app_sessions: dict[tuple[str, str, str], int] = {}
    app_idle: dict[tuple[str, str, str], float] = {}

    cat_intervals_map: dict[str, list[tuple[dt.datetime, dt.datetime]]] = {}
    hourly_slots_map: dict[str, list[tuple[dt.datetime, dt.datetime]]] = {}
    daily_slots_map: dict[str, list[tuple[dt.datetime, dt.datetime]]] = {}

    all_intervals: list[tuple[dt.datetime, dt.datetime]] = []

    for r in rows:
        s = to_local_dt(r["started_at"])
        e = to_local_dt(r["ended_at"])
        if not s or not e or e <= s:
            continue

        if not is_all_time:
            s_date = s.date()
            if not (d_start <= s_date <= d_end):
                continue

        app = r["app"]
        cat = r["category"]
        src = r["source"] or "collector"
        idle = r["idle_seconds"] or 0

        key = (app, cat, src)
        app_sessions[key] = app_sessions.get(key, 0) + 1
        app_idle[key] = app_idle.get(key, 0.0) + idle

        app_grouped.setdefault(key, []).append((s, e))
        cat_intervals_map.setdefault(cat, []).append((s, e))
        all_intervals.append((s, e))

        # Hour slot in LOCAL TIME (00:00 to 23:00)
        h_slot = f"{s.hour:02d}:00"
        hourly_slots_map.setdefault(h_slot, []).append((s, e))

        # Day slot in LOCAL DATE (YYYY-MM-DD)
        d_slot = s.strftime("%Y-%m-%d")
        daily_slots_map.setdefault(d_slot, []).append((s, e))

    total_min = merge_intervals(all_intervals)

    from daylens.icon_extractor import extract_exe_icon_base64
    apps_list = []
    for (app, cat, src), intervals in app_grouped.items():
        mins = merge_intervals(intervals)
        apps_list.append({
            "category": cat,
            "app": app,
            "source": src,
            "icon": extract_exe_icon_base64(app, conn),
            "minutes": round(mins, 1),
            "sessions": app_sessions.get((app, cat, src), 0)
        })

    apps_list.sort(key=lambda x: x["minutes"], reverse=True)

    cat_breakdown = [
        {"category": cat, "minutes": round(merge_intervals(intervals), 1)}
        for cat, intervals in sorted(
            [(c, ints) for c, ints in cat_intervals_map.items()],
            key=lambda x: merge_intervals(x[1]),
            reverse=True
        )
    ]

    time_series = []
    if range_type in ("7d", "30d"):
        curr = d_start
        while curr <= d_end:
            slot_str = curr.strftime("%Y-%m-%d")
            day_label = curr.strftime("%a %d %b")
            intervals = daily_slots_map.get(slot_str, [])
            mins = merge_intervals(intervals)
            time_series.append({
                "date": slot_str,
                "label": day_label,
                "day_name": curr.strftime("%a"),
                "minutes": round(mins, 1),
                "hours": round(mins / 60.0, 2)
            })
            curr += dt.timedelta(days=1)
    else:
        for h in range(24):
            slot = f"{h:02d}:00"
            intervals = hourly_slots_map.get(slot, [])
            mins = merge_intervals(intervals)
            time_series.append({"hour": slot, "minutes": min(60.0, round(mins, 1))})

    top_app_name = apps_list[0]["app"] if apps_list else None
    top_app_min = apps_list[0]["minutes"] if apps_list else 0
    top_app_icon = apps_list[0]["icon"] if apps_list else None

    from daylens.collector import is_paused
    return {
        "is_paused": is_paused(),
        "range": range_type,
        "total_minutes": round(total_min, 1),
        "total_hours": round(total_min / 60, 1),
        "top_category": cat_breakdown[0]["category"] if cat_breakdown else None,
        "top_app": top_app_name,
        "top_app_minutes": top_app_min,
        "top_app_icon": top_app_icon,
        "categories": apps_list,
        "cat_breakdown": cat_breakdown,
        "hourly": time_series
    }


def summary(conn: sqlite3.Connection, date_from: str | None = None, date_to: str | None = None) -> list[dict]:
    if not date_from or not date_to:
        date_from, date_to = resolve_date_range("today")

    rows = conn.execute("SELECT category, app, started_at, ended_at, idle_seconds FROM activities").fetchall()
    d_start = dt.datetime.strptime(date_from[:10], "%Y-%m-%d").date()
    d_end = dt.datetime.strptime(date_to[:10], "%Y-%m-%d").date()

    grouped: dict[tuple[str, str], list[tuple[dt.datetime, dt.datetime]]] = {}
    sessions_map: dict[tuple[str, str], int] = {}
    idle_map: dict[tuple[str, str], float] = {}

    for r in rows:
        s = to_local_dt(r["started_at"])
        e = to_local_dt(r["ended_at"])
        if not s or not e or e <= s or not (d_start <= s.date() <= d_end):
            continue
        key = (r["category"], r["app"])
        sessions_map[key] = sessions_map.get(key, 0) + 1
        idle_map[key] = idle_map.get(key, 0.0) + (r["idle_seconds"] or 0)
        grouped.setdefault(key, []).append((s, e))

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

    rows = conn.execute("SELECT app, category, source, started_at, ended_at, idle_seconds FROM activities").fetchall()
    d_start = dt.datetime.strptime(date_from[:10], "%Y-%m-%d").date()
    d_end = dt.datetime.strptime(date_to[:10], "%Y-%m-%d").date()

    grouped: dict[tuple[str, str, str], list[tuple[dt.datetime, dt.datetime]]] = {}
    sessions_map: dict[tuple[str, str, str], int] = {}
    idle_map: dict[tuple[str, str, str], float] = {}

    for r in rows:
        s = to_local_dt(r["started_at"])
        e = to_local_dt(r["ended_at"])
        if not s or not e or e <= s or not (d_start <= s.date() <= d_end):
            continue
        key = (r["app"], r["category"], r["source"] or "collector")
        sessions_map[key] = sessions_map.get(key, 0) + 1
        idle_map[key] = idle_map.get(key, 0.0) + (r["idle_seconds"] or 0)
        grouped.setdefault(key, []).append((s, e))

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
    rows = conn.execute("SELECT started_at, ended_at FROM activities").fetchall()
    d_start = dt.datetime.strptime(date_from[:10], "%Y-%m-%d").date()
    d_end = dt.datetime.strptime(date_to[:10], "%Y-%m-%d").date()

    slots_map: dict[str, list[tuple[dt.datetime, dt.datetime]]] = {}
    for r in rows:
        s = to_local_dt(r["started_at"])
        e = to_local_dt(r["ended_at"])
        if not s or not e or e <= s or not (d_start <= s.date() <= d_end):
            continue
        slot = f"{s.hour:02d}:00"
        slots_map.setdefault(slot, []).append((s, e))

    data_map: dict[str, float] = {}
    for slot, intervals in slots_map.items():
        total_mins = merge_intervals(intervals)
        data_map[slot] = min(60.0, round(total_mins, 1))

    result = []
    for h in range(24):
        slot = f"{h:02d}:00"
        result.append({"hour": slot, "minutes": data_map.get(slot, 0.0)})
    return result


def get_daily_stats(conn: sqlite3.Connection, date_from: str, date_to: str) -> list[dict]:
    rows = conn.execute("SELECT started_at, ended_at FROM activities").fetchall()
    d_start = dt.datetime.strptime(date_from[:10], "%Y-%m-%d").date()
    d_end = dt.datetime.strptime(date_to[:10], "%Y-%m-%d").date()

    slots_map: dict[str, list[tuple[dt.datetime, dt.datetime]]] = {}
    for r in rows:
        s = to_local_dt(r["started_at"])
        e = to_local_dt(r["ended_at"])
        if not s or not e or e <= s or not (d_start <= s.date() <= d_end):
            continue
        slot = s.strftime("%Y-%m-%d")
        slots_map.setdefault(slot, []).append((s, e))

    data_map: dict[str, float] = {}
    for slot, intervals in slots_map.items():
        total_mins = merge_intervals(intervals)
        data_map[slot] = round(total_mins, 1)

    result = []
    curr = d_start
    while curr <= d_end:
        slot_str = curr.strftime("%Y-%m-%d")
        day_label = curr.strftime("%a %d %b")
        mins = data_map.get(slot_str, 0.0)
        result.append({
            "date": slot_str,
            "label": day_label,
            "day_name": curr.strftime("%a"),
            "minutes": mins,
            "hours": round(mins / 60.0, 2)
        })
        curr += dt.timedelta(days=1)
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
