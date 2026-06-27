# News Pulse — Topic-Clustered News Timeline

A full-stack system that pulls live articles from multiple RSS feeds, automatically groups related articles into topic clusters using TF-IDF similarity, and displays those clusters as an interactive visual timeline.

---

## Architecture Overview
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
cp .env.example .env
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

Open http://localhost:3000

---

## Deployment

| Component | Platform | Notes |
|---|---|---|
| Frontend | **Vercel** | Set `NEXT_PUBLIC_API_URL` to Render backend URL |
| Backend API | **Render** (Web Service) | Add a Render Disk at `/data`; set `DB_PATH=/data/news_pulse.db` |
| Python pipeline | **Render** (Cron Job) | `cd scraper && python3 main.py`; same `DB_PATH` |
| Database | SQLite on **Render Disk** | Free tier 1 GB. Can swap to Neon/Supabase Postgres |

**Backend env vars (Render):**
PORT=4000

DB_PATH=/data/news_pulse.db

PYTHON_BIN=/usr/bin/python3

SCRAPER_PATH=/opt/render/project/src/scraper/main.py

FRONTEND_URL=https://your-project.vercel.app

**Frontend env vars (Vercel):**
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com

No secrets committed to the repo. All values configured on the hosting platform.

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Liveness check |
| GET | `/clusters` | All clusters with article count and time range |
| GET | `/clusters/:id` | Cluster detail with articles sorted chronologically |
| GET | `/timeline` | Clusters formatted for charting (start/end timestamps + intensity) |
| GET | `/sources` | Distinct feed sources in the DB |
| GET | `/articles?source=NPR` | All articles, optionally filtered by source |
| POST | `/ingest/trigger` | Launch scrape + cluster pipeline → `{ jobId }` |
| GET | `/ingest/status/:jobId` | Poll job: `{ status: "running"\|"done"\|"error" }` |

---

## Stretch Goals Implemented

- ✅ **Auto-refresh** — frontend polls `/timeline` every 5 minutes
- ✅ **Visual cluster sizing** — bar height and opacity scale with article count
- ⬜ **Cross-source story merging** — not implemented (noted as "known hard problem" in spec)

Email to send to Vishwajeet
Subject: News Pulse — Xponentium Full-Stack Assessment Submission | Saanvi Sarraf
Body:

Hi Vishwajeet,
Please find my submission for the News Pulse take-home assessment below. I completed it within the 72-hour window.
GitHub repo: [your GitHub link here]

Live frontend: [your Vercel link here]

Live backend: [your Render link here]

Video walkthrough (2–3 min): [your Loom link here]
Quick summary of my approach:

Python scraper pulls from BBC News, NPR, Reuters, and Al Jazeera, normalises inconsistent RSS fields, and extracts full article body text via trafilatura
Topic clustering uses TF-IDF vectorisation + cosine similarity (threshold 0.20) — chose this over keyword overlap because cross-outlet coverage of the same story often uses different vocabulary
Node.js/Express backend serves all required endpoints with job-based polling for the ingest trigger
Next.js frontend renders clusters as a custom timeline with intensity-scaled bars, a click-to-expand article panel, source filters, and a refresh button that polls until the pipeline completes
Deployed on Render (backend + cron) and Vercel (frontend)

All assumptions and design decisions are documented in the README. Happy to walk through anything on the discussion call.
Looking forward to hearing from you.
Best,

Saanvi Sarraf

[your phone number]

linkedin.com/in/saanvi-sarraf-4a3503263


Before sending, make sure you have:

Pushed the code to GitHub (public repo)
Deployed backend on Render and got a live URL
Deployed frontend on Vercel with NEXT_PUBLIC_API_URL set
Recorded your 2–3 min Loom video and got the link
You said: give directly to paste that and alo what to sya i videogive directly to paste that and alo what to sya i video16:31Claude responded: Here's the README to paste directly — copy everything between the lines:Here's the README to paste directly — copy everything between the lines:

