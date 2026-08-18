require('dotenv').config();

const { getDb, ensureDataDir } = require('./db');
const { runUp } = require('./db/migrate');
const { createApp } = require('./app');
const { processRecurring } = require('./services/recurring');

const PORT = process.env.PORT || 5000;

async function main() {
  process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err.message);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason instanceof Error ? reason.message : reason);
  });

  ensureDataDir();
  runUp();
  const db = getDb();
  const app = createApp({ db });

  const server = app.listen(PORT, () => {
    console.log(`PennyWise API listening on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });

  const processDue = () => {
    try {
      const users = db.prepare('SELECT id FROM users').all();
      let created = 0;
      for (const u of users) {
        created += processRecurring(db, u.id).count;
      }
      if (created > 0) console.log(`[recurring] auto-created ${created} transaction(s)`);
    } catch (err) {
      console.error('[recurring] error:', err.message);
    }
  };

  const interval = setInterval(processDue, process.env.RECURRING_INTERVAL_MS || 6 * 60 * 60 * 1000);
  setTimeout(processDue, 5000);

  const shutdown = () => {
    console.log('\nShutting down...');
    clearInterval(interval);
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
