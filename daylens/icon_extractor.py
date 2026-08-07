"""Extract embedded 32x32 icons directly from Windows .exe application binaries."""
from __future__ import annotations

import base64
import ctypes
import ctypes.wintypes as wintypes
import os

import sqlite3
import sys
from io import BytesIO
from typing import Dict, Optional

try:
    from PIL import Image
except ImportError:
    Image = None

_ICON_CACHE: Dict[str, str] = {}


def get_exe_path(app_name: str, skip_psutil: bool = True) -> Optional[str]:
    if sys.platform != "win32":
        return None

    app_clean = app_name.strip()
    app_lower = app_clean.lower()

    # 1. Check common Windows system & program directories first (fastest file system check)
    system_root = os.environ.get("SystemRoot", r"C:\Windows")
    program_files = os.environ.get("ProgramFiles", r"C:\Program Files")
    program_files_x86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    app_data = os.environ.get("APPDATA", "")

    candidates = [
        os.path.join(local_app_data, "Programs", "Antigravity", app_clean),
        os.path.join(system_root, app_clean),
        os.path.join(system_root, "System32", app_clean),
        os.path.join(program_files, "Google", "Chrome", "Application", app_clean),
        os.path.join(program_files_x86, "Google", "Chrome", "Application", app_clean),
        os.path.join(program_files, "BraveSoftware", "Brave-Browser", "Application", app_clean),
        os.path.join(local_app_data, "Programs", "Microsoft VS Code", app_clean),
        os.path.join(app_data, "Telegram Desktop", app_clean),
        os.path.join(program_files, app_clean),
        os.path.join(program_files_x86, app_clean),
    ]

    for candidate in candidates:
        if candidate and os.path.exists(candidate) and os.path.isfile(candidate):
            return candidate

    return None


def extract_exe_icon_base64(app_name: str, conn: Optional[sqlite3.Connection] = None) -> Optional[str]:
    app_clean = app_name.strip()
    if not app_clean:
        return None

    if app_clean in _ICON_CACHE:
        return _ICON_CACHE[app_clean]

    if conn:
        try:
            row = conn.execute("SELECT icon_data FROM app_icons WHERE app = ?", (app_clean,)).fetchone()
            if row and row["icon_data"]:
                _ICON_CACHE[app_clean] = row["icon_data"]
                return row["icon_data"]
        except Exception:
            pass

    if sys.platform != "win32" or Image is None:
        return None

    path = get_exe_path(app_clean, skip_psutil=True)
    if not path:
        return None

    try:
        user32 = ctypes.windll.user32
        gdi32 = ctypes.windll.gdi32
        shell32 = ctypes.windll.shell32

        SHGFI_ICON = 0x000000100
        SHGFI_LARGEICON = 0x000000000

        class SHFILEINFO(ctypes.Structure):
            _fields_ = [
                ("hIcon", wintypes.HICON),
                ("iIcon", ctypes.c_int),
                ("dwAttributes", wintypes.DWORD),
                ("szDisplayName", wintypes.WCHAR * 260),
                ("szTypeName", wintypes.WCHAR * 80),
            ]

        shfi = SHFILEINFO()
        res = shell32.SHGetFileInfoW(path, 0, ctypes.byref(shfi), ctypes.sizeof(shfi), SHGFI_ICON | SHGFI_LARGEICON)
        if not res or not shfi.hIcon:
            return None

        hdc = user32.GetDC(0)
        memdc = gdi32.CreateCompatibleDC(hdc)
        hbitmap = gdi32.CreateCompatibleBitmap(hdc, 32, 32)
        oldbmp = gdi32.SelectObject(memdc, hbitmap)

        user32.DrawIconEx(memdc, 0, 0, shfi.hIcon, 32, 32, 0, 0, 3)

        class BITMAPINFOHEADER(ctypes.Structure):
            _fields_ = [
                ("biSize", wintypes.DWORD),
                ("biWidth", ctypes.c_long),
                ("biHeight", ctypes.c_long),
                ("biPlanes", wintypes.WORD),
                ("biBitCount", wintypes.WORD),
                ("biCompression", wintypes.DWORD),
                ("biSizeImage", wintypes.DWORD),
                ("biXPelsPerMeter", ctypes.c_long),
                ("biYPelsPerMeter", ctypes.c_long),
                ("biClrUsed", wintypes.DWORD),
                ("biClrImportant", wintypes.DWORD),
            ]

        bmi = BITMAPINFOHEADER()
        bmi.biSize = ctypes.sizeof(BITMAPINFOHEADER)
        bmi.biWidth = 32
        bmi.biHeight = -32
        bmi.biPlanes = 1
        bmi.biBitCount = 32
        bmi.biCompression = 0

        buf = ctypes.create_string_buffer(32 * 32 * 4)
        gdi32.GetDIBits(memdc, hbitmap, 0, 32, buf, ctypes.byref(bmi), 0)

        gdi32.SelectObject(memdc, oldbmp)
        gdi32.DeleteObject(hbitmap)
        gdi32.DeleteDC(memdc)
        user32.ReleaseDC(0, hdc)
        user32.DestroyIcon(shfi.hIcon)

        img = Image.frombytes("RGBA", (32, 32), buf.raw, "raw", "BGRA")
        bio = BytesIO()
        img.save(bio, format="PNG")
        data_uri = "data:image/png;base64," + base64.b64encode(bio.getvalue()).decode("utf-8")

        _ICON_CACHE[app_clean] = data_uri

        if conn:
            try:
                conn.execute("INSERT OR REPLACE INTO app_icons(app, icon_data) VALUES (?, ?)", (app_clean, data_uri))
                conn.commit()
            except Exception:
                pass

        return data_uri
    except Exception:
        return None


