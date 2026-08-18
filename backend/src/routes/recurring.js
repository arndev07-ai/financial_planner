const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { processRecurring, getUpcoming } = require('../services/recurring');

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
  body('type').isIn(['income', 'expense']).withMessage('Type must be income or expense'),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than 0'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('frequency').isIn(['daily', 'weekly', 'monthly', 'yearly']).withMessage('Invalid frequency'),
  body('next_date').isISO8601().withMessage('A valid next_date is required'),
];

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  processRecurring(db, req.user.id);
  const rows = db
    .prepare('SELECT * FROM recurring_transactions WHERE user_id = ? ORDER BY next_date')
    .all(req.user.id);
  res.json(rows);
});

router.get('/upcoming', (req, res) => {
  const db = req.app.locals.db;
  const days = Math.min(Number(req.query.days) || 14, 90);
  res.json({ days, items: getUpcoming(db, req.user.id, days) });
});

router.post('/process', (req, res) => {
  const db = req.app.locals.db;
  const result = processRecurring(db, req.user.id);
  res.json(result);
});

router.post('/', validators, (req, res) => {
  if (!validate(req, res)) return;
  const db = req.app.locals.db;
  const { type, amount, description, frequency, next_date } = req.body;
  const info = db
    .prepare(
      `INSERT INTO recurring_transactions (user_id, type, amount, description, frequency, next_date)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(req.user.id, type, amount, description, frequency, next_date);
  const row = db.prepare('SELECT * FROM recurring_transactions WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const info = db
    .prepare('DELETE FROM recurring_transactions WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Recurring transaction not found' });
  res.json({ message: 'Recurring transaction deleted', id: Number(req.params.id) });
});

module.exports = router;
