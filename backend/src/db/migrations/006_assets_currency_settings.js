exports.up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('cash', 'investment', 'property', 'crypto', 'other')),
      value REAL NOT NULL CHECK (value >= 0),
      currency TEXT NOT NULL DEFAULT 'USD',
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS currency_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      base TEXT NOT NULL,
      quote TEXT NOT NULL,
      rate REAL NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (base, quote)
    );

    CREATE TABLE IF NOT EXISTS settings (
      user_id INTEGER PRIMARY KEY,
      preferred_currency TEXT NOT NULL DEFAULT 'USD',
      notify_budget INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS net_worth_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      value REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (user_id, date)
    );
  `);

  const colsIncome = db.prepare("PRAGMA table_info(income)").all().map((c) => c.name);
  if (!colsIncome.includes('currency')) {
    db.exec(`ALTER TABLE income ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';`);
  }
  const colsExpenses = db.prepare("PRAGMA table_info(expenses)").all().map((c) => c.name);
  if (!colsExpenses.includes('currency')) {
    db.exec(`ALTER TABLE expenses ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';`);
  }
};

exports.down = (db) => {
  db.exec(`
    DROP TABLE IF EXISTS net_worth_snapshots;
    DROP TABLE IF EXISTS settings;
    DROP TABLE IF EXISTS currency_rates;
    DROP TABLE IF EXISTS assets;
  `);
};
