const express = require('express');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function defaults(req) {
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const from = req.query.from || (() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return d.toISOString().slice(0, 10);
  })();
  return { from, to };
}

router.get('/summary', (req, res) => {
  const db = req.app.locals.db;
  const { from, to } = defaults(req);
  const userId = req.user.id;

  const income = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM income WHERE user_id = ? AND date BETWEEN ? AND ?')
    .get(userId, from, to).total;
  const expenses = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE user_id = ? AND date BETWEEN ? AND ?')
    .get(userId, from, to).total;
  const count = db
    .prepare('SELECT COUNT(*) AS c FROM expenses WHERE user_id = ? AND date BETWEEN ? AND ?')
    .get(userId, from, to).c;

  res.json({
    from,
    to,
    income,
    expenses,
    net: income - expenses,
    transactionCount: count,
  });
});

router.get('/daily', (req, res) => {
  const db = req.app.locals.db;
  const { from, to } = defaults(req);
  const userId = req.user.id;

  const spending = db
    .prepare(
      `SELECT date, SUM(amount) AS total, COUNT(*) AS count
       FROM expenses WHERE user_id = ? AND date BETWEEN ? AND ?
       GROUP BY date ORDER BY date`
    )
    .all(userId, from, to);
  const earning = db
    .prepare(
      `SELECT date, SUM(amount) AS total, COUNT(*) AS count
       FROM income WHERE user_id = ? AND date BETWEEN ? AND ?
       GROUP BY date ORDER BY date`
    )
    .all(userId, from, to);

  const merged = {};
  const cursor = new Date(from);
  const end = new Date(to);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    merged[key] = { date: key, spending: 0, income: 0, net: 0 };
    cursor.setDate(cursor.getDate() + 1);
  }
  for (const s of spending) {
    if (merged[s.date]) merged[s.date].spending = s.total;
  }
  for (const e of earning) {
    if (merged[e.date]) merged[e.date].income = e.total;
  }
  const result = Object.values(merged).map((d) => ({ ...d, net: d.income - d.spending }));
  res.json({ from, to, days: result });
});

router.get('/weekly', (req, res) => {
  const db = req.app.locals.db;
  const { from, to } = defaults(req);
  const userId = req.user.id;

  const rows = db
    .prepare(
      `SELECT
         strftime('%Y-W%W', date) AS week,
         SUM(amount) AS spending,
         COUNT(*) AS count
       FROM expenses
       WHERE user_id = ? AND date BETWEEN ? AND ?
       GROUP BY week ORDER BY week`
    )
    .all(userId, from, to);
  res.json({ from, to, weeks: rows });
});

router.get('/monthly', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.id;

  const spending = db
    .prepare(
      `SELECT substr(date, 1, 7) AS month, SUM(amount) AS spending, COUNT(*) AS count
       FROM expenses WHERE user_id = ?
       GROUP BY month ORDER BY month DESC LIMIT 12`
    )
    .all(userId);
  const earning = db
    .prepare(
      `SELECT substr(date, 1, 7) AS month, SUM(amount) AS income, COUNT(*) AS count
       FROM income WHERE user_id = ?
       GROUP BY month ORDER BY month DESC LIMIT 12`
    )
    .all(userId);

  const merged = new Map();
  for (const s of spending) merged.set(s.month, { month: s.month, spending: s.spending, income: 0 });
  for (const e of earning) {
    const entry = merged.get(e.month) || { month: e.month, spending: 0 };
    entry.income = e.income;
    merged.set(e.month, entry);
  }
  const months = Array.from(merged.values())
    .map((m) => ({ ...m, net: (m.income || 0) - m.spending }))
    .sort((a, b) => a.month.localeCompare(b.month));

  res.json({ months });
});

router.get('/categories', (req, res) => {
  const db = req.app.locals.db;
  const { from, to } = defaults(req);
  const userId = req.user.id;

  const rows = db
    .prepare(
      `SELECT category AS name, SUM(amount) AS total, COUNT(*) AS count
       FROM expenses WHERE user_id = ? AND date BETWEEN ? AND ?
       GROUP BY category ORDER BY total DESC`
    )
    .all(userId, from, to);
  res.json({ from, to, categories: rows });
});

router.get('/top-spending', (req, res) => {
  const db = req.app.locals.db;
  const { from, to } = defaults(req);
  const userId = req.user.id;

  const byMerchant = db
    .prepare(
      `SELECT merchant, category, SUM(amount) AS total, COUNT(*) AS occurrences
       FROM expenses WHERE user_id = ? AND date BETWEEN ? AND ?
       GROUP BY merchant ORDER BY occurrences DESC, total DESC LIMIT 10`
    )
    .all(userId, from, to);
  res.json({ from, to, merchants: byMerchant });
});

router.get('/high-spending-days', (req, res) => {
  const db = req.app.locals.db;
  const { from, to } = defaults(req);
  const userId = req.user.id;

  const daily = db
    .prepare(
      `SELECT date, SUM(amount) AS total, COUNT(*) AS count
       FROM expenses WHERE user_id = ? AND date BETWEEN ? AND ?
       GROUP BY date`
    )
    .all(userId, from, to);

  const totals = daily.map((d) => d.total);
  const avg = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
  const stddev = totals.length
    ? Math.sqrt(totals.reduce((a, b) => a + (b - avg) ** 2, 0) / totals.length)
    : 0;
  const threshold = avg + stddev;

  const highDays = daily.filter((d) => d.total > threshold).sort((a, b) => b.total - a.total);
  res.json({ from, to, avgDaily: avg, threshold, highDays });
});

module.exports = router;
