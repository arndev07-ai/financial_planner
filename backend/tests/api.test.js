const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { setupTestApp, registerUser, loginUser, todayISO, currentMonthYear } = require('./helpers');

let app;

before(() => {
  ({ app } = setupTestApp());
});

describe('Health and database connection', () => {
  test('GET /api/health reports database connected', async () => {
    const res = await request(app).get('/api/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'ok');
    assert.strictEqual(res.body.database, 'connected');
  });

  test('All tables exist with proper schema', () => {
    const db = app.locals.db;
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((t) => t.name);
    for (const name of ['users', 'income', 'expenses', 'categories', 'budgets', 'project_budgets', 'project_expenses', 'recurring_transactions']) {
      assert.ok(tables.includes(name), `table ${name} should exist`);
    }
  });

  test('Default categories are seeded', () => {
    const db = app.locals.db;
    const count = db.prepare('SELECT COUNT(*) c FROM categories WHERE user_id IS NULL').get().c;
    assert.ok(count > 0);
  });
});

describe('Auth', () => {
  test('Register returns 201 with token and user', async () => {
    const { res } = await registerUser(app);
    assert.strictEqual(res.status, 201);
    assert.ok(res.body.token);
    assert.ok(res.body.user.email);
    assert.ok(res.body.user.id);
    assert.ok(res.headers['set-cookie'].some((c) => c.includes('pennywise_token')));
  });

  test('Register enforces password minimum 8 chars', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'X', email: 'short@test.com', password: 'short' });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.error, /at least 8/i);
  });

  test('Register rejects duplicate email', async () => {
    const { email } = await registerUser(app);
    const res = await request(app).post('/api/auth/register').send({ name: 'X', email, password: 'password123' });
    assert.strictEqual(res.status, 409);
  });

  test('Login returns 200 with JWT token', async () => {
    const { email, password } = await registerUser(app);
    const res = await loginUser(app, email, password);
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.token);
  });

  test('Login with invalid credentials returns 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@test.com', password: 'wrongpass' });
    assert.strictEqual(res.status, 401);
  });

  test('Protected route returns 401 without token', async () => {
    const res = await request(app).get('/api/categories');
    assert.strictEqual(res.status, 401);
  });

  test('Protected route works with token', async () => {
    const { email, password } = await registerUser(app);
    const login = await loginUser(app, email, password);
    const res = await request(app)
      .get('/api/categories')
      .set('Authorization', `Bearer ${login.body.token}`);
    assert.strictEqual(res.status, 200);
  });

  test('/api/auth/me returns current user', async () => {
    const { email, password } = await registerUser(app);
    const login = await loginUser(app, email, password);
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.user.email, email);
  });
});

describe('Income CRUD', () => {
  let token;
  let incomeId;

  before(async () => {
    const { email, password } = await registerUser(app);
    const login = await loginUser(app, email, password);
    token = login.body.token;
  });

  test('POST /api/income creates a record', async () => {
    const res = await request(app)
      .post('/api/income')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 2500, source: 'Salary', category: 'Salary', date: todayISO(), notes: 'Monthly salary' });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.amount, 2500);
    incomeId = res.body.id;
  });

  test('POST /api/income rejects amount <= 0', async () => {
    const res = await request(app)
      .post('/api/income')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 0, source: 'X', category: 'Y', date: todayISO() });
    assert.strictEqual(res.status, 400);
  });

  test('GET /api/income returns array sorted by date', async () => {
    const res = await request(app).get('/api/income').set('Authorization', `Bearer ${token}`);
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 1);
    for (let i = 1; i < res.body.length; i++) {
      assert.ok(res.body[i - 1].date >= res.body[i].date);
    }
  });

  test('GET /api/income filters by date range', async () => {
    const res = await request(app)
      .get('/api/income')
      .query({ from: todayISO(), to: todayISO() })
      .set('Authorization', `Bearer ${token}`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.every((r) => r.date === todayISO()));
  });

  test('PUT /api/income/:id updates a record', async () => {
    const res = await request(app)
      .put(`/api/income/${incomeId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 2600, source: 'Salary', category: 'Salary', date: todayISO(), notes: 'Updated' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.amount, 2600);
  });

  test('DELETE /api/income/:id deletes a record', async () => {
    const res = await request(app).delete(`/api/income/${incomeId}`).set('Authorization', `Bearer ${token}`);
    assert.strictEqual(res.status, 200);
    const after = await request(app).get('/api/income').set('Authorization', `Bearer ${token}`);
    assert.ok(!after.body.some((r) => r.id === incomeId));
  });

  test('Income is user-scoped', async () => {
    const { email, password } = await registerUser(app);
    const other = await loginUser(app, email, password);
    const res = await request(app).delete(`/api/income/${incomeId}`).set('Authorization', `Bearer ${other.body.token}`);
    assert.strictEqual(res.status, 404);
  });
});

describe('Expense CRUD', () => {
  let token;
  let expenseId;

  before(async () => {
    const { email, password } = await registerUser(app);
    const login = await loginUser(app, email, password);
    token = login.body.token;
  });

  test('POST /api/expenses creates a record', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 42.5, merchant: 'Starbucks', category: 'Food & Dining', date: todayISO(), notes: 'Coffee' });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.merchant, 'Starbucks');
    expenseId = res.body.id;
  });

  test('GET /api/expenses returns array', async () => {
    const res = await request(app).get('/api/expenses').set('Authorization', `Bearer ${token}`);
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 1);
  });

  test('PUT /api/expenses/:id updates a record', async () => {
    const res = await request(app)
      .put(`/api/expenses/${expenseId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 50, merchant: 'Starbucks', category: 'Food & Dining', date: todayISO(), notes: 'Updated' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.amount, 50);
  });

  test('DELETE /api/expenses/:id deletes a record', async () => {
    const res = await request(app).delete(`/api/expenses/${expenseId}`).set('Authorization', `Bearer ${token}`);
    assert.strictEqual(res.status, 200);
  });
});

