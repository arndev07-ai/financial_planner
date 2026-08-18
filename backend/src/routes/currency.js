const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const DEFAULT_RATES = [
  { base: 'USD', quote: 'EUR', rate: 0.92 },
  { base: 'USD', quote: 'GBP', rate: 0.79 },
  { base: 'USD', quote: 'JPY', rate: 149.5 },
  { base: 'USD', quote: 'CAD', rate: 1.36 },
  { base: 'USD', quote: 'AUD', rate: 1.52 },
  { base: 'USD', quote: 'INR', rate: 83.9 },
  { base: 'USD', quote: 'CNY', rate: 7.15 },
  { base: 'USD', quote: 'CHF', rate: 0.88 },
  { base: 'USD', quote: 'SGD', rate: 1.34 },
];

function ensureRates(db) {
  const count = db.prepare('SELECT COUNT(*) c FROM currency_rates').get().c;
  if (count === 0) {
    const insert = db.prepare('INSERT INTO currency_rates (base, quote, rate) VALUES (?, ?, ?)');
    const tx = db.transaction((rates) => {
      for (const r of rates) insert.run(r.base, r.quote, r.rate);
    });
    tx(DEFAULT_RATES);
  }
}

function getRate(db, from, to) {
  if (from === to) return 1;
  const direct = db.prepare('SELECT rate FROM currency_rates WHERE base = ? AND quote = ?').get(from, to);
  if (direct) return direct.rate;
  const inverse = db.prepare('SELECT rate FROM currency_rates WHERE base = ? AND quote = ?').get(to, from);
  if (inverse) return 1 / inverse.rate;
  const usdFrom = db.prepare('SELECT rate FROM currency_rates WHERE base = ? AND quote = ?').get('USD', from);
  const usdTo = db.prepare('SELECT rate FROM currency_rates WHERE base = ? AND quote = ?').get('USD', to);
  if (usdFrom && usdTo) return usdFrom.rate / usdTo.rate;
  return null;
}

router.get('/rates', (req, res) => {
  const db = req.app.locals.db;
  ensureRates(db);
  const rows = db.prepare('SELECT base, quote, rate FROM currency_rates ORDER BY quote').all();
  res.json({ base: 'USD', rates: rows });
});

router.post(
  '/rates',
  [
    body('base').matches(/^[A-Z]{3}$/).withMessage('base must be an ISO currency code'),
    body('quote').matches(/^[A-Z]{3}$/).withMessage('quote must be an ISO currency code'),
    body('rate').isFloat({ gt: 0 }).withMessage('rate must be greater than 0'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
    const db = req.app.locals.db;
    ensureRates(db);
    const { base, quote, rate } = req.body;
    db.prepare(
      `INSERT INTO currency_rates (base, quote, rate) VALUES (?, ?, ?)
       ON CONFLICT(base, quote) DO UPDATE SET rate = excluded.rate, updated_at = datetime('now')`
    ).run(base.toUpperCase(), quote.toUpperCase(), rate);
    res.json({ base: base.toUpperCase(), quote: quote.toUpperCase(), rate });
  }
);

router.get('/convert', (req, res) => {
  const db = req.app.locals.db;
  ensureRates(db);
  const amount = Number(req.query.amount);
  const from = (req.query.from || 'USD').toUpperCase();
  const to = (req.query.to || 'USD').toUpperCase();
  if (!amount || amount <= 0) return res.status(400).json({ error: 'amount must be greater than 0' });
  const rate = getRate(db, from, to);
  if (rate === null) return res.status(400).json({ error: `No rate available for ${from} -> ${to}` });
  res.json({ amount, from, to, rate, converted: Math.round(amount * rate * 100) / 100 });
});

router.get('/convert/transactions', (req, res) => {
  const db = req.app.locals.db;
  ensureRates(db);
  const to = (req.query.to || 'USD').toUpperCase();
  const userId = req.user.id;
  const { from, to: dateTo } = req.query;
  const params = [userId];
  let where = 'WHERE user_id = ?';
  if (from) {
    where += ' AND date >= ?';
    params.push(from);
  }
  if (dateTo) {
    where += ' AND date <= ?';
    params.push(dateTo);
  }

  const expenses = db.prepare(`SELECT * FROM expenses ${where}`).all(...params);
  const income = db.prepare(`SELECT * FROM income ${where}`).all(...params);

  const convert = (currency, value) => {
    const rate = getRate(db, currency || 'USD', to);
    return rate === null ? null : value * rate;
  };

  let totalExpenses = 0;
  for (const e of expenses) {
    const v = convert(e.currency, e.amount);
    if (v !== null) totalExpenses += v;
  }
  let totalIncome = 0;
  for (const i of income) {
    const v = convert(i.currency, i.amount);
    if (v !== null) totalIncome += v;
  }

  res.json({
    to,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    totalIncome: Math.round(totalIncome * 100) / 100,
    net: Math.round((totalIncome - totalExpenses) * 100) / 100,
  });
});

module.exports = router;
