"""
RSS ingestion: fetch articles from multiple feeds, normalize them,
extract full body text, avoid duplicates.
"""
import re
import time
import hashlib
import logging
import datetime
from typing import Optional

import feedparser
import trafilatura
import requests

from db import db, init_db

logging.basicConfig(level=logging.INFO, format="[ingest] %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ── Feed sources ──────────────────────────────────────────────────────────────
FEEDS = [
    {"source": "BBC News",    "url": "http://feeds.bbci.co.uk/news/rss.xml"},
    {"source": "NPR",         "url": "https://feeds.npr.org/1001/rss.xml"},
    {"source": "Reuters",     "url": "https://feeds.reuters.com/reuters/topNews"},
    {"source": "Al Jazeera",  "url": "https://www.aljazeera.com/xml/rss/all.xml"},
]

# User-agent so feeds don't reject us
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; NewsPulseBot/1.0; "
        "+https://github.com/saanvi-211/news-pulse)"
    )
}


# ── Date normalisation ────────────────────────────────────────────────────────
def _parse_date(entry) -> Optional[str]:
    """Return ISO-8601 UTC string or None."""
    # feedparser already parses most date fields into a time.struct_time
    for field in ("published_parsed", "updated_parsed", "created_parsed"):
        val = getattr(entry, field, None)
        if val:
            try:
                dt = datetime.datetime(*val[:6], tzinfo=datetime.timezone.utc)
                return dt.isoformat()
            except Exception:
                pass
    # Fallback: raw string fields
    for field in ("published", "updated", "pubDate"):
        raw = entry.get(field)
        if raw:
            return raw  # keep as-is; frontend can parse it
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


# ── Text extraction ───────────────────────────────────────────────────────────
def _extract_summary(entry) -> str:
    """Best-effort summary from RSS fields."""
    for field in ("summary", "description", "content"):
        val = entry.get(field)
        if val:
            if isinstance(val, list):          # <content> is a list of dicts
                val = val[0].get("value", "")
            # Strip HTML tags
            text = re.sub(r"<[^>]+>", " ", val).strip()
            if len(text) > 30:
                return text[:1500]
    return ""


def _fetch_body(url: str, timeout: int = 10) -> Optional[str]:
    """Fetch full article body via trafilatura; graceful on failure."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=timeout)
        resp.raise_for_status()
        text = trafilatura.extract(
            resp.text,
            include_comments=False,
            include_tables=False,
            no_fallback=False,
        )
        return text[:5000] if text else None
    except Exception as e:
        log.debug("Body fetch failed for %s: %s", url, e)
        return None


# ── Per-feed ingestion ────────────────────────────────────────────────────────
def _ingest_feed(source: str, feed_url: str) -> int:
    """Parse one feed, upsert articles, return count of new ones."""
    log.info("Fetching feed: %s (%s)", source, feed_url)
    try:
        parsed = feedparser.parse(feed_url, request_headers=HEADERS)
    except Exception as e:
        log.error("Failed to parse feed %s: %s", feed_url, e)
        return 0

    new_count = 0
    for entry in parsed.entries:
        url = entry.get("link", "").strip()
        title = entry.get("title", "").strip()
        if not url or not title:
            continue

        summary = _extract_summary(entry)
        published = _parse_date(entry)

        with db() as conn:
            existing = conn.execute(
                "SELECT id FROM articles WHERE url = ?", (url,)
            ).fetchone()
            if existing:
                continue  # already stored — skip

        # Fetch full body (outside the db context to avoid long locks)
        body = _fetch_body(url)
        time.sleep(0.3)  # be polite

        with db() as conn:
            conn.execute(
                """INSERT OR IGNORE INTO articles
                   (url, title, summary, body, source, published)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (url, title, summary, body, source, published),
            )
        new_count += 1
        log.info("  + %s", title[:80])

    log.info("Feed %s: %d new articles", source, new_count)
    return new_count


# ── Public entry point ────────────────────────────────────────────────────────
def run_ingestion() -> int:
    """Ingest all feeds. Returns total new article count."""
    init_db()
    total = 0
    for feed in FEEDS:
        total += _ingest_feed(feed["source"], feed["url"])
    log.info("Ingestion complete. %d new articles total.", total)
    return total


if __name__ == "__main__":
    run_ingestion()
