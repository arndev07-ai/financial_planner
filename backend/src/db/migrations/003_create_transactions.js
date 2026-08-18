exports.up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS income (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL CHECK (amount > 0),
      source TEXT NOT NULL,
      category TEXT NOT NULL,
      date TEXT NOT NULL,
      is_recurring INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL CHECK (amount > 0),
      merchant TEXT NOT NULL,
      category TEXT NOT NULL,
      date TEXT NOT NULL,
      receipt_path TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_income_user_date ON income(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_expenses_user_category ON expenses(user_id, category);
  `);
};

exports.down = (db) => {
  db.exec(`
    DROP TABLE IF EXISTS expenses;
    DROP TABLE IF EXISTS income;
  `);
};
