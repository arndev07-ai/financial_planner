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

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthRange(monthYear) {
  const [y, m] = monthYear.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const endDate = new Date(y, m, 0);
  const end = `${y}-${String(m).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
  return { start, end };
}

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.id;
  const month = req.query.month || currentMonth();
  const { start, end } = monthRange(month);

  const budgets = db
    .prepare(
      `SELECT b.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon
       FROM budgets b
       JOIN categories c ON c.id = b.category_id
       WHERE b.user_id = ? AND b.month_year = ?
       ORDER BY c.name`
    )
    .all(userId, month);

  const spendStmt = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS spent FROM expenses
     WHERE user_id = ? AND category = ? AND date BETWEEN ? AND ?`
  );

  const result = budgets.map((b) => {
    const spent = spendStmt.get(userId, b.category_name, start, end).spent;
    return { ...b, spent, progress: b.amount > 0 ? Math.min(100, Math.round((spent / b.amount) * 100)) : 0 };
  });

  res.json({ month, budgets: result });
});

router.post(
  '/',
  [
    body('category_id').isInt({ gt: 0 }).withMessage('A valid category is required'),
    body('amount').isFloat({ gt: 0 }).withMessage('Budget amount must be greater than 0'),
    body('month_year').optional().matches(/^\d{4}-\d{2}$/).withMessage('month_year must be YYYY-MM'),
  ],
  (req, res) => {
    if (!validate(req, res)) return;
    const db = req.app.locals.db;
    const userId = req.user.id;
    const { category_id, amount } = req.body;
    const monthYear = req.body.month_year || currentMonth();

    const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(category_id);
    if (!cat || cat.type !== 'expense') {
      return res.status(400).json({ error: 'Budgets can only be set for expense categories' });
    }

    db.prepare(
      `INSERT INTO budgets (user_id, category_id, amount, month_year)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, category_id, month_year) DO UPDATE SET amount = excluded.amount`
    ).run(userId, category_id, amount, monthYear);

    const row = db
      .prepare('SELECT * FROM budgets WHERE user_id = ? AND category_id = ? AND month_year = ?')
      .get(userId, category_id, monthYear);
    res.status(201).json(row);
  }
);

router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const info = db.prepare('DELETE FROM budgets WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Budget not found' });
  res.json({ message: 'Budget removed', id: Number(req.params.id) });
});

module.exports = router;
