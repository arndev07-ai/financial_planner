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

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const rows = db
    .prepare(
      `SELECT p.*,
              (SELECT COUNT(*) FROM project_expenses pe WHERE pe.project_id = p.id) AS expense_count
       FROM project_budgets p
       WHERE p.user_id = ?
       ORDER BY p.created_at DESC`
    )
    .all(req.user.id);
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const project = db
    .prepare('SELECT * FROM project_budgets WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const expenses = db
    .prepare(
      `SELECT e.* FROM expenses e
       JOIN project_expenses pe ON pe.expense_id = e.id
       WHERE pe.project_id = ? ORDER BY e.date DESC`
    )
    .all(project.id);
  res.json({ ...project, expenses });
});

router.get('/:id/expenses', (req, res) => {
  const db = req.app.locals.db;
  const project = db
    .prepare('SELECT id FROM project_budgets WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const expenses = db
    .prepare(
      `SELECT e.* FROM expenses e
       JOIN project_expenses pe ON pe.expense_id = e.id
       WHERE pe.project_id = ? ORDER BY e.date DESC`
    )
    .all(req.params.id);
  res.json(expenses);
});

router.post(
  '/:id/expenses',
  [body('expense_id').isInt({ gt: 0 }).withMessage('A valid expense_id is required')],
  (req, res) => {
    if (!validate(req, res)) return;
    const db = req.app.locals.db;
    const project = db
      .prepare('SELECT * FROM project_budgets WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const expense = db
      .prepare('SELECT * FROM expenses WHERE id = ? AND user_id = ?')
      .get(req.body.expense_id, req.user.id);
    if (!expense) return res.status(404).json({ error: 'Expense not found' });

    const already = db
      .prepare('SELECT id FROM project_expenses WHERE project_id = ? AND expense_id = ?')
      .get(project.id, expense.id);
    if (already) return res.status(409).json({ error: 'Expense is already linked to this project' });

    db.prepare('INSERT INTO project_expenses (project_id, expense_id) VALUES (?, ?)').run(project.id, expense.id);
    db.prepare('UPDATE project_budgets SET spent = spent + ? WHERE id = ?').run(expense.amount, project.id);

    const updated = db.prepare('SELECT * FROM project_budgets WHERE id = ?').get(project.id);
    res.status(201).json({ message: 'Expense linked to project', project: updated, expense });
  }
);

router.delete('/:projectId/expenses/:expenseId', (req, res) => {
  const db = req.app.locals.db;
  const project = db
    .prepare('SELECT * FROM project_budgets WHERE id = ? AND user_id = ?')
    .get(req.params.projectId, req.user.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const link = db
    .prepare('SELECT * FROM project_expenses WHERE project_id = ? AND expense_id = ?')
    .get(project.id, req.params.expenseId);
  if (!link) return res.status(404).json({ error: 'Expense not linked to this project' });

  const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(link.expense_id);
  db.prepare('DELETE FROM project_expenses WHERE project_id = ? AND expense_id = ?').run(project.id, expense.id);
  db.prepare('UPDATE project_budgets SET spent = MAX(0, spent - ?) WHERE id = ?').run(expense.amount, project.id);

  res.json({ message: 'Expense unlinked from project' });
});

router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Project name is required'),
    body('total_budget').isFloat({ gt: 0 }).withMessage('Total budget must be greater than 0'),
    body('start_date').isISO8601().withMessage('A valid start date is required'),
    body('end_date').optional({ nullable: true }).isISO8601().withMessage('A valid end date is required'),
  ],
  (req, res) => {
    if (!validate(req, res)) return;
    const db = req.app.locals.db;
    const { name, total_budget, start_date, end_date } = req.body;
    const info = db
      .prepare(
        `INSERT INTO project_budgets (user_id, name, total_budget, spent, start_date, end_date)
         VALUES (?, ?, ?, 0, ?, ?)`
      )
      .run(req.user.id, name, total_budget, start_date, end_date || null);
    const row = db.prepare('SELECT * FROM project_budgets WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(row);
  }
);

router.put(
  '/:id',
  [
    body('name').trim().notEmpty().withMessage('Project name is required'),
    body('total_budget').isFloat({ gt: 0 }).withMessage('Total budget must be greater than 0'),
    body('start_date').isISO8601().withMessage('A valid start date is required'),
    body('end_date').optional({ nullable: true }).isISO8601().withMessage('A valid end date is required'),
  ],
  (req, res) => {
    if (!validate(req, res)) return;
    const db = req.app.locals.db;
    const existing = db
      .prepare('SELECT * FROM project_budgets WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Project not found' });

    const { name, total_budget, start_date, end_date } = req.body;
    db.prepare(
      'UPDATE project_budgets SET name = ?, total_budget = ?, start_date = ?, end_date = ? WHERE id = ?'
    ).run(name, total_budget, start_date, end_date || null, req.params.id);
    const row = db.prepare('SELECT * FROM project_budgets WHERE id = ?').get(req.params.id);
    res.json(row);
  }
);

router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const info = db.prepare('DELETE FROM project_budgets WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Project not found' });
  res.json({ message: 'Project deleted', id: Number(req.params.id) });
});

module.exports = router;
