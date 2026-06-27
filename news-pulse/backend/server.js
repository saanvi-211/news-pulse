/**
 * server.js — News Pulse backend API
 *
 * Endpoints:
 *   GET  /clusters             — list all clusters
 *   GET  /clusters/:id         — cluster detail with articles
 *   GET  /timeline             — timeline-ready data
 *   POST /ingest/trigger       — kick off Python pipeline
 *   GET  /ingest/status/:jobId — poll job status
 */
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { v4: uuid } = require("uuid");
const { spawn } = require("child_process");
const path = require("path");
const { getDb, reloadDb, query } = require("./db");

const app = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  methods: ["GET", "POST", "OPTIONS"],
}));
app.use(express.json());

// ── In-memory job store ────────────────────────────────────────────────────
const jobs = {};   // { [jobId]: { status, startedAt, result?, error? } }

// ── Helper ─────────────────────────────────────────────────────────────────
function notFound(res, msg) {
  return res.status(404).json({ error: msg });
}
function serverError(res, err, msg) {
  console.error(msg, err);
  return res.status(500).json({ error: msg, detail: String(err) });
}

// ── GET /health ────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true }));

// ── GET /clusters ──────────────────────────────────────────────────────────
app.get("/clusters", async (req, res) => {
  try {
    const db = await getDb();
    const rows = query(db, `
      SELECT
        c.id,
        c.label,
        COUNT(a.id)                    AS article_count,
        MIN(a.published)               AS earliest,
        MAX(a.published)               AS latest,
        GROUP_CONCAT(DISTINCT a.source) AS sources
      FROM clusters c
      LEFT JOIN articles a ON a.cluster_id = c.id
      GROUP BY c.id
      ORDER BY latest DESC NULLS LAST
    `);
    res.json({ clusters: rows });
  } catch (err) {
    serverError(res, err, "Failed to fetch clusters");
  }
});

// ── GET /clusters/:id ──────────────────────────────────────────────────────
app.get("/clusters/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid cluster id" });

  try {
    const db = await getDb();
    const [cluster] = query(db, "SELECT * FROM clusters WHERE id = ?", [id]);
    if (!cluster) return notFound(res, `Cluster ${id} not found`);

    const articles = query(
      db,
      `SELECT id, title, summary, url, source, published
       FROM articles
       WHERE cluster_id = ?
       ORDER BY published ASC`,
      [id]
    );
    res.json({ cluster, articles });
  } catch (err) {
    serverError(res, err, "Failed to fetch cluster detail");
  }
});

// ── GET /timeline ──────────────────────────────────────────────────────────
app.get("/timeline", async (req, res) => {
  try {
    const db = await getDb();
    const rows = query(db, `
      SELECT
        c.id,
        c.label,
        COUNT(a.id)                    AS article_count,
        MIN(a.published)               AS start_time,
        MAX(a.published)               AS end_time,
        GROUP_CONCAT(DISTINCT a.source) AS sources
      FROM clusters c
      LEFT JOIN articles a ON a.cluster_id = c.id
      GROUP BY c.id
      HAVING article_count > 0
      ORDER BY start_time DESC NULLS LAST
    `);

    // Compute a 0–1 intensity metric relative to max article_count
    const maxCount = rows.reduce((m, r) => Math.max(m, r.article_count), 1);
    const timeline = rows.map((r) => ({
      id: r.id,
      label: r.label,
      article_count: r.article_count,
      start_time: r.start_time,
      end_time: r.end_time || r.start_time,
      sources: r.sources ? r.sources.split(",").filter(Boolean) : [],
      intensity: r.article_count / maxCount,
    }));

    res.json({ timeline });
  } catch (err) {
    serverError(res, err, "Failed to build timeline");
  }
});

// ── GET /articles ──────────────────────────────────────────────────────────
// Bonus: list all articles (used by source filter)
app.get("/articles", async (req, res) => {
  const { source } = req.query;
  try {
    const db = await getDb();
    let sql = "SELECT id, title, summary, url, source, published, cluster_id FROM articles";
    const params = [];
    if (source) {
      sql += " WHERE source = ?";
      params.push(source);
    }
    sql += " ORDER BY published DESC LIMIT 500";
    const articles = query(db, sql, params);
    res.json({ articles });
  } catch (err) {
    serverError(res, err, "Failed to fetch articles");
  }
});

// ── GET /sources ───────────────────────────────────────────────────────────
app.get("/sources", async (req, res) => {
  try {
    const db = await getDb();
    const rows = query(db, "SELECT DISTINCT source FROM articles ORDER BY source");
    res.json({ sources: rows.map((r) => r.source) });
  } catch (err) {
    serverError(res, err, "Failed to fetch sources");
  }
});

// ── POST /ingest/trigger ───────────────────────────────────────────────────
app.post("/ingest/trigger", (req, res) => {
  const jobId = uuid();
  jobs[jobId] = { status: "running", startedAt: new Date().toISOString() };

  const pythonBin = process.env.PYTHON_BIN || "python3";
  const scriptPath = path.resolve(
    process.env.SCRAPER_PATH || path.join(__dirname, "../scraper/main.py")
  );
  const scriptDir = path.dirname(scriptPath);

  const proc = spawn(pythonBin, [scriptPath], {
    cwd: scriptDir,
    env: {
      ...process.env,
      DB_PATH: process.env.DB_PATH || path.join(scriptDir, "news_pulse.db"),
    },
  });

  let stdout = "";
  let stderr = "";
  proc.stdout.on("data", (d) => (stdout += d));
  proc.stderr.on("data", (d) => (stderr += d));

  proc.on("close", (code) => {
    reloadDb();   // force re-read on next request
    if (code === 0) {
      try {
        const result = JSON.parse(stdout.trim().split("\n").pop());
        jobs[jobId] = { status: "done", result, finishedAt: new Date().toISOString() };
      } catch {
        jobs[jobId] = { status: "done", result: { raw: stdout }, finishedAt: new Date().toISOString() };
      }
    } else {
      jobs[jobId] = {
        status: "error",
        error: stderr.slice(-1000),
        finishedAt: new Date().toISOString(),
      };
    }
  });

  res.status(202).json({ jobId, status: "running" });
});

// ── GET /ingest/status/:jobId ──────────────────────────────────────────────
app.get("/ingest/status/:jobId", (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) return notFound(res, "Job not found");
  res.json({ jobId: req.params.jobId, ...job });
});

// ── 404 catch-all ─────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// ── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] News Pulse API running on http://localhost:${PORT}`);
});

module.exports = app;