_CHANNEL_AVATAR_CACHE: Dict[str, str] = {}


def fetch_channel_avatar(channel_name: str, conn: Optional[sqlite3.Connection] = None) -> Optional[str]:
    ch_clean = channel_name.strip()
    if not ch_clean or ch_clean == "YouTube Channel":
        return None

    if ch_clean in _CHANNEL_AVATAR_CACHE:
        return _CHANNEL_AVATAR_CACHE[ch_clean]

    if conn:
        try:
            row = conn.execute("SELECT icon_data FROM app_icons WHERE app = ?", (f"yt_ch_{ch_clean}",)).fetchone()
            if row and row["icon_data"]:
                _CHANNEL_AVATAR_CACHE[ch_clean] = row["icon_data"]
                return row["icon_data"]
        except Exception:
            pass

    # Try to fetch the REAL channel avatar via YouTube oEmbed (channel URL -> avatar),
    # then fall back to a deterministic initials badge. Result is cached in SQLite so
    # the network is hit at most once per channel.
    import json
    import urllib.parse
    import urllib.request

    import re

    avatar_url = None
    try:
        handle = ch_clean.replace(" ", "")
        oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/@{urllib.parse.quote(handle)}&format=json"
        req = urllib.request.Request(oembed_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode())
            if data.get("thumbnail_url"):
                avatar_url = str(data["thumbnail_url"]).split("?")[0]
    except Exception:
        pass

    # oEmbed often 404s on @handle URLs; fall back to scraping the search page
    # for a yt3.ggpht.com channel avatar.
    if not avatar_url:
        try:
            search_url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(ch_clean)}"
            req = urllib.request.Request(
                search_url,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                html = resp.read().decode("utf-8", errors="ignore")
            found = re.findall(r"https://yt3\.ggpht\.com/[a-zA-Z0-9_\-=/]+", html)
            # Prefer avatar URLs (square-crop marker) over channel banners
            avatarish = [u for u in found if "-c-k-c0x00ffffff" in u] or found
            if avatarish:
                base = avatarish[0].split("=")[0]
                avatar_url = base + "=s176-c-k-c0x00ffffff-no-rj"
        except Exception:
            pass

    if not avatar_url:
        avatar_url = f"https://ui-avatars.com/api/?name={urllib.parse.quote(ch_clean)}&background=f97316&color=fff&bold=true&rounded=true"

    _CHANNEL_AVATAR_CACHE[ch_clean] = avatar_url

    # Persist only REAL avatars so a temporary lookup failure never permanently
    # pins the initials fallback; the in-memory cache still avoids re-scraping
    # per request within this process.
    if conn and avatar_url and "yt3.ggpht.com" in avatar_url:
        try:
            conn.execute("INSERT OR REPLACE INTO app_icons(app, icon_data) VALUES (?, ?)", (f"yt_ch_{ch_clean}", avatar_url))
            conn.commit()
        except Exception:
            pass

    return avatar_url


_VIDEO_DURATION_CACHE: Dict[str, int] = {}


def fetch_yt_video_duration(video_id: str, conn: Optional[sqlite3.Connection] = None) -> int:
    vid = video_id.strip()
    if not vid:
        return 0

    if vid in _VIDEO_DURATION_CACHE:
        return _VIDEO_DURATION_CACHE[vid]

    if conn:
        try:
            conn.execute("CREATE TABLE IF NOT EXISTS yt_durations (video_id TEXT PRIMARY KEY, duration_seconds INTEGER)")
            row = conn.execute("SELECT duration_seconds FROM yt_durations WHERE video_id = ?", (vid,)).fetchone()
            if row and row["duration_seconds"]:
                _VIDEO_DURATION_CACHE[vid] = int(row["duration_seconds"])
                return int(row["duration_seconds"])
        except Exception:
            pass

    return 0
