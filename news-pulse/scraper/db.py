"""
Database initialization and helpers for News Pulse.
Uses SQLite so deployment is zero-config; swap to Postgres via env if needed.
"""
import os
import sqlite3
from contextlib import contextmanager

DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(__file__), "news_pulse.db"))


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


@contextmanager
def db():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS articles (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                url         TEXT    NOT NULL UNIQUE,
                title       TEXT    NOT NULL,
                summary     TEXT,
                body        TEXT,
                source      TEXT    NOT NULL,
                published   TEXT,
                fetched_at  TEXT    NOT NULL DEFAULT (datetime('now')),
                cluster_id  INTEGER
            );

            CREATE TABLE IF NOT EXISTS clusters (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                label       TEXT    NOT NULL,
                created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
                updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_articles_url        ON articles(url);
            CREATE INDEX IF NOT EXISTS idx_articles_cluster_id ON articles(cluster_id);
            CREATE INDEX IF NOT EXISTS idx_articles_published  ON articles(published);
        """)
    print(f"[db] Initialized at {DB_PATH}")


if __name__ == "__main__":
    init_db()