describe('Categories', () => {
  let token;

  before(async () => {
    const { email, password } = await registerUser(app);
    const login = await loginUser(app, email, password);
    token = login.body.token;
  });

  test('GET /api/categories returns default + custom categories', async () => {
    const res = await request(app).get('/api/categories').set('Authorization', `Bearer ${token}`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.length > 0);
  });

  test('POST /api/categories creates custom category', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Subscriptions', type: 'expense', color: '#123456', icon: 'repeat' });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.name, 'Subscriptions');
    assert.strictEqual(res.body.is_default, 0);
  });

  test('DELETE /api/categories/:id deletes custom category', async () => {
    const created = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Temp Cat', type: 'expense' });
    const res = await request(app).delete(`/api/categories/${created.body.id}`).set('Authorization', `Bearer ${token}`);
    assert.strictEqual(res.status, 200);
  });

  test('Default categories cannot be deleted', async () => {
    const cats = await request(app).get('/api/categories').set('Authorization', `Bearer ${token}`);
    const def = cats.body.find((c) => c.is_default === 1);
    const res = await request(app).delete(`/api/categories/${def.id}`).set('Authorization', `Bearer ${token}`);
    assert.strictEqual(res.status, 400);
  });
});

describe('Budgets', () => {
  let token;
  let catId;

  before(async () => {
    const { email, password } = await registerUser(app);
    const login = await loginUser(app, email, password);
    token = login.body.token;
    const cats = await request(app).get('/api/categories').set('Authorization', `Bearer ${token}`);
    catId = cats.body.find((c) => c.type === 'expense').id;
  });

  test('POST /api/budgets sets a monthly budget', async () => {
    const res = await request(app)
      .post('/api/budgets')
      .set('Authorization', `Bearer ${token}`)
      .send({ category_id: catId, amount: 500, month_year: currentMonthYear() });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.amount, 500);
  });

  test('GET /api/budgets returns progress', async () => {
    const res = await request(app).get('/api/budgets').set('Authorization', `Bearer ${token}`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.budgets.length >= 1);
    assert.ok(typeof res.body.budgets[0].spent === 'number');
    assert.ok(typeof res.body.budgets[0].progress === 'number');
  });

  test('Budget progress reflects added expenses', async () => {
    await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, merchant: 'Test Shop', category: 'Food & Dining', date: todayISO() });
    const cats = await request(app).get('/api/categories').set('Authorization', `Bearer ${token}`);
    const foodCat = cats.body.find((c) => c.name === 'Food & Dining' && c.type === 'expense');
    await request(app)
      .post('/api/budgets')
      .set('Authorization', `Bearer ${token}`)
      .send({ category_id: foodCat.id, amount: 200, month_year: currentMonthYear() });
    const res = await request(app).get('/api/budgets').set('Authorization', `Bearer ${token}`);
    const budget = res.body.budgets.find((b) => b.category_id === foodCat.id);
    assert.ok(budget.spent >= 100, 'spent should include the added expense');
    assert.ok(budget.progress >= 50, 'progress should be at least 50%');
  });
});

