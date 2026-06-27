/**
 * db.js — SQLite wrapper using sql.js (pure JS, no native build needed).
 * Reads the same .db file the Python scraper writes.
 */
const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

const DB_PATH =
  process.env.DB_PATH ||
  path.join(__dirname, "../scraper/news_pulse.db");

let _db = null;
let _SQL = null;

async function getDb() {
  if (_db) return _db;

  _SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    _db = new _SQL.Database(fileBuffer);
  } else {
    _db = new _SQL.Database();
    _initSchema(_db);
    _persist(_db);
  }
  return _db;
}

function _initSchema(db) {
  db.run(`
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
  `);
}

function _persist(db) {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function reloadDb() {
  // Force re-read the file (called after Python pipeline finishes)
  _db = null;
}

// Helper: run a SELECT and return rows as plain objects
function query(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

module.exports = { getDb, reloadDb, query, DB_PATH };
