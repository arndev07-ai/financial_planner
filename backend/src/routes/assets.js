const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const validate = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: errors.array()[0].msg });
    return false;
  }
  return true;
};

const validators = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('type').isIn(['cash', 'investment', 'property', 'crypto', 'other']).withMessage('Invalid asset type'),
  body('value').isFloat({ min: 0 }).withMessage('Value must be 0 or greater'),
  body('currency').optional().matches(/^[A-Z]{3}$/).withMessage('Currency must be an ISO code'),
  body('note').optional().isString(),
];

function recordSnapshot(db, userId) {
  const rows = db.prepare('SELECT * FROM assets WHERE user_id = ?').all(userId);
  const total = rows.reduce((s, a) => s + a.value, 0);
  const today = new Date().toISOString().slice(0, 10);
  db.prepare(
    `INSERT INTO net_worth_snapshots (user_id, date, value) VALUES (?, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET value = excluded.value`
  ).run(userId, today, total);
}

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const rows = db.prepare('SELECT * FROM assets WHERE user_id = ? ORDER BY value DESC').all(req.user.id);
  res.json(rows);
});

router.get('/networth', (req, res) => {
  const db = req.app.locals.db;
  const rows = db.prepare('SELECT * FROM assets WHERE user_id = ?').all(req.user.id);
  const total = rows.reduce((s, a) => s + a.value, 0);
  const byType = {};
  for (const a of rows) {
    byType[a.type] = (byType[a.type] || 0) + a.value;
  }
  const snapshot = db.prepare('SELECT * FROM net_worth_snapshots WHERE user_id = ? ORDER BY date ASC').all(req.user.id);
  res.json({ total, byType, count: rows.length, history: snapshot.map((s) => ({ date: s.date, value: s.value })) });
});

router.post('/', validators, (req, res) => {
  if (!validate(req, res)) return;
  const db = req.app.locals.db;
  const { name, type, value, currency, note } = req.body;
  const info = db
    .prepare('INSERT INTO assets (user_id, name, type, value, currency, note) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user.id, name, type, value, currency || 'USD', note || null);
  recordSnapshot(db, req.user.id);
  const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.put('/:id', validators, (req, res) => {
  if (!validate(req, res)) return;
  const db = req.app.locals.db;
  const existing = db.prepare('SELECT * FROM assets WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Asset not found' });

  const { name, type, value, currency, note } = req.body;
  db.prepare('UPDATE assets SET name = ?, type = ?, value = ?, currency = ?, note = ? WHERE id = ?').run(
    name,
    type,
    value,
    currency || 'USD',
    note || null,
    req.params.id
  );
  recordSnapshot(db, req.user.id);
  const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  res.json(row);
});

router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const info = db.prepare('DELETE FROM assets WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Asset not found' });
  recordSnapshot(db, req.user.id);
  res.json({ message: 'Asset deleted', id: Number(req.params.id) });
});

module.exports = router;
