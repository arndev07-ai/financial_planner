const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  let settings = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(req.user.id);
  if (!settings) {
    db.prepare('INSERT INTO settings (user_id, preferred_currency, notify_budget) VALUES (?, ?, 1)').run(
      req.user.id,
      'USD'
    );
    settings = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(req.user.id);
  }
  res.json(settings);
});

router.put(
  '/',
  [
    body('preferred_currency').optional().matches(/^[A-Z]{3}$/).withMessage('Preferred currency must be an ISO code'),
    body('notify_budget').optional().isBoolean().withMessage('notify_budget must be a boolean'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
    const db = req.app.locals.db;
    const current = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(req.user.id);
    const preferredCurrency = req.body.preferred_currency || current?.preferred_currency || 'USD';
    const notifyBudget =
      req.body.notify_budget !== undefined ? (req.body.notify_budget ? 1 : 0) : current?.notify_budget ?? 1;

    db.prepare(
      `INSERT INTO settings (user_id, preferred_currency, notify_budget, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         preferred_currency = excluded.preferred_currency,
         notify_budget = excluded.notify_budget,
         updated_at = datetime('now')`
    ).run(req.user.id, preferredCurrency, notifyBudget);

    const row = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(req.user.id);
    res.json(row);
  }
);

module.exports = router;
