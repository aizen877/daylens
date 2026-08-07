"""HTTP server and REST API handler for the DayLens analytics dashboard."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from daylens.categorizer import get_category_rules, save_category_rule
from daylens.collector import is_paused, set_paused
from daylens.db import app_summary, connect, get_hourly_stats, resolve_date_range, summary
from daylens.icon_extractor import extract_exe_icon_base64, fetch_channel_avatar, fetch_yt_video_duration

WEB_DIR = Path(__file__).parent / "web"


def load_web_file(filename: str) -> bytes:
    file_path = WEB_DIR / filename
    if file_path.exists():
        return file_path.read_bytes()
    return b""


def _get_dashboard_html() -> str:
    return load_web_file("index.html").decode("utf-8", errors="replace")


DASHBOARD_HTML_SHELL = _get_dashboard_html()

ALLOWED_CONNECTOR_SOURCES = {"chrome", "brave", "firefox", "youtube"}
BLOCKED_DOMAIN_PARTS: tuple[str, ...] = ()


def normalize_ingest_payload(payload: dict) -> dict:
    """Validate and minimize a browser event before it reaches SQLite."""
    if not isinstance(payload, dict):
        raise ValueError("payload must be an object")
    source = str(payload.get("source", "")).strip().lower()
    if source not in ALLOWED_CONNECTOR_SOURCES:
        raise ValueError("unsupported source")
    event_type = str(payload.get("event_type", "active_tab")).strip().lower()
    if event_type not in {"active_tab", "tab_closed", "heartbeat", "youtube_play", "youtube_pause", "youtube_heartbeat"}:
        raise ValueError("unsupported event_type")
    domain = str(payload.get("domain", "")).strip().lower().split("/", 1)[0]
    domain = re.sub(r"^www\.", "", domain)
    if not domain or len(domain) > 253 or not re.fullmatch(r"[a-z0-9.-]+", domain):
        raise ValueError("invalid domain")
    if BLOCKED_DOMAIN_PARTS and any(part in domain for part in BLOCKED_DOMAIN_PARTS):
        raise ValueError("blocked sensitive domain")
    title = re.sub(r"[\x00-\x1f\x7f]", "", str(payload.get("title", ""))).strip()[:300]
    fav_icon_url = str(payload.get("favIconUrl") or payload.get("icon") or "").strip()
    if fav_icon_url and not (fav_icon_url.startswith("http://") or fav_icon_url.startswith("https://") or fav_icon_url.startswith("data:image/")):
        fav_icon_url = ""
    is_incognito = bool(payload.get("is_incognito", False))
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    started = str(payload.get("started_at") or now)
    ended = str(payload.get("ended_at") or now)
    for value in (started, ended):
        try:
            datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("invalid timestamp") from exc
    return {
        "source": source,
        "event_type": event_type,
        "domain": domain,
        "title": title,
        "favIconUrl": fav_icon_url[:1000],
        "is_incognito": is_incognito,
        "started_at": started,
        "ended_at": ended,
        "video_id": re.sub(r"[^A-Za-z0-9_-]", "", str(payload.get("video_id", "")))[:32],
        "channel": re.sub(r"[\x00-\x1f\x7f]", "", str(payload.get("channel", ""))).strip()[:200],
        "video_type": str(payload.get("video_type", "long")) if str(payload.get("video_type", "long")) in {"long", "short"} else "long",
        "position_seconds": max(0, min(86400, int(payload.get("position_seconds", 0) or 0))),
        "duration_seconds": max(0, min(864000, int(payload.get("duration_seconds", 0) or 0))),
        "actual_watch_seconds": max(0, min(86400, int(payload.get("actual_watch_seconds", 0) or 0))),
        "channel_icon": str(payload.get("channel_icon", "")).strip()[:500],
        "tags": [str(t)[:40] for t in payload.get("tags", [])] if isinstance(payload.get("tags"), list) else [],
    }


def ingest_event(payload: dict) -> dict:
    event = normalize_ingest_payload(payload)
    conn = connect()
    try:
        from datetime import timedelta

        try:
            t_start = datetime.fromisoformat(event["started_at"].replace(" ", "T").replace("Z", "+00:00"))
            t_end = datetime.fromisoformat(event["ended_at"].replace(" ", "T").replace("Z", "+00:00"))
            if t_start >= t_end:
                watch_dur = int(event.get("actual_watch_seconds", 0))
                if watch_dur <= 0:
                    watch_dur = 5 if event["domain"] == "youtube.com" else 30
                t_end = t_start + timedelta(seconds=watch_dur)
                event["ended_at"] = t_end.isoformat()
        except Exception:
            pass

        metadata = {
            "domain": event["domain"],
            "event_type": event["event_type"],
            "favIconUrl": event.get("favIconUrl", ""),
            "is_incognito": event.get("is_incognito", False),
            "video_id": event.get("video_id", ""),
            "channel": event.get("channel", ""),
            "channel_icon": event.get("channel_icon", ""),
            "video_type": event.get("video_type", ""),
            "position_seconds": event.get("position_seconds", 0),
            "duration_seconds": event.get("duration_seconds", 0),
            "actual_watch_seconds": event.get("actual_watch_seconds", 0),
            "tags": event.get("tags", []),
        }
        title_prefix = "[Private] " if event.get("is_incognito") and not event["title"].startswith("[Private]") else ""
        full_title = f"{title_prefix}{event['title']}".strip()

        if event["source"] == "youtube" and event.get("video_id"):
            now_iso = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
            video_url = f"https://www.youtube.com/watch?v={event['video_id']}"
            # thumbnail_url stores the VIDEO thumbnail (favIconUrl), not the channel avatar
            conn.execute("""INSERT INTO youtube_videos(video_id, url, title, channel_name, duration_seconds, video_type, thumbnail_url, transcript_status, analysis_status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'unknown', 'pending', ?, ?)
                ON CONFLICT(video_id) DO UPDATE SET title=excluded.title, channel_name=excluded.channel_name, duration_seconds=MAX(youtube_videos.duration_seconds, excluded.duration_seconds), video_type=excluded.video_type, thumbnail_url=excluded.thumbnail_url, updated_at=excluded.updated_at""",
                (event["video_id"], video_url, event["title"], event.get("channel", ""), event.get("duration_seconds", 0), event.get("video_type", "long"), event.get("favIconUrl", ""), now_iso, now_iso))
            conn.commit()

        # Update and extend active session's ended_at timestamp in real time
        try:
            prev_row = conn.execute("""
                SELECT id, started_at, app, source, metadata_json FROM activities 
                ORDER BY id DESC LIMIT 1
            """).fetchone()
            if prev_row and prev_row["app"] == event["domain"] and prev_row["source"] == event["source"]:
                old_meta = json.loads(prev_row["metadata_json"] or "{}")
                # Do not merge YouTube events if video_id has changed
                if event["source"] == "youtube" and event.get("video_id") and old_meta.get("video_id") and old_meta.get("video_id") != event.get("video_id"):
                    pass
                else:
                    p_start = datetime.fromisoformat(prev_row["started_at"].replace(" ", "T").replace("Z", "+00:00"))
                    n_end = datetime.fromisoformat(event["ended_at"].replace(" ", "T").replace("Z", "+00:00"))
                    if (n_end - p_start).total_seconds() < 7200:
                        # Preserve the maximum actual_watch_seconds across heartbeats
                        try:
                            old_watch = int(old_meta.get("actual_watch_seconds", 0) or 0)
                            new_watch = int(metadata.get("actual_watch_seconds", 0) or 0)
                            metadata["actual_watch_seconds"] = max(old_watch, new_watch)
                            # Also preserve max position_seconds
                            old_pos = int(old_meta.get("position_seconds", 0) or 0)
                            new_pos = int(metadata.get("position_seconds", 0) or 0)
                            metadata["position_seconds"] = max(old_pos, new_pos)
                        except Exception:
                            pass
                        conn.execute("UPDATE activities SET ended_at = ?, window_title = ?, metadata_json = ? WHERE id = ?", (event["ended_at"], full_title, json.dumps(metadata), prev_row["id"]))
                        conn.commit()
                        return {"accepted": True, "source": event["source"], "domain": event["domain"], "updated": True}
        except Exception:
            pass

        from daylens.db import add_activity
        add_activity(conn, event["started_at"], event["ended_at"], event["domain"], full_title, 0, event["source"], metadata)
        if event["source"] == "youtube" and event.get("video_id"):
            conn.execute("""INSERT INTO youtube_watch_sessions(video_id, started_at, ended_at, watch_seconds, last_position_seconds, completed)
                VALUES (?, ?, ?, ?, ?, ?)""", (event["video_id"], event["started_at"], event["ended_at"], event.get("actual_watch_seconds", 0), event.get("position_seconds", 0), 1 if event["event_type"] == "youtube_pause" else 0))
            conn.commit()
        return {"accepted": True, "source": event["source"], "domain": event["domain"]}
    finally:
        conn.close()


def consolidate_activities(rows: list, conn) -> list[dict]:
    if not rows:
        return []

    consolidated: list[dict] = []
    current: dict | None = None

    for r in rows:
        app = r["app"]
        title = r["window_title"]
        cat = r["category"]
        started = r["started_at"]
        ended = r["ended_at"]
        idle = int(r["idle_seconds"] or 0)

        if current is None:
            current = {
                "id": r["id"],
                "started_at": started,
                "ended_at": ended,
                "app": app,
                "window_title": title,
                "category": cat,
                "source": r["source"] or "collector",
                "metadata_json": r["metadata_json"] or "{}",
                "idle_seconds": idle,
                "samples_count": 1,
            }
        elif current["app"] == app and current["window_title"] == title and current["category"] == cat and current["source"] == (r["source"] or "collector"):
            current["started_at"] = min(current["started_at"], started)
            current["ended_at"] = max(current["ended_at"], ended)
            current["idle_seconds"] += idle
            current["samples_count"] += 1
        else:
            consolidated.append(current)
            current = {
                "id": r["id"],
                "started_at": started,
                "ended_at": ended,
                "app": app,
                "window_title": title,
                "category": cat,
                "source": r["source"] or "collector",
                "metadata_json": r["metadata_json"] or "{}",
                "idle_seconds": idle,
                "samples_count": 1,
            }

    if current:
        consolidated.append(current)

    result = []
    for item in consolidated:
        try:
            t_start = datetime.fromisoformat(item["started_at"].replace(" ", "T"))
            t_end = datetime.fromisoformat(item["ended_at"].replace(" ", "T"))
            diff_sec = max(5, int((t_end - t_start).total_seconds()))
            dur_min = round(diff_sec / 60.0, 2)
        except Exception:
            dur_min = round(item["samples_count"] * 5 / 60.0, 2)

        item["duration_minutes"] = dur_min
        item["metadata"] = json.loads(item.get("metadata_json") or "{}") if isinstance(item.get("metadata_json"), str) else {}
        fav_url = item["metadata"].get("favIconUrl") if isinstance(item.get("metadata"), dict) else None
        item["icon"] = fav_url or extract_exe_icon_base64(item["app"], conn)
        result.append(item)

    return result


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)

        if path == "/" or path == "/index.html":
            body = load_web_file("index.html")
            self.send_file(body, "text/html; charset=utf-8")
            return

        if path == "/styles.css":
            body = load_web_file("styles.css")
            self.send_file(body, "text/css; charset=utf-8")
            return

        if path == "/app.js":
            body = load_web_file("app.js")
            self.send_file(body, "application/javascript; charset=utf-8")
            return

        if path == "/api/screen":
            try:
                import io
                from PIL import ImageGrab
                img = ImageGrab.grab()
                img.thumbnail((1280, 720))
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=75)
                self.send_file(buf.getvalue(), "image/jpeg")
            except Exception as exc:
                self.send_json({"error": f"Screen capture failed: {exc}"}, status=500)
            return

        conn = connect()
        try:
            if path == "/api/icon":
                app_name = params.get("app", [""])[0].strip()
                icon_data = extract_exe_icon_base64(app_name, conn) if app_name else None
                self.send_json({"app": app_name, "icon": icon_data})
                return

            if path == "/api/youtube":
                range_type = params.get("range", ["today"])[0]
                custom_date = params.get("date", [None])[0]
                date_from, date_to = resolve_date_range(range_type, custom_date)
                rows = conn.execute("SELECT started_at, ended_at, window_title, metadata_json FROM activities WHERE source = 'youtube' AND datetime(started_at, 'localtime') BETWEEN datetime(?) AND datetime(?) ORDER BY started_at DESC LIMIT 200", (date_from, date_to)).fetchall()
                
                items_map = {}
                long_videos = set()
                shorts = set()
                
                for row in rows:
                    meta = json.loads(row["metadata_json"] or "{}")
                    vid = meta.get("video_id") or row["window_title"]
                    vtype = meta.get("video_type", "long")
                    (shorts if vtype == "short" else long_videos).add(vid)
                    
                    if vid not in items_map:
                        w_sec = 0
                        if "actual_watch_seconds" in meta and meta["actual_watch_seconds"] is not None:
                            w_sec = int(meta["actual_watch_seconds"])
                        else:
                            try:
                                start = datetime.fromisoformat(row["started_at"].replace(" ", "T").replace("Z", "+00:00"))
                                end = datetime.fromisoformat(row["ended_at"].replace(" ", "T").replace("Z", "+00:00"))
                                w_sec = int(max(0.0, min(300.0, (end - start).total_seconds())))
                            except Exception:
                                w_sec = 0

                        items_map[vid] = {
                            "title": row["window_title"],
                            "channel": meta.get("channel", "YouTube Channel"),
                            "channel_icon": meta.get("channel_icon", ""),
                            "tags": meta.get("tags") or [],
                            "meta": meta,
                            "video_type": vtype,
                            "video_id": meta.get("video_id", ""),
                            "position_seconds": meta.get("position_seconds", 0),
                            "duration_seconds": meta.get("duration_seconds", 0),
                            "watch_seconds": w_sec,
                            "watch_minutes": round(w_sec / 60.0, 2)
                        }
                    else:
                        items_map[vid]["position_seconds"] = max(items_map[vid]["position_seconds"], meta.get("position_seconds", 0))
                        if meta.get("duration_seconds"):
                            items_map[vid]["duration_seconds"] = max(items_map[vid]["duration_seconds"], meta.get("duration_seconds", 0))
                        # Rows come newest-first; keep the MOST RECENT non-empty
                        # channel icon instead of letting older rows overwrite it.
                        if not items_map[vid]["channel_icon"] and meta.get("channel_icon"):
                            items_map[vid]["channel_icon"] = meta["channel_icon"]
                        if not items_map[vid].get("tags") and meta.get("tags"):
                            items_map[vid]["tags"] = meta["tags"]
                        w_sec = 0
                        if "actual_watch_seconds" in meta and meta["actual_watch_seconds"] is not None:
                            w_sec = int(meta["actual_watch_seconds"])
                        items_map[vid]["watch_seconds"] = max(items_map[vid]["watch_seconds"], w_sec)
                        items_map[vid]["watch_minutes"] = round(items_map[vid]["watch_seconds"] / 60.0, 2)

                items_list = list(items_map.values())
                total_seconds = sum(item["watch_seconds"] for item in items_list)

                # Aggregate top channels & topics
                channels_map = {}
                topics_map = {
                    "Coding & Tech": 0,
                    "AI & Tools": 0,
                    "Entertainment & Stories": 0,
                    "Gaming & Live": 0,
                    "Other Topics": 0,
                }
                for item in items_list:
                    ch_name = item.get("channel") or "YouTube Channel"
                    ch_icon = item.get("channel_icon", "")
                    if ch_name not in channels_map:
                        channels_map[ch_name] = {
                            "channel": ch_name,
                            "channel_icon": ch_icon,
                            "watch_seconds": item["watch_seconds"],
                            "video_count": 1,
                        }
                    else:
                        channels_map[ch_name]["watch_seconds"] += item["watch_seconds"]
                        channels_map[ch_name]["video_count"] += 1
                        if ch_icon and not channels_map[ch_name]["channel_icon"]:
                            channels_map[ch_name]["channel_icon"] = ch_icon

                    t_lower = (item.get("title") or "").lower()
                    if any(w in t_lower for w in ["python", "code", "ai", "llm", "claude", "dev", "programming", "software", "website"]):
                        topics_map["Coding & Tech"] += item["watch_seconds"]
                    elif any(w in t_lower for w in ["game", "free fire", "ffws", "live", "pubg", "gameplay"]):
                        topics_map["Gaming & Live"] += item["watch_seconds"]
                    elif any(w in t_lower for w in ["cartoon", "story", "gopal", "rhyme", "movie", "bengali"]):
                        topics_map["Entertainment & Stories"] += item["watch_seconds"]
                    else:
                        topics_map["Other Topics"] += item["watch_seconds"]

                for ch_info in channels_map.values():
                    if not ch_info["channel_icon"] and ch_info["channel"] and ch_info["channel"] != "YouTube Channel":
                        ch_info["channel_icon"] = fetch_channel_avatar(ch_info["channel"], conn) or ""

                for item in items_list:
                    if not item.get("channel_icon") and item.get("channel") and item.get("channel") != "YouTube Channel":
                        item["channel_icon"] = fetch_channel_avatar(item["channel"], conn) or ""
                    if not item.get("duration_seconds") and item.get("video_id"):
                        item["duration_seconds"] = fetch_yt_video_duration(item["video_id"], conn) or 0
                    raw_tags = item.get("tags") or []
                    if not raw_tags:
                        t_words = [w.strip("#,.!\"'?").lower() for w in item.get("title", "").split() if len(w) > 3]
                        raw_tags = [f"#{w}" for w in t_words[:6]]
                    item["tags"] = raw_tags
                    if item.get("video_id"):
                        item_meta = item.get("meta") or {}
                        v_meta = conn.execute("SELECT description, transcript_status, analysis_status FROM youtube_videos WHERE video_id = ?", (item["video_id"],)).fetchone()
                        if v_meta:
                            item["description"] = v_meta["description"] or item_meta.get("description", "")
                            item["transcript_status"] = v_meta["transcript_status"] or "unknown"
                            item["analysis_status"] = v_meta["analysis_status"] or "pending"
                        else:
                            item["description"] = item_meta.get("description", "")
                            item["transcript_status"] = "unknown"
                            item["analysis_status"] = "pending"

                valid_channels = [c for c in channels_map.values() if c["channel"] and c["channel"] != "YouTube Channel" and c["watch_seconds"] > 0]
                if not valid_channels:
                    valid_channels = [c for c in channels_map.values() if c["channel"] and c["channel"] != "YouTube Channel"]
                top_channels = sorted(valid_channels, key=lambda x: (x["watch_seconds"], x["video_count"]), reverse=True)[:5]
                top_topics = [{"topic": k, "seconds": v} for k, v in topics_map.items() if v > 0]
                top_topics.sort(key=lambda x: x["seconds"], reverse=True)

                self.send_json({
                    "total_minutes": round(total_seconds / 60.0, 2),
                    "total_seconds": total_seconds,
                    "long_videos": len(long_videos),
                    "shorts": len(shorts),
                    "top_channels": top_channels,
                    "top_topics": top_topics,
                    "items": items_list
                })
                return

            if path == "/api/youtube/transcript":
                v_id = params.get("video_id", [""])[0].strip()
                if not v_id:
                    self.send_json({"error": "video_id is required"}, status=400)
                    return
                
                row = conn.execute("SELECT status, language, transcript_type, full_text, segments_json, retrieved_at FROM youtube_transcripts WHERE video_id = ?", (v_id,)).fetchone()
                if row and row["full_text"] and not row["full_text"].startswith("Welcome to this video"):
                    self.send_json({
                        "video_id": v_id,
                        "status": row["status"] or "available",
                        "language": row["language"] or "en",
                        "transcript_type": row["transcript_type"] or "auto",
                        "full_text": row["full_text"],
                        "segments": json.loads(row["segments_json"] or "[]"),
                        "retrieved_at": row["retrieved_at"]
                    })
                    return

                # Fetch real transcript using YouTubeTranscriptApi
                real_segments = []
                real_full_text = ""
                trans_status = "unavailable"
                try:
                    from youtube_transcript_api import YouTubeTranscriptApi
                    fetched = YouTubeTranscriptApi().fetch(v_id)
                    full_text_parts = []
                    for item in fetched:
                        st = round(item.start, 1)
                        dur = round(item.duration, 1)
                        txt = item.text.strip()
                        if txt:
                            real_segments.append({"start": st, "duration": dur, "text": txt})
                            full_text_parts.append(txt)
                    real_full_text = " ".join(full_text_parts)
                    if real_segments:
                        trans_status = "available"
                except Exception as exc:
                    v_meta = conn.execute("SELECT title, channel_name FROM youtube_videos WHERE video_id = ?", (v_id,)).fetchone()
                    v_title = v_meta["title"] if v_meta and v_meta["title"] else f"Video {v_id}"
                    v_channel = v_meta["channel_name"] if v_meta and v_meta["channel_name"] else "YouTube"
                    real_segments = [
                        {"start": 0, "duration": 15, "text": f"Subtitle unavailable via API for: {v_title}"},
                        {"start": 15, "duration": 30, "text": f"Watch directly on {v_channel} with auto-captions enabled."}
                    ]
                    real_full_text = " ".join(s["text"] for s in real_segments)
                    trans_status = "unavailable"

                now_iso = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
                conn.execute("""INSERT INTO youtube_transcripts(video_id, status, language, transcript_type, full_text, segments_json, retrieved_at)
                    VALUES (?, ?, 'en', 'auto', ?, ?, ?)
                    ON CONFLICT(video_id) DO UPDATE SET status=excluded.status, full_text=excluded.full_text, segments_json=excluded.segments_json, retrieved_at=excluded.retrieved_at""",
                    (v_id, trans_status, real_full_text, json.dumps(real_segments), now_iso))
                conn.execute("UPDATE youtube_videos SET transcript_status=?, updated_at=? WHERE video_id=?", (trans_status, now_iso, v_id))
                conn.commit()
                
                self.send_json({
                    "video_id": v_id,
                    "status": trans_status,
                    "language": "en",
                    "transcript_type": "auto",
                    "full_text": real_full_text,
                    "segments": real_segments,
                    "retrieved_at": now_iso
                })
                return

            if path == "/api/stats":
                range_type = params.get("range", ["today"])[0]
                custom_date = params.get("date", [None])[0]
                from daylens.db import get_all_stats
                payload = get_all_stats(conn, range_type, custom_date)
                self.send_json(payload)
                return
                return

            if path == "/api/activities":
                range_type = params.get("range", ["today"])[0]
                custom_date = params.get("date", [None])[0]
                cat_filter = params.get("category", ["all"])[0]
                search_q = params.get("q", [""])[0].strip().lower()
                page = max(1, int(params.get("page", [1])[0]))
                limit = max(1, min(100, int(params.get("limit", [20])[0])))
                offset = (page - 1) * limit

                date_from, date_to = resolve_date_range(range_type, custom_date)

                sql = """
                    SELECT id, started_at, ended_at, app, window_title, category, idle_seconds, source, metadata_json
                    FROM activities
                    WHERE datetime(started_at, 'localtime') BETWEEN datetime(?) AND datetime(?)
                """
                query_args: list[str | int] = [date_from, date_to]

                if cat_filter and cat_filter != "all":
                    sql += " AND category = ?"
                    query_args.append(cat_filter)

                if search_q:
                    sql += " AND (LOWER(app) LIKE ? OR LOWER(window_title) LIKE ?)"
                    query_args.extend([f"%{search_q}%", f"%{search_q}%"])

                sql += " ORDER BY started_at DESC LIMIT ? OFFSET ?"
                fetch_limit = limit * 10
                query_args.extend([fetch_limit, offset])

                raw_rows = conn.execute(sql, query_args).fetchall()
                consolidated = consolidate_activities(raw_rows, conn)

                has_more = len(consolidated) > limit
                result_items = consolidated[:limit]

                self.send_json({"items": result_items, "page": page, "limit": limit, "has_more": has_more})
                return

            if path == "/api/categories":
                rules = get_category_rules(conn)
                self.send_json(rules)
                return

            self.send_error(404)
        finally:
            conn.close()

    def do_POST(self):  # noqa: N802
        path = urlparse(self.path).path
        content_length = int(self.headers.get("Content-Length", 0))
        body_bytes = self.rfile.read(content_length) if content_length > 0 else b""

        if path == "/api/ingest":
            try:
                data = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
                self.send_json(ingest_event(data))
            except (ValueError, json.JSONDecodeError) as exc:
                self.send_json({"accepted": False, "error": str(exc)}, status=400)
            return

        if path == "/api/toggle-pause":
            new_state = set_paused(not is_paused())
            self.send_json({"is_paused": new_state})
            return

        if path == "/api/categories":
            conn = connect()
            try:
                data = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
                cat = data.get("category", "").strip()
                kw = data.get("keywords", "").strip()
                if cat and kw:
                    save_category_rule(conn, cat, kw)
                rules = get_category_rules(conn)
                self.send_json(rules)
            finally:
                conn.close()
            return

        if path == "/api/youtube/clear":
            conn = connect()
            try:
                conn.execute("DELETE FROM activities WHERE source = 'youtube'")
                conn.execute("DELETE FROM youtube_videos")
                conn.execute("DELETE FROM youtube_watch_sessions")
                conn.execute("DELETE FROM youtube_transcripts")
                conn.execute("DELETE FROM youtube_analyses")
                conn.commit()
                self.send_json({"success": True, "message": "Cleared YouTube activities"})
            finally:
                conn.close()
            return

        if path == "/api/youtube/transcript":
            conn = connect()
            try:
                data = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
                v_id = str(data.get("video_id", "")).strip()
                full_text = str(data.get("full_text", "")).strip()
                segments = data.get("segments", [])
                if not v_id or not full_text:
                    self.send_json({"error": "video_id and full_text are required"}, status=400)
                    return
                now_iso = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
                conn.execute("""INSERT INTO youtube_transcripts(video_id, status, language, transcript_type, full_text, segments_json, retrieved_at)
                    VALUES (?, 'available', 'en', 'manual', ?, ?, ?)
                    ON CONFLICT(video_id) DO UPDATE SET status='available', full_text=excluded.full_text, segments_json=excluded.segments_json, retrieved_at=excluded.retrieved_at""",
                    (v_id, full_text, json.dumps(segments if isinstance(segments, list) else []), now_iso))
                conn.execute("UPDATE youtube_videos SET transcript_status='available', updated_at=? WHERE video_id=?", (now_iso, v_id))
                conn.commit()
                self.send_json({"success": True, "video_id": v_id, "status": "available"})
            finally:
                conn.close()
            return

        self.send_error(404)

    def send_file(self, content: bytes, content_type: str, status: int = 200) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def send_json(self, data: dict | list, status: int = 200) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        return
