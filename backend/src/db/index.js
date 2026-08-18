const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let db = null;

function backendRoot() {
  return path.resolve(__dirname, '..', '..');
}

function getDbPath() {
  const configured = process.env.DB_PATH || './data/pennywise.db';
  return path.isAbsolute(configured) ? configured : path.join(backendRoot(), configured);
}

function ensureDataDir() {
  const dir = path.dirname(getDbPath());
  fs.mkdirSync(dir, { recursive: true });
}

function getDb({ filePath } = {}) {
  if (db && db.open) return db;
  const target = filePath || getDbPath();
  const dir = path.dirname(target);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(target);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

function resetDbForTests(filePath) {
  closeDb();
  const target = filePath || ':memory:';
  db = new Database(target);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function now() {
  return new Date().toISOString();
}

module.exports = { getDb, closeDb, resetDbForTests, ensureDataDir, getDbPath, now, backendRoot };
