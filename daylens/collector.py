"""Windows API active app tracking, idle detection, and demo sample generation."""
from __future__ import annotations

import ctypes
import ctypes.wintypes as wintypes
import datetime as dt
import sys
import time
from daylens.categorizer import categorize
from daylens.config import DB_PATH
from daylens.db import add_activity, connect, utc_now

_IS_PAUSED = False


def is_paused() -> bool:
    global _IS_PAUSED
    return _IS_PAUSED


def set_paused(paused: bool) -> bool:
    global _IS_PAUSED
    _IS_PAUSED = paused
    return _IS_PAUSED


def windows_state() -> tuple[str, str, int]:
    if sys.platform != "win32":
        raise RuntimeError("Real tracking requires Windows; use 'demo' on another OS.")
    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32
    hwnd = user32.GetForegroundWindow()
    length = user32.GetWindowTextLengthW(hwnd)
    title_buffer = ctypes.create_unicode_buffer(length + 1)
    user32.GetWindowTextW(hwnd, title_buffer, length + 1)
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    app = f"pid:{pid.value}"
    try:
        import psutil  # type: ignore
        app = psutil.Process(pid.value).name()
    except Exception:
        pass
    class LASTINPUTINFO(ctypes.Structure):
        _fields_ = [("cbSize", wintypes.UINT), ("dwTime", wintypes.DWORD)]
    info = LASTINPUTINFO(ctypes.sizeof(LASTINPUTINFO), 0)
    user32.GetLastInputInfo(ctypes.byref(info))
    idle_ms = (kernel32.GetTickCount() - info.dwTime) & 0xFFFFFFFF
    return app, title_buffer.value, idle_ms // 1000


def track(interval: int) -> None:
    conn = connect()
    print(f"DayLens tracking started. Database: {DB_PATH}")
    print("Press Ctrl+C to pause/stop. No screenshots or keystrokes are collected.")
    try:
        while True:
            if is_paused():
                time.sleep(1)
                continue
            started = utc_now()
            app, title, idle = windows_state()
            time.sleep(max(1, interval))
            ended = utc_now()
            add_activity(conn, started.isoformat(), ended.isoformat(), app, title, idle)
            print(f"{started.astimezone().strftime('%H:%M:%S')}  {app:<24} {categorize(app, title, conn):<14} idle={idle}s")
    except KeyboardInterrupt:
        print("\nTracking paused.")
    finally:
        conn.close()


def demo(hours: float) -> int:
    conn = connect()
    base = utc_now() - dt.timedelta(hours=hours)
    samples = [
        ("python.exe", "DayLens - VS Code", "coding", 70),
        ("brave.exe", "YouTube - programming tutorial", "entertainment", 20),
        ("WINWORD.EXE", "Office document report.docx", "office", 40),
        ("Telegram.exe", "Telegram - Dev Group", "communication", 15),
        ("chrome.exe", "GitHub - daylens-mvp repository", "coding", 5),
        ("spotify.exe", "Spotify Free", "entertainment", 180),
    ]
    count = 0
    num_cycles = max(1, int(hours * 3))
    for cycle in range(num_cycles):
        for index, (app, title, _cat, idle) in enumerate(samples):
            start = base + dt.timedelta(minutes=(cycle * len(samples) + index) * 15)
            if start > utc_now():
                break
            add_activity(conn, start.isoformat(), (start + dt.timedelta(minutes=14)).isoformat(), app, title, idle, "demo")
            count += 1
    conn.close()
    return count
