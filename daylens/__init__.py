"""DayLens privacy-first activity tracker package."""
from daylens.categorizer import categorize, get_category_rules, save_category_rule
from daylens.collector import demo, is_paused, set_paused, track, windows_state
from daylens.config import DB_PATH, ROOT
from daylens.db import add_activity, connect, get_hourly_stats, report, resolve_date_range, summary
from daylens.icon_extractor import extract_exe_icon_base64

__all__ = [
    "ROOT",
    "DB_PATH",
    "connect",
    "add_activity",
    "summary",
    "report",
    "resolve_date_range",
    "get_hourly_stats",
    "categorize",
    "get_category_rules",
    "save_category_rule",
    "track",
    "demo",
    "is_paused",
    "set_paused",
    "windows_state",
    "extract_exe_icon_base64",
]
