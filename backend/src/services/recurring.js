function advanceDate(dateStr, frequency) {
  const d = new Date(`${dateStr}T00:00:00`);
  switch (frequency) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      d.setDate(d.getDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function processRecurring(db, userId) {
  const due = db
    .prepare('SELECT * FROM recurring_transactions WHERE user_id = ? AND next_date <= ?')
    .all(userId, todayISO());

  const created = [];
  const updateNext = db.prepare(
    'UPDATE recurring_transactions SET next_date = ? WHERE id = ?'
  );
  const insertExpense = db.prepare(
    `INSERT INTO expenses (user_id, amount, merchant, category, date, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertIncome = db.prepare(
    `INSERT INTO income (user_id, amount, source, category, date, is_recurring, notes)
     VALUES (?, ?, ?, ?, ?, 1, ?)`
  );

  const tx = db.transaction((list) => {
    for (const r of list) {
      const note = `Auto-created from recurring: ${r.description}`;
      let expenseId = null;
      if (r.type === 'expense') {
        const info = insertExpense.run(userId, r.amount, r.description, 'Other', r.next_date, note);
        expenseId = info.lastInsertRowid;
      } else {
        const info = insertIncome.run(userId, r.amount, r.description, 'Other Income', r.next_date, note);
        expenseId = info.lastInsertRowid;
      }
      created.push({ recurringId: r.id, type: r.type, amount: r.amount, description: r.description, date: r.next_date, expenseId });
      updateNext.run(advanceDate(r.next_date, r.frequency), r.id);
    }
  });
  tx(due);

  return { created, count: created.length };
}

function getUpcoming(db, userId, days = 14) {
  const target = new Date();
  target.setDate(target.getDate() + days);
  const targetStr = target.toISOString().slice(0, 10);
  return db
    .prepare('SELECT * FROM recurring_transactions WHERE user_id = ? AND next_date BETWEEN ? AND ? ORDER BY next_date')
    .all(userId, todayISO(), targetStr);
}

module.exports = { processRecurring, getUpcoming, advanceDate };
