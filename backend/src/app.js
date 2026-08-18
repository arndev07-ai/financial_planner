const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const incomeRoutes = require('./routes/income');
const expenseRoutes = require('./routes/expenses');
const categoryRoutes = require('./routes/categories');
const budgetRoutes = require('./routes/budgets');
const analyticsRoutes = require('./routes/analytics');
const recurringRoutes = require('./routes/recurring');
const projectRoutes = require('./routes/projects');
const uploadRoutes = require('./routes/upload');
const assetRoutes = require('./routes/assets');
const exportRoutes = require('./routes/export');
const importRoutes = require('./routes/import');
const currencyRoutes = require('./routes/currency');
const settingsRoutes = require('./routes/settings');
const { sanitizeBody } = require('./middleware/sanitize');

function createApp({ db } = {}) {
  const app = express();

  const trustProxy = process.env.TRUST_PROXY === 'true';
  if (trustProxy) {
    app.set('trust proxy', 1);
  }

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );
  app.use(compression());
  app.use(
    cors({
      origin: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(','),
      credentials: true,
    })
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(sanitizeBody);

  app.use('/uploads', express.static(path.resolve(__dirname, '..', 'uploads')));

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api/')) return next();
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.get('/api/health', (req, res) => {
    let dbOk = false;
    try {
      dbOk = req.app.locals.db.prepare('SELECT 1').get() !== undefined;
    } catch (e) {
      dbOk = false;
    }
    res.json({ status: 'ok', database: dbOk ? 'connected' : 'error', time: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/income', incomeRoutes);
  app.use('/api/expenses', expenseRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/budgets', budgetRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/recurring', recurringRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/upload', uploadRoutes);
  app.use('/api/assets', assetRoutes);
  app.use('/api/export', exportRoutes);
  app.use('/api/import', importRoutes);
  app.use('/api/currency', currencyRoutes);
  app.use('/api/settings', settingsRoutes);

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.status === 413) {
      return res.status(413).json({ error: 'File too large' });
    }
    if (err && err.name === 'MulterError') {
      return res.status(400).json({ error: err.message });
    }
    console.error('Unhandled error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });

  app.locals.db = db;
  return app;
}

module.exports = { createApp };
