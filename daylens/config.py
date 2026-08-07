"""Configuration paths and defaults for DayLens."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "daylens.db"

DEFAULT_RULES = {
    "coding": "python, code, visual studio, terminal, powershell, git, cursor, pycharm, sublime, intellij, clion, github, stackoverflow, dev.to, replit, hf.co, huggingface, kaggle, codepen, npm",
    "learning": "coursera, udemy, edx, khanacademy, wikipedia, w3schools, geeksforgeeks, medium, substack, arxiv, docs, tutorial",
    "office": "excel, word, pdf, acrobat, office, notepad, powerpoint, google docs, google sheets, google slides, calc, libreoffice",
    "communication": "telegram, whatsapp, discord, messenger, outlook, slack, teams, zoom, skype, gmail, protonmail",
    "entertainment": "youtube, netflix, game, spotify, free fire, movie, vlc, prime, twitch, anime, steam, epic games",
    "social": "facebook, twitter, instagram, reddit, linkedin, tiktok, pinterest, x.com",
    "browser": "brave, chrome, firefox, edge, opera, safari",
}
