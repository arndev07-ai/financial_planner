const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

const { resetDbForTests } = require('../src/db');
const { runUp } = require('../src/db/migrate');
const { createApp } = require('../src/app');

function setupTestApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pennywise-test-'));
  const dbPath = path.join(dir, 'test.db');

  const db = resetDbForTests(dbPath);
  runUp({ close: false, db });

  const app = createApp({ db });
  return { app, db, dbPath, dir };
}

async function registerUser(app, { name = 'Test User', email, password = 'password123' } = {}) {
  const finalEmail = email || `user${Date.now()}-${Math.floor(Math.random() * 100000)}@test.com`;
  const res = await request(app).post('/api/auth/register').send({ name, email: finalEmail, password });
  return { res, email: finalEmail, password };
}

async function loginUser(app, email, password) {
  return request(app).post('/api/auth/login').send({ email, password });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthYear() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

module.exports = { setupTestApp, registerUser, loginUser, todayISO, currentMonthYear };
