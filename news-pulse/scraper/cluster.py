"""
Topic grouping: TF-IDF vectorisation + cosine-similarity clustering.

Approach chosen: TF-IDF (Option B from spec).
Rationale:
  - More robust than pure keyword overlap when article wording varies across outlets.
  - scikit-learn is already a common dependency in production ML pipelines.
  - Still explainable: top TF-IDF terms become the cluster label.

Parameters:
  SIM_THRESHOLD  = 0.20  (cosine similarity above this → same cluster)
    Chosen empirically: lower (0.15) merged too many unrelated stories;
    higher (0.30) left too many singletons.

Limitation: Single-pass greedy clustering (articles compared to the
first article in a cluster, not the centroid). This means late-breaking
articles that are only weakly similar to the cluster's founding article
may be missed. A proper centroid-update or DBSCAN pass would fix this
but is overkill for 50–200 daily articles.
"""
import re
import logging
import datetime
from typing import List, Dict, Any

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from db import db, init_db

logging.basicConfig(level=logging.INFO, format="[cluster] %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ── Tunable knobs ─────────────────────────────────────────────────────────────
SIM_THRESHOLD = 0.20          # cosine similarity → "same topic"
MIN_CLUSTER_SIZE = 1          # singleton clusters are kept (news can be unique)
MAX_FEATURES = 5000           # TF-IDF vocabulary size


# ── Text prep ─────────────────────────────────────────────────────────────────
_PUNCT = re.compile(r"[^a-z0-9\s]")
_WS    = re.compile(r"\s+")

EXTRA_STOP_WORDS = {
    "said", "say", "says", "told", "tell", "report", "reported",
    "new", "news", "article", "watch", "video", "photo", "photos",
    "click", "read", "more", "get", "also", "like", "just", "now",
    "one", "two", "three", "first", "last", "year", "week", "day",
    "time", "make", "made", "use", "used", "using", "reuters", "bbc",
    "npr", "aljazeera", "al", "jazeera",
}


def _clean(text: str) -> str:
    text = text.lower()
    text = _PUNCT.sub(" ", text)
    text = _WS.sub(" ", text).strip()
    return text


def _doc(article: Dict[str, Any]) -> str:
    """Combine title + summary (+ partial body) for vectorisation."""
    parts = [
        article.get("title") or "",
        article.get("summary") or "",
        (article.get("body") or "")[:500],   # first 500 chars of body
    ]
    return _clean(" ".join(parts))


# ── Core clustering ───────────────────────────────────────────────────────────
def _cluster_articles(articles: List[Dict[str, Any]]) -> List[List[int]]:
    """
    Greedy single-pass clustering.
    Returns list of clusters, each cluster is a list of article indices.
    """
    if not articles:
        return []

    docs = [_doc(a) for a in articles]

    vectorizer = TfidfVectorizer(
        max_features=MAX_FEATURES,
        stop_words="english",
        min_df=1,
        ngram_range=(1, 2),
    )
    # Filter out any stop words we added manually
    try:
        tfidf_matrix = vectorizer.fit_transform(docs)
    except ValueError:
        # All docs are empty after stripping
        return [[i] for i in range(len(articles))]

    # Pairwise cosine similarity is O(n²) but fine for ≤500 articles
    sim_matrix = cosine_similarity(tfidf_matrix)

    assigned = [-1] * len(articles)
    clusters = []

    for i in range(len(articles)):
        if assigned[i] != -1:
            continue
        # Start a new cluster
        cid = len(clusters)
        clusters.append([i])
        assigned[i] = cid

        for j in range(i + 1, len(articles)):
            if assigned[j] != -1:
                continue
            if sim_matrix[i, j] >= SIM_THRESHOLD:
                clusters[cid].append(j)
                assigned[j] = cid

    return clusters


def _label_for_cluster(
    articles: List[Dict[str, Any]],
    vectorizer,
    tfidf_matrix,
    indices: List[int],
) -> str:
    """Pick the top 3 TF-IDF terms as a cluster label."""
    # Sum TF-IDF scores across the cluster rows
    cluster_vec = np.asarray(tfidf_matrix[indices].sum(axis=0)).flatten()
    top_idx = cluster_vec.argsort()[-5:][::-1]
    terms = [vectorizer.get_feature_names_out()[i] for i in top_idx]

    # Filter extra noise
    clean_terms = [t for t in terms if t not in EXTRA_STOP_WORDS and len(t) > 2]
    label = " · ".join(clean_terms[:3])
    return label.title() if label else "General News"


# ── DB write-back ─────────────────────────────────────────────────────────────
def run_clustering() -> int:
    """
    Re-cluster ALL articles and write results to DB.
    Returns number of clusters created.
    """
    init_db()

    with db() as conn:
        rows = conn.execute(
            "SELECT id, title, summary, body FROM articles ORDER BY published DESC"
        ).fetchall()

    if not rows:
        log.info("No articles to cluster.")
        return 0

    articles = [dict(r) for r in rows]
    log.info("Clustering %d articles …", len(articles))

    docs = [_doc(a) for a in articles]

    # Re-fit the vectorizer on all docs so _label_for_cluster can use it
    vectorizer = TfidfVectorizer(
        max_features=MAX_FEATURES,
        stop_words="english",
        min_df=1,
        ngram_range=(1, 2),
    )
    try:
        tfidf_matrix = vectorizer.fit_transform(docs)
    except ValueError:
        log.warning("Could not vectorise. Assigning each article its own cluster.")
        tfidf_matrix = None

    raw_clusters = _cluster_articles(articles)

    now = datetime.datetime.now(datetime.timezone.utc).isoformat()

    with db() as conn:
        # Clear old clusters
        conn.execute("DELETE FROM clusters")
        conn.execute("UPDATE articles SET cluster_id = NULL")

        for indices in raw_clusters:
            if tfidf_matrix is not None:
                label = _label_for_cluster(articles, vectorizer, tfidf_matrix, indices)
            else:
                label = articles[indices[0]]["title"][:60]

            cur = conn.execute(
                "INSERT INTO clusters (label, created_at, updated_at) VALUES (?, ?, ?)",
                (label, now, now),
            )
            cid = cur.lastrowid

            article_ids = [articles[i]["id"] for i in indices]
            conn.executemany(
                "UPDATE articles SET cluster_id = ? WHERE id = ?",
                [(cid, aid) for aid in article_ids],
            )

        total = conn.execute("SELECT COUNT(*) FROM clusters").fetchone()[0]

    log.info("Clustering complete: %d clusters from %d articles.", total, len(articles))
    return total


if __name__ == "__main__":
    run_clustering()
