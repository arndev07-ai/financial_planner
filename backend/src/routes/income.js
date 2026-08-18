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
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than 0'),
  body('source').trim().notEmpty().withMessage('Source is required'),
  body('category').trim().notEmpty().withMessage('Category is required'),
  body('date').isISO8601().withMessage('A valid date is required'),
  body('is_recurring').optional().isBoolean().withMessage('is_recurring must be a boolean'),
  body('notes').optional().isString(),
  body('currency').optional().matches(/^[A-Z]{3}$/).withMessage('Currency must be an ISO code'),
];

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.id;
  const { from, to, category, month } = req.query;
  const params = [];
  let where = 'WHERE user_id = ?';
  params.push(userId);

  if (from) {
    where += ' AND date >= ?';
    params.push(from);
  }
  if (to) {
    where += ' AND date <= ?';
    params.push(to);
  }
  if (category) {
    where += ' AND category = ?';
    params.push(category);
  }
  if (month) {
    where += ' AND substr(date, 1, 7) = ?';
    params.push(month);
  }

  const rows = db
    .prepare(`SELECT * FROM income ${where} ORDER BY date DESC, id DESC`)
    .all(...params);
  res.json(rows);
});

router.post('/', validators, (req, res) => {
  if (!validate(req, res)) return;
  const db = req.app.locals.db;
  const { amount, source, category, date, is_recurring, notes, currency } = req.body;
  const info = db
    .prepare(
      `INSERT INTO income (user_id, amount, source, category, date, is_recurring, notes, currency)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(req.user.id, amount, source, category, date, is_recurring ? 1 : 0, notes || null, currency || 'USD');
  const row = db.prepare('SELECT * FROM income WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.put('/:id', validators, (req, res) => {
  if (!validate(req, res)) return;
  const db = req.app.locals.db;
  const row = db.prepare('SELECT * FROM income WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Income record not found' });

  const { amount, source, category, date, is_recurring, notes, currency } = req.body;
  db.prepare(
    `UPDATE income SET amount = ?, source = ?, category = ?, date = ?, is_recurring = ?, notes = ?, currency = ?
     WHERE id = ? AND user_id = ?`
  ).run(amount, source, category, date, is_recurring ? 1 : 0, notes || null, currency || row.currency || 'USD', req.params.id, req.user.id);

  const updated = db.prepare('SELECT * FROM income WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const info = db.prepare('DELETE FROM income WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Income record not found' });
  res.json({ message: 'Income deleted', id: Number(req.params.id) });
});

module.exports = router;
