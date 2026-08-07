"""Category classification logic and custom rules management."""
from __future__ import annotations

import sqlite3
from daylens.config import DEFAULT_RULES


def seed_category_rules(conn: sqlite3.Connection) -> None:
    count = conn.execute("SELECT COUNT(*) FROM category_rules").fetchone()[0]
    if count == 0:
        for cat, kw in DEFAULT_RULES.items():
            conn.execute("INSERT OR REPLACE INTO category_rules(category, keywords) VALUES (?, ?)", (cat, kw))
        conn.commit()


def get_category_rules(conn: sqlite3.Connection) -> dict[str, list[str]]:
    rows = conn.execute("SELECT category, keywords FROM category_rules").fetchall()
    rules: dict[str, list[str]] = {}
    for r in rows:
        kw_list = [k.strip().lower() for k in r["keywords"].split(",") if k.strip()]
        rules[r["category"]] = kw_list
    if not rules:
        for cat, kw in DEFAULT_RULES.items():
            rules[cat] = [k.strip().lower() for k in kw.split(",") if k.strip()]
    return rules


def save_category_rule(conn: sqlite3.Connection, category: str, keywords: str) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO category_rules(category, keywords) VALUES (?, ?)",
        (category.strip().lower(), keywords.strip().lower()),
    )
    conn.commit()


def categorize(app: str, title: str, conn: sqlite3.Connection | None = None) -> str:
    text = f"{app} {title}".lower()
    rules = get_category_rules(conn) if conn else {
        cat: [k.strip().lower() for k in kw.split(",") if k.strip()]
        for cat, kw in DEFAULT_RULES.items()
    }
    for category, keywords in rules.items():
        if any(keyword in text for keyword in keywords):
            return category
    return "other"
