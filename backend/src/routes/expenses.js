const express = require('express');
const fs = require('fs');
const path = require('path');
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { backendRoot } = require('../db');

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
  body('merchant').trim().notEmpty().withMessage('Merchant is required'),
  body('category').trim().notEmpty().withMessage('Category is required'),
  body('date').isISO8601().withMessage('A valid date is required'),
  body('notes').optional().isString(),
  body('project_id').optional({ nullable: true }).isInt({ allow_negative: false }),
  body('currency').optional().matches(/^[A-Z]{3}$/).withMessage('Currency must be an ISO code'),
];

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.id;
  const { from, to, category, merchant, month } = req.query;
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
  if (merchant) {
    where += ' AND lower(merchant) LIKE ?';
    params.push(`%${merchant.toLowerCase()}%`);
  }
  if (month) {
    where += ' AND substr(date, 1, 7) = ?';
    params.push(month);
  }

  const rows = db
    .prepare(`SELECT * FROM expenses ${where} ORDER BY date DESC, id DESC`)
    .all(...params);
  res.json(rows);
});

router.post('/', validators, (req, res) => {
  if (!validate(req, res)) return;
  const db = req.app.locals.db;
  const { amount, merchant, category, date, receipt_path, notes, project_id, currency } = req.body;

  const info = db
    .prepare(
      `INSERT INTO expenses (user_id, amount, merchant, category, date, receipt_path, notes, currency)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(req.user.id, amount, merchant, category, date, receipt_path || null, notes || null, currency || 'USD');

  const expenseId = info.lastInsertRowid;

  if (project_id) {
    const project = db.prepare('SELECT * FROM project_budgets WHERE id = ? AND user_id = ?').get(project_id, req.user.id);
    if (project) {
      db.prepare('INSERT OR IGNORE INTO project_expenses (project_id, expense_id) VALUES (?, ?)').run(project_id, expenseId);
      db.prepare('UPDATE project_budgets SET spent = spent + ? WHERE id = ?').run(amount, project_id);
    }
  }

  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(expenseId);
  res.status(201).json(row);
});

router.put('/:id', validators, (req, res) => {
  if (!validate(req, res)) return;
  const db = req.app.locals.db;
  const row = db.prepare('SELECT * FROM expenses WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Expense record not found' });

  const { amount, merchant, category, date, receipt_path, notes, project_id, currency } = req.body;

  const amountDiff = amount - row.amount;
  const oldProject = db
    .prepare('SELECT project_id FROM project_expenses WHERE expense_id = ?')
    .get(row.id);

  db.prepare(
    `UPDATE expenses SET amount = ?, merchant = ?, category = ?, date = ?, receipt_path = ?, notes = ?, currency = ?
     WHERE id = ? AND user_id = ?`
  ).run(amount, merchant, category, date, receipt_path || null, notes || null, currency || row.currency || 'USD', req.params.id, req.user.id);

  if (oldProject && Number(oldProject.project_id) !== Number(project_id)) {
    db.prepare('DELETE FROM project_expenses WHERE expense_id = ?').run(row.id);
    db.prepare('UPDATE project_budgets SET spent = MAX(0, spent - ?) WHERE id = ?').run(row.amount, oldProject.project_id);
    if (project_id) {
      const project = db.prepare('SELECT * FROM project_budgets WHERE id = ? AND user_id = ?').get(project_id, req.user.id);
      if (project) {
        db.prepare('INSERT OR IGNORE INTO project_expenses (project_id, expense_id) VALUES (?, ?)').run(project_id, row.id);
        db.prepare('UPDATE project_budgets SET spent = spent + ? WHERE id = ?').run(amount, project_id);
      }
    }
  } else if (oldProject && project_id && oldProject.project_id === Number(project_id)) {
    db.prepare('UPDATE project_budgets SET spent = spent + ? WHERE id = ?').run(amountDiff, project_id);
  } else if (!oldProject && project_id) {
    const project = db.prepare('SELECT * FROM project_budgets WHERE id = ? AND user_id = ?').get(project_id, req.user.id);
    if (project) {
      db.prepare('INSERT OR IGNORE INTO project_expenses (project_id, expense_id) VALUES (?, ?)').run(project_id, row.id);
      db.prepare('UPDATE project_budgets SET spent = spent + ? WHERE id = ?').run(amount, project_id);
    }
  }

  const updated = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  res.json(updated);
});

function removeReceiptIfExists(receiptPath) {
  if (!receiptPath) return;
  const fullPath = path.resolve(backendRoot(), receiptPath.replace(/^\//, ''));
  if (fullPath.startsWith(path.resolve(backendRoot(), 'uploads')) && fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
}

router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const row = db.prepare('SELECT * FROM expenses WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Expense record not found' });

  const project = db.prepare('SELECT project_id FROM project_expenses WHERE expense_id = ?').get(row.id);
  if (project) {
    db.prepare('UPDATE project_budgets SET spent = MAX(0, spent - ?) WHERE id = ?').run(row.amount, project.project_id);
  }

  db.prepare('DELETE FROM project_expenses WHERE expense_id = ?').run(row.id);
  db.prepare('DELETE FROM expenses WHERE id = ?').run(row.id);
  removeReceiptIfExists(row.receipt_path);

  res.json({ message: 'Expense deleted', id: Number(req.params.id) });
});

module.exports = router;
