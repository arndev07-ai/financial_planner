const fs = require('fs');
const path = require('path');
const { getDb, ensureDataDir } = require('./index');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function loadMigrations() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.+\.js$/.test(f))
    .sort()
    .map((file) => {
      const migration = require(path.join(MIGRATIONS_DIR, file));
      return { name: file, migration };
    });
}

function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      name TEXT PRIMARY KEY,
      executed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function getApplied(db) {
  return db.prepare('SELECT name FROM migrations ORDER BY name').all().map((r) => r.name);
}

function runUp({ close = true, db } = {}) {
  const target = db || getDb();
  ensureMigrationsTable(target);
  const applied = new Set(getApplied(target));
  const all = loadMigrations();
  const pending = all.filter((m) => !applied.has(m.name));
  const insert = target.prepare('INSERT INTO migrations (name) VALUES (?)');

  if (pending.length === 0) {
    if (close) target.close();
    return 0;
  }

  const tx = target.transaction((list) => {
    for (const m of list) {
      m.migration.up(target);
      insert.run(m.name);
      console.log(`  [up]   ${m.name}`);
    }
  });
  tx(pending);
  if (close) target.close();
  return pending.length;
}

function runRollback({ close = true, db } = {}) {
  const target = db || getDb();
  ensureMigrationsTable(target);
  const applied = getApplied(target);
  const all = loadMigrations();
  const del = target.prepare('DELETE FROM migrations WHERE name = ?');

  const toRollback = all.filter((m) => applied.includes(m.name)).reverse();
  if (toRollback.length === 0) {
    if (close) target.close();
    return 0;
  }

  const tx = target.transaction((list) => {
    for (const m of list) {
      m.migration.down(target);
      del.run(m.name);
      console.log(`  [down] ${m.name}`);
    }
  });
  tx(toRollback);
  if (close) target.close();
  return toRollback.length;
}

function run() {
  ensureDataDir();
  const command = process.argv[2];
  if (command === 'rollback') {
    runRollback();
  } else {
    runUp();
  }
}

module.exports = { runUp, runRollback, loadMigrations, ensureMigrationsTable };

if (require.main === module) {
  run();
}
