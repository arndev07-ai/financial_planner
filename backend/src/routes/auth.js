const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const { authenticate } = require('../middleware/auth');
const { signToken, COOKIE_NAME } = require('../utils/jwt');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' },
});

router.use(authLimiter);

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.COOKIE_SECURE === 'true',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: errors.array()[0].msg });
    return false;
  }
  return true;
}

router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
    body('email').trim().isEmail().withMessage('A valid email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ],
  (req, res) => {
    if (!validate(req, res)) return;
    const db = req.app.locals.db;
    const { name, email, password } = req.body;

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const info = db
      .prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)')
      .run(email.toLowerCase(), passwordHash, name);
    const userId = info.lastInsertRowid;

    const token = signToken({ id: userId, email: email.toLowerCase(), name });
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    return res.status(201).json({
      message: 'User registered successfully',
      token,
      user: { id: userId, email: email.toLowerCase(), name },
    });
  }
);

router.post(
  '/login',
  [body('email').trim().isEmail().withMessage('A valid email is required'), body('password').notEmpty().withMessage('Password is required')],
  (req, res) => {
    if (!validate(req, res)) return;
    const db = req.app.locals.db;
    const { email, password } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken({ id: user.id, email: user.email, name: user.name });
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    return res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });
  }
);

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  return res.json({ message: 'Logged out' });
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
