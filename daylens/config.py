"""Configuration paths and defaults for DayLens."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "daylens.db"

DEFAULT_RULES = {
    "coding": "python, code, visual studio, terminal, powershell, git, cursor, pycharm, sublime, intellij, clion",
    "office": "excel, word, pdf, acrobat, office, notepad, powerpoint, docs, sheets, calc",
    "communication": "telegram, whatsapp, discord, messenger, outlook, slack, teams, zoom, skype",
    "entertainment": "youtube, netflix, game, spotify, free fire, movie, vlc, prime, twitch",
    "browser": "brave, chrome, firefox, edge, opera, safari",
}
