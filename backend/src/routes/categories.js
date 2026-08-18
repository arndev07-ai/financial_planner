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
  const type = req.query.type;

  const defaults = db.prepare('SELECT * FROM categories WHERE user_id IS NULL ORDER BY type, name').all();
  const userCats = db.prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);

  let result = [...defaults, ...userCats];
  if (type === 'income' || type === 'expense') {
    result = result.filter((c) => c.type === type);
  }
  res.json(result);
});

router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 40 }),
    body('type').isIn(['income', 'expense']).withMessage('Type must be income or expense'),
    body('color').optional().matches(/^#[0-9a-fA-F]{6}$/).withMessage('Color must be a hex value'),
    body('icon').optional().isString(),
  ],
  (req, res) => {
    if (!validate(req, res)) return;
    const db = req.app.locals.db;
    const { name, type, color, icon } = req.body;

    const existing = db
      .prepare('SELECT id FROM categories WHERE user_id = ? AND lower(name) = lower(?) AND type = ?')
      .get(req.user.id, name, type);
    if (existing) return res.status(409).json({ error: 'A category with this name already exists' });

    const info = db
      .prepare('INSERT INTO categories (user_id, name, type, color, icon, is_default) VALUES (?, ?, ?, ?, ?, 0)')
      .run(req.user.id, name, type, color || '#64748b', icon || 'tag');
    const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(row);
  }
);

router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Category not found' });
  if (row.user_id === null) return res.status(400).json({ error: 'Default categories cannot be deleted' });
  if (row.user_id !== req.user.id) return res.status(404).json({ error: 'Category not found' });

  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ message: 'Category deleted', id: Number(req.params.id) });
});

module.exports = router;