describe('Analytics', () => {
  let token;

  before(async () => {
    const { email, password } = await registerUser(app);
    const login = await loginUser(app, email, password);
    token = login.body.token;
    await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 30, merchant: 'Cafe', category: 'Food & Dining', date: todayISO() });
    await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 70, merchant: 'Grocery Store', category: 'Groceries', date: todayISO() });
    await request(app)
      .post('/api/income')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 1000, source: 'Salary', category: 'Salary', date: todayISO() });
  });

  test('GET /api/analytics/summary returns totals', async () => {
    const res = await request(app).get('/api/analytics/summary').set('Authorization', `Bearer ${token}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.expenses, 100);
    assert.strictEqual(res.body.income, 1000);
    assert.strictEqual(res.body.net, 900);
  });

  test('GET /api/analytics/daily returns daily breakdown', async () => {
    const res = await request(app).get('/api/analytics/daily').set('Authorization', `Bearer ${token}`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.days.length > 0);
    const today = res.body.days.find((d) => d.date === todayISO());
    assert.strictEqual(today.spending, 100);
  });

  test('GET /api/analytics/categories returns category distribution', async () => {
    const res = await request(app).get('/api/analytics/categories').set('Authorization', `Bearer ${token}`);
    assert.strictEqual(res.status, 200);
    const food = res.body.categories.find((c) => c.name === 'Food & Dining');
    const groceries = res.body.categories.find((c) => c.name === 'Groceries');
    assert.strictEqual(food.total, 30);
    assert.strictEqual(groceries.total, 70);
  });

  test('GET /api/analytics/weekly returns weekly trends', async () => {
    const res = await request(app).get('/api/analytics/weekly').set('Authorization', `Bearer ${token}`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.weeks.length >= 1);
  });

  test('GET /api/analytics/monthly returns monthly summary', async () => {
    const res = await request(app).get('/api/analytics/monthly').set('Authorization', `Bearer ${token}`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.months.length >= 1);
  });

  test('GET /api/analytics/top-spending returns most frequent merchants', async () => {
    const res = await request(app).get('/api/analytics/top-spending').set('Authorization', `Bearer ${token}`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.merchants.length >= 1);
  });

  test('GET /api/analytics/high-spending-days returns days above threshold', async () => {
    const res = await request(app).get('/api/analytics/high-spending-days').set('Authorization', `Bearer ${token}`);
    assert.strictEqual(res.status, 200);
    assert.ok(typeof res.body.threshold === 'number');
    assert.ok(Array.isArray(res.body.highDays));
  });
});

describe('Receipt upload', () => {
  let token;
  before(async () => {
    const { email, password } = await registerUser(app);
    const login = await loginUser(app, email, password);
    token = login.body.token;
  });

  test('POST /api/upload/receipt accepts an image', async () => {
    const res = await request(app)
      .post('/api/upload/receipt')
      .set('Authorization', `Bearer ${token}`)
      .attach('receipt', Buffer.from('fake-image-bytes'), 'receipt.jpg')
      .field('merchant', 'Test Store');
    assert.strictEqual(res.status, 201);
    assert.ok(res.body.url);
    assert.ok(res.body.scan.merchant);
    assert.ok(res.body.scan.amount > 0);
  });
});

describe('Projects & recurring', () => {
  let token;
  before(async () => {
    const { email, password } = await registerUser(app);
    const login = await loginUser(app, email, password);
    token = login.body.token;
  });

  test('POST /api/projects creates project budget', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Wedding', total_budget: 10000, start_date: todayISO() });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.total_budget, 10000);
  });

  test('POST /api/recurring creates recurring transaction', async () => {
    const res = await request(app)
      .post('/api/recurring')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'expense', amount: 15.99, description: 'Netflix', frequency: 'monthly', next_date: todayISO() });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.frequency, 'monthly');
  });

  test('GET /api/recurring returns list', async () => {
    const res = await request(app).get('/api/recurring').set('Authorization', `Bearer ${token}`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.length >= 1);
  });
});