News Pulse — Topic-Clustered News Timeline
A full-stack system that pulls live articles from multiple RSS feeds, automatically groups related articles into topic clusters using TF-IDF similarity, and displays those clusters as an interactive visual timeline.

Architecture Overview
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
                       │ sqlite3 file (shared Render Disk)
┌──────────────────────▼──────────────────────────────────────────┐
│                    PYTHON SCRAPER                               │
│  feedparser + trafilatura + scikit-learn  (Render cron)        │
│  ─ Pulls BBC News, NPR, Reuters, Al Jazeera RSS feeds           │
│  ─ Extracts full body text via trafilatura                      │
│  ─ TF-IDF vectorisation + cosine similarity clustering          │
│  ─ Writes clusters & articles to SQLite (news_pulse.db)         │
└─────────────────────────────────────────────────────────────────┘

News Sources Used
SourceFeed URLBBC Newshttp://feeds.bbci.co.uk/news/rss.xmlNPRhttps://feeds.npr.org/1001/rss.xmlReutershttps://feeds.reuters.com/reuters/topNewsAl Jazeerahttps://www.aljazeera.com/xml/rss/all.xml

Topic Grouping Approach
Option B — TF-IDF + cosine similarity was chosen over keyword overlap for two reasons:

Cross-outlet coverage of the same story often uses different vocabulary ("cease-fire" vs "truce"). TF-IDF handles this better than raw word overlap.
scikit-learn is a standard dependency with minimal overhead for 50–200 daily articles.

How it works:

Article text (headline + summary + first 500 chars of body) is cleaned and lowercased
A TfidfVectorizer with bigrams and 5,000 features creates a sparse matrix
Cosine similarity is computed pairwise across all articles
A greedy single-pass algorithm groups articles: each unclustered article starts a new cluster, then any unclustered article with cosine similarity ≥ 0.20 to that founding article joins the same cluster
Cluster label = top 3 TF-IDF terms summed across all articles in the cluster

Threshold: 0.20 chosen empirically — at 0.15 unrelated stories merged; at 0.30 variations of the same story split into separate clusters.
Limitation: Greedy single-pass compares against the founding article, not the centroid. A late article with different vocabulary for the same topic may be missed. Fix: centroid-update iterations or DBSCAN on the full similarity matrix.

Folder Structure
news-pulse/
├── scraper/
│   ├── db.py             # SQLite schema & helpers
│   ├── ingest.py         # RSS ingestion + body extraction
│   ├── cluster.py        # TF-IDF clustering
│   ├── main.py           # Entry point: ingest → cluster
│   ├── seed_demo.py      # Demo data seed (no internet needed)
│   └── requirements.txt
├── backend/
│   ├── server.js         # All REST endpoints
│   ├── db.js             # sql.js SQLite wrapper
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── app/page.tsx      # Main page
│   ├── components/
│   │   ├── Timeline.tsx       # Visual timeline bars
│   │   ├── ClusterPanel.tsx   # Article side panel
│   │   ├── SourceFilter.tsx   # Source toggles
│   │   └── RefreshButton.tsx  # Trigger + poll ingest
│   ├── lib/api.ts
│   └── .env.local.example
├── render.yaml
└── README.md

Local Setup
Prerequisites

Python 3.10+
Node.js 18+

1. Scraper
bashcd scraper
pip install -r requirements.txt
python3 main.py          # live scrape (needs internet)
# or for local testing without internet:
python3 seed_demo.py
2. Backend
bashcd backend
cp .env.example .env
npm install
npm start                # http://localhost:4000
3. Frontend
bashcd frontend
cp .env.local.example .env.local
# set NEXT_PUBLIC_API_URL=http://localhost:4000
npm install
npm run dev              # http://localhost:3000

