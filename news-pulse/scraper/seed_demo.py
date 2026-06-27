"""
seed_demo.py — populate the DB with realistic demo data
so the frontend/backend can be tested without network access.
Run once: python3 seed_demo.py
"""
import sqlite3, datetime, random
from db import DB_PATH, init_db

SOURCES = ["BBC News", "NPR", "Reuters", "Al Jazeera"]

DEMO_CLUSTERS = [
    {
        "label": "India · Pakistan · Ceasefire",
        "articles": [
            ("India and Pakistan agree to ceasefire after three days of conflict",
             "Both nations announced a halt to hostilities late Thursday, citing diplomatic pressure from the United States and China.",
             "https://www.bbc.com/news/world-asia-india-example1",
             "BBC News",
             "2026-06-27T08:00:00+00:00"),
            ("Pakistan military says ceasefire holding at Line of Control",
             "Officials in Islamabad confirmed no overnight exchanges, with monitoring teams deployed at border crossings.",
             "https://feeds.npr.org/example2",
             "NPR",
             "2026-06-27T10:30:00+00:00"),
            ("Ceasefire between India and Pakistan: what comes next?",
             "Analysts say the fragile truce could unravel without structured talks, but leaders on both sides are under domestic pressure.",
             "https://www.reuters.com/example3",
             "Reuters",
             "2026-06-27T13:45:00+00:00"),
        ],
    },
    {
        "label": "Federal Reserve · Interest Rates · Inflation",
        "articles": [
            ("Federal Reserve holds interest rates steady for third consecutive meeting",
             "The Federal Open Market Committee voted unanimously to keep the benchmark rate at its current level, citing persistent services inflation.",
             "https://www.reuters.com/example4",
             "Reuters",
             "2026-06-26T19:00:00+00:00"),
            ("Fed chair signals no rate cuts before autumn amid sticky prices",
             "Chair Jerome Powell told reporters that while headline CPI has cooled, shelter and wage growth remain elevated.",
             "https://www.bbc.com/news/business-example5",
             "BBC News",
             "2026-06-26T20:15:00+00:00"),
            ("Wall Street slides after Fed keeps rates unchanged",
             "Major indices fell more than 1% as investors had hoped for guidance on an earlier easing cycle.",
             "https://feeds.npr.org/example6",
             "NPR",
             "2026-06-26T21:00:00+00:00"),
            ("Rate hold disappoints markets but economists say patience warranted",
             "Most economists polled by Reuters said the Fed was right to hold, given lingering uncertainty over energy prices.",
             "https://www.aljazeera.com/example7",
             "Al Jazeera",
             "2026-06-26T22:30:00+00:00"),
        ],
    },
    {
        "label": "Gaza · Humanitarian Aid · UN",
        "articles": [
            ("UN warns of 'catastrophic' food shortages as Gaza aid convoy blocked",
             "For the third consecutive week, trucks carrying emergency rations were turned back at the Kerem Shalom crossing.",
             "https://www.aljazeera.com/example8",
             "Al Jazeera",
             "2026-06-25T06:00:00+00:00"),
            ("International community calls for immediate humanitarian corridor in Gaza",
             "A joint statement from 40 countries urged all parties to allow food, medicine, and fuel into the besieged territory.",
             "https://www.bbc.com/news/world-middle-east-example9",
             "BBC News",
             "2026-06-25T09:00:00+00:00"),
            ("Aid agencies say only 12 percent of needed supplies reached Gaza this week",
             "UNRWA officials said the situation on the ground is deteriorating faster than at any point in the past year.",
             "https://feeds.npr.org/example10",
             "NPR",
             "2026-06-26T07:00:00+00:00"),
        ],
    },
    {
        "label": "OpenAI · GPT-5 · AI Regulation",
        "articles": [
            ("OpenAI releases GPT-5 with new reasoning and multimodal capabilities",
             "The model scores substantially higher on standard benchmarks and for the first time integrates real-time web access by default.",
             "https://www.reuters.com/example11",
             "Reuters",
             "2026-06-24T16:00:00+00:00"),
            ("EU AI Act compliance deadline looms as GPT-5 launches",
             "European regulators say they will assess the new model under high-risk AI provisions; OpenAI says it is cooperating fully.",
             "https://www.bbc.com/news/technology-example12",
             "BBC News",
             "2026-06-24T18:30:00+00:00"),
            ("White House urges caution over AI frontier models after GPT-5 release",
             "An executive order directing federal agencies to audit any use of new frontier models was signed late Friday.",
             "https://feeds.npr.org/example13",
             "NPR",
             "2026-06-25T14:00:00+00:00"),
        ],
    },
    {
        "label": "Climate · Heatwave · South Asia",
        "articles": [
            ("Record temperatures sweep northern India; Delhi hits 48°C",
             "Health authorities declared a public emergency and ordered schools and outdoor construction to shut for three days.",
             "https://www.aljazeera.com/example14",
             "Al Jazeera",
             "2026-06-26T12:00:00+00:00"),
            ("Pakistan's Punjab province orders emergency measures as heatwave intensifies",
             "Officials set up over 500 cooling centres and distributed water to vulnerable communities across the province.",
             "https://www.bbc.com/news/world-asia-example15",
             "BBC News",
             "2026-06-26T14:00:00+00:00"),
        ],
    },
    {
        "label": "Ukraine · NATO · Defence Aid",
        "articles": [
            ("NATO summit agrees new Ukraine support package worth 40 billion euros",
             "Leaders meeting in Brussels pledged long-range missiles, air defence batteries, and accelerated membership talks.",
             "https://www.reuters.com/example16",
             "Reuters",
             "2026-06-23T11:00:00+00:00"),
            ("Ukraine president addresses NATO allies, demands faster delivery of weapons",
             "President Zelensky used a video address to warn that delays in deliveries are costing Ukrainian lives on the eastern front.",
             "https://www.aljazeera.com/example17",
             "Al Jazeera",
             "2026-06-23T13:00:00+00:00"),
            ("Germany approves largest military aid package for Ukraine since 2022",
             "The package includes two Patriot batteries, 200 armoured vehicles, and €5bn in budgetary support.",
             "https://www.bbc.com/news/world-europe-example18",
             "BBC News",
             "2026-06-23T15:30:00+00:00"),
            ("US Senate ratifies Ukraine defence bill after months of delay",
             "The legislation cleared the Senate 67–33, providing $18bn in security assistance for the fiscal year.",
             "https://feeds.npr.org/example19",
             "NPR",
             "2026-06-24T08:00:00+00:00"),
        ],
    },
    {
        "label": "Apple · WWDC · iOS 20",
        "articles": [
            ("Apple unveils iOS 20 with on-device AI features and redesigned home screen",
             "The update brings a personalised AI assistant, custom widget layouts, and a new dynamic island expansion to older iPhone models.",
             "https://www.reuters.com/example20",
             "Reuters",
             "2026-06-22T18:00:00+00:00"),
            ("WWDC 2026: everything Apple announced at its developer conference",
             "Highlights include new spatial computing features for Vision Pro 2, Swift 6 improvements, and a unified AI framework for developers.",
             "https://www.bbc.com/news/technology-example21",
             "BBC News",
             "2026-06-22T21:00:00+00:00"),
        ],
    },
    {
        "label": "Brazil · Amazon · Deforestation",
        "articles": [
            ("Brazil reports lowest Amazon deforestation in a decade, government claims",
             "Satellite data compiled by INPE shows a 32% reduction in clearing compared with the same period last year.",
             "https://www.aljazeera.com/example22",
             "Al Jazeera",
             "2026-06-25T10:00:00+00:00"),
            ("Environmental groups question Brazil's deforestation figures",
             "NGOs say the government methodology excludes degraded areas and forest fires, which skews the headline numbers downward.",
             "https://feeds.npr.org/example23",
             "NPR",
             "2026-06-25T15:00:00+00:00"),
        ],
    },
]


def seed():
    init_db()
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")

    # Clear existing data
    conn.execute("DELETE FROM articles")
    conn.execute("DELETE FROM clusters")

    now = datetime.datetime.now(datetime.timezone.utc).isoformat()

    for cluster in DEMO_CLUSTERS:
        cur = conn.execute(
            "INSERT INTO clusters (label, created_at, updated_at) VALUES (?, ?, ?)",
            (cluster["label"], now, now),
        )
        cid = cur.lastrowid
        for title, summary, url, source, published in cluster["articles"]:
            conn.execute(
                """INSERT OR IGNORE INTO articles
                   (url, title, summary, source, published, cluster_id, fetched_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (url, title, summary, source, published, cid, now),
            )

    conn.commit()
    conn.close()
    total_articles = sum(len(c["articles"]) for c in DEMO_CLUSTERS)
    print(f"Seeded {len(DEMO_CLUSTERS)} clusters, {total_articles} articles into {DB_PATH}")


if __name__ == "__main__":
    seed()
