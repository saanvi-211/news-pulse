# News Pulse — Topic-Clustered News Timeline

A full-stack system that pulls live articles from multiple RSS feeds, automatically groups related articles into topic clusters using TF-IDF similarity, and displays those clusters as an interactive visual timeline.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          FRONTEND                               │
│  Next.js 14 / React / Tailwind CSS   (Vercel)                  │
│  ─ Timeline visualization (custom bar chart)                    │
│  ─ Cluster detail side panel                                    │
│  ─ Source filter toggles                                        │
│  ─ Refresh button with job polling                              │
└──────────────────────┬──────────────────────────────────────────┘
                       │ REST (NEXT_PUBLIC_API_URL)
┌──────────────────────▼──────────────────────────────────────────┐
│                         BACKEND                                 │
│  Node.js / Express   (Render)                                   │
│  GET  /clusters            – cluster list                       │
│  GET  /clusters/:id        – cluster detail + articles          │
│  GET  /timeline            – timeline-formatted cluster data    │
│  GET  /sources             – distinct feed sources              │
│  GET  /articles            – all articles (with ?source filter) │
│  POST /ingest/trigger      – launch Python pipeline             │
│  GET  /ingest/status/:id   – poll job status                    │
└──────────────────────┬──────────────────────────────────────────┘
                       │ sqlite3 file (shared mount or Render Disk)
┌──────────────────────▼──────────────────────────────────────────┐
│                    PYTHON SCRAPER                               │
│  feedparser + trafilatura + scikit-learn  (Render cron / API)  │
│  ─ Pulls BBC News, NPR, Reuters, Al Jazeera RSS feeds           │
│  ─ Extracts full body text via trafilatura                      │
│  ─ TF-IDF vectorisation + cosine similarity clustering          │
│  ─ Writes clusters & articles to SQLite (news_pulse.db)         │
└─────────────────────────────────────────────────────────────────┘
```

---

## News Sources Used

| Source | Feed URL |
|---|---|
| BBC News | http://feeds.bbci.co.uk/news/rss.xml |
| NPR | https://feeds.npr.org/1001/rss.xml |
| Reuters | https://feeds.reuters.com/reuters/topNews |
| Al Jazeera | https://www.aljazeera.com/xml/rss/all.xml |

---

## Topic Grouping Approach

**Option B (TF-IDF + cosine similarity)** was chosen over keyword overlap for two reasons:
1. Cross-outlet coverage of the same story often uses different vocabulary (e.g. "cease-fire" vs "truce"). TF-IDF + cosine similarity handles this better than raw word overlap.
2. scikit-learn is a standard dependency with minimal overhead for 50–200 daily articles.

**How it works:**
- Article text (headline + summary + first 500 chars of body) is cleaned and lowercased.
- A `TfidfVectorizer` with bigrams (`ngram_range=(1,2)`) and 5,000 vocabulary features creates a sparse matrix.
- Cosine similarity is computed pairwise.
- A **greedy single-pass algorithm** groups articles: each unclustered article starts a new cluster, then any unclustered article with cosine similarity ≥ **0.20** to that founding article is added to the same cluster.
- The cluster label is the **top 3 TF-IDF terms** summed across all articles in the cluster.

**Threshold selection:** 0.20 was chosen empirically — at 0.15, unrelated stories about different elections merged; at 0.30, variations of the same story (same event, different outlet angles) were left in separate clusters.

**Limitation:** Greedy single-pass clustering compares candidate articles against the *founding* article, not the cluster centroid. A late article that discusses the same topic with very different vocabulary may not join the right cluster. Fix: re-run clustering with centroid updates (k-means style) or switch to DBSCAN on the full similarity matrix.

---

## Folder Structure

```
news-pulse/
├── scraper/              # Python pipeline
│   ├── db.py             # SQLite schema & helpers
│   ├── ingest.py         # RSS ingestion + body extraction
│   ├── cluster.py        # TF-IDF clustering
│   ├── main.py           # Entry point: ingest → cluster
│   ├── seed_demo.py      # Seed realistic demo data (no network needed)
│   └── requirements.txt
├── backend/              # Node.js Express API
│   ├── server.js         # All REST endpoints
│   ├── db.js             # sql.js SQLite wrapper
│   ├── .env.example
│   └── package.json
└── frontend/             # Next.js 14 app
    ├── app/
    │   ├── layout.tsx
    │   └── page.tsx      # Main page with timeline
    ├── components/
    │   ├── Timeline.tsx       # Visual timeline bars
    │   ├── ClusterPanel.tsx   # Side panel with articles
    │   ├── SourceFilter.tsx   # Source toggle buttons
    │   └── RefreshButton.tsx  # Trigger + poll ingest
    ├── lib/api.ts         # Typed API client
    └── .env.local.example
```

---

## Local Setup

### Prerequisites
- Python 3.10+
- Node.js 18+

### 1. Python scraper

```bash
cd scraper
pip install -r requirements.txt
python3 main.py          # scrape + cluster (needs internet)
# OR seed demo data (no internet required):
python3 seed_demo.py
```

### 2. Backend

```bash
cd backend
cp .env.example .env     # edit DB_PATH if needed
npm install
npm start                # runs on port 4000
```

### 3. Frontend

```bash
cd frontend
cp .env.local.example .env.local
# set NEXT_PUBLIC_API_URL=http://localhost:4000
npm install
npm run dev              # runs on port 3000
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deployment

| Component | Platform | Notes |
|---|---|---|
| Frontend | **Vercel** | Set `NEXT_PUBLIC_API_URL` to Render backend URL |
| Backend API | **Render** (Web Service) | Add a Render Disk mounted at `/data`; set `DB_PATH=/data/news_pulse.db` |
| Python pipeline | **Render** (Cron Job) | `cd scraper && python3 main.py`; set same `DB_PATH` |
| Database | SQLite on **Render Disk** | Free tier: 1 GB persistent disk. Alternatively swap to Neon/Supabase Postgres |

**Environment variables — backend (Render):**
```
PORT=4000
DB_PATH=/data/news_pulse.db
PYTHON_BIN=/usr/bin/python3
SCRAPER_PATH=/opt/render/project/src/scraper/main.py
FRONTEND_URL=https://your-project.vercel.app
```

**Environment variables — frontend (Vercel):**
```
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com
```

No secrets are committed to the repository. All sensitive values are configured on the hosting platform.

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Liveness check |
| GET | `/clusters` | All clusters with article count and time range |
| GET | `/clusters/:id` | Cluster detail with all articles sorted chronologically |
| GET | `/timeline` | Clusters formatted for charting (start/end timestamps + intensity) |
| GET | `/sources` | Distinct feed sources in the DB |
| GET | `/articles?source=NPR` | All articles, optionally filtered by source |
| POST | `/ingest/trigger` | Launch scrape + cluster pipeline → `{ jobId }` |
| GET | `/ingest/status/:jobId` | Poll job: `{ status: "running"\|"done"\|"error" }` |

---

## Stretch Goals Implemented

- ✅ **Auto-refresh** — frontend polls `/timeline` every 5 minutes
- ✅ **Visual cluster sizing** — bar height and opacity scale with article count (intensity)
- ⬜ **Cross-source story merging** — not implemented (noted as "known hard problem" in spec)
