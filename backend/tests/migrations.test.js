const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const { loadMigrations, runUp, runRollback, ensureMigrationsTable } = require('../src/db/migrate');

function freshDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pennywise-migrate-'));
  return new Database(path.join(dir, 'migrate.db'));
}

describe('Migrations', () => {
  test('Migration files are discoverable and ordered', () => {
    const all = loadMigrations();
    assert.ok(all.length >= 5);
    assert.strictEqual(all[0].name, '001_create_users.js');
    const names = all.map((m) => m.name);
    const sorted = [...names].sort();
    assert.deepStrictEqual(names, sorted);
  });

  test('Rollback works without errors and re-migrate restores schema', () => {
    const db = freshDb();
    ensureMigrationsTable(db);
    const applied = runUp({ close: false, db });
    assert.ok(applied >= 5);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((t) => t.name);
    for (const t of ['users', 'income', 'expenses', 'categories', 'budgets', 'project_budgets', 'project_expenses', 'recurring_transactions']) {
      assert.ok(tables.includes(t), `${t} should exist after migrate`);
    }

    const rolled = runRollback({ close: false, db });
    assert.strictEqual(rolled, applied);

    const remaining = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((t) => t.name);
    assert.ok(!remaining.includes('users'), 'users table should be dropped after full rollback');

    const reapplied = runUp({ close: false, db });
    assert.strictEqual(reapplied, applied);
    const restored = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'users'")
      .get();
    assert.ok(restored, 'users table should be restored after re-migrate');
    db.close();
  });

  test('Migrations are idempotent (running twice applies nothing)', () => {
    const db = freshDb();
    runUp({ close: false, db });
    const second = runUp({ close: false, db });
    assert.strictEqual(second, 0);
    db.close();
  });
});