Deployment
ComponentPlatformNotesFrontendVercelSet NEXT_PUBLIC_API_URL to Render backend URLBackend APIRender (Web Service)Render Disk at /data, set DB_PATH=/data/news_pulse.dbPython pipelineRender (Cron Job)Runs hourly, same DB_PATHDatabaseSQLite on Render DiskFree tier 1 GB
Backend env vars (Render):
PORT=4000
DB_PATH=/data/news_pulse.db
PYTHON_BIN=/usr/bin/python3
SCRAPER_PATH=/opt/render/project/src/scraper/main.py
FRONTEND_URL=https://your-project.vercel.app
Frontend env vars (Vercel):
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com
No secrets committed to the repo.

API Reference
MethodEndpointDescriptionGET/healthLiveness checkGET/clustersAll clusters with count and time rangeGET/clusters/:idCluster detail with articles sorted chronologicallyGET/timelineClusters for charting (start/end timestamps + intensity)GET/sourcesDistinct feed sourcesGET/articles?source=NPRArticles, optionally filtered by sourcePOST/ingest/triggerRun pipeline → { jobId }GET/ingest/status/:jobIdPoll: { status: "running"|"done"|"error" }

Stretch Goals

✅ Auto-refresh — frontend polls /timeline every 5 minutes
✅ Visual cluster sizing — bar height and opacity scale with article count
⬜ Cross-source story merging — not implemented (noted as known hard problem in spec)


What I'd Improve With More Time
Switch from greedy single-pass to DBSCAN clustering on the full cosine similarity matrix — it would handle the centroid drift problem and automatically determine the number of clusters rather than relying on a fixed threshold.

Video Script (exactly what to say, ~2.5 minutes)
Record your screen showing the live site. Speak naturally, don't read robotically. Here's what to say for each section:

[0:00–0:35] Live demo

"This is News Pulse — a live news timeline that pulls from BBC, NPR, Reuters and Al Jazeera, groups related articles into topic clusters, and plots them on this timeline. Each bar represents a topic — the wider the bar, the longer the story was active, and the taller and brighter it is, the more articles covered it. I'll click on this cluster here — [click one] — and you can see all the articles from different outlets that were grouped together about this topic, with the source, timestamp, and a link to the original. I can also filter by source using these toggles — [click a toggle] — so if I only want to see BBC and Reuters, I just deselect the others and the timeline updates instantly."


[0:35–1:35] How the clustering works

"Let me show you the clustering code quickly. [open cluster.py] The approach is TF-IDF plus cosine similarity. What that means is: I take each article's headline, summary and the first few hundred characters of the body, and I convert it into a vector of term weights — words that appear a lot in one article but rarely across all articles get a high weight. Then I compare every article against every other article using cosine similarity — basically measuring the angle between those vectors. If two articles score above 0.20 similarity, I group them into the same cluster. The cluster label is just the top three terms by TF-IDF score across all articles in that group — so the label naturally describes what the cluster is about. I chose TF-IDF over simple keyword overlap because different outlets often describe the same event with different words — one might say 'ceasefire', another says 'truce' — and TF-IDF handles that better."


[1:35–2:15] Hard problem I ran into

"The hardest part was actually the RSS feeds themselves. Different feeds use completely different field names — BBC puts the article summary in description, others use content:encoded, some have no pubDate at all. So I wrote a normalisation layer in ingest.py that tries multiple field names in order and falls back gracefully if something's missing. The other issue was full body extraction — RSS feeds only give you a short snippet. I used trafilatura to fetch and parse the actual article page, but some pages block bots or use JavaScript rendering, so I had to make sure a failed body fetch didn't crash the whole pipeline — it just logs a warning and moves on with whatever summary text we have."


[2:15–2:35] What I'd improve

"With more time I'd replace the greedy single-pass clustering with DBSCAN on the full cosine similarity matrix. Right now I'm comparing each article against only the first article that started its cluster — so if a late article uses slightly different vocabulary for the same topic, it might not get grouped correctly. DBSCAN would handle that naturally because it considers density across the whole space, not just one anchor point."


That's your full submission. Record with Loom (free, loom.com), share as unlisted, and paste the link in your email.You've used 90% of your session limitUpgrade
