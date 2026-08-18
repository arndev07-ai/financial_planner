const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { setupTestApp, registerUser, loginUser } = require('./helpers');
const { parseAmount, parseDate, parseMerchant } = require('../src/services/ocr');

let app;
let token;

before(async () => {
  ({ app } = setupTestApp());
  const { res, email, password } = await registerUser(app);
  assert.strictEqual(res.status, 201);
  const login = await loginUser(app, email, password);
  token = login.body.token;
});

function auth() {
  return { Authorization: `Bearer ${token}` };
}

describe('OCR parsers', () => {
  test('parseAmount finds total patterns', () => {
    assert.strictEqual(parseAmount('Starbucks\nTOTAL: $12.45\nTHANK YOU'), 12.45);
    assert.strictEqual(parseAmount('Amount 45,50 EUR'), 45.5);
    assert.strictEqual(parseAmount('balance due 100.00'), 100);
    assert.strictEqual(parseAmount('no numbers here'), null);
  });

  test('parseDate finds common formats', () => {
    assert.strictEqual(parseDate('Date: 07/15/2026'), '2026-07-15');
    assert.strictEqual(parseDate('2026-03-04 invoice'), '2026-03-04');
    assert.strictEqual(parseDate('Jan 5, 2026'), '2026-01-05');
    assert.strictEqual(parseDate('no date'), null);
  });

  test('parseMerchant skips receipt boilerplate', () => {
    const text = 'RECEIPT\nThank you for shopping\nAcme Hardware\nTOTAL: $34.99\n';
    assert.strictEqual(parseMerchant(text, 'Fallback'), 'Acme Hardware');
    assert.strictEqual(parseMerchant('VISIT WWW.X.COM\nTOTAL $5', 'Fallback'), 'Fallback');
  });
});

describe('Receipt upload', () => {
  test('POST /api/upload/receipt falls back for non-image bytes', async () => {
    const res = await request(app)
      .post('/api/upload/receipt')
      .set(auth())
      .attach('receipt', Buffer.from('not-a-real-image'), 'receipt.jpg')
      .field('merchant', 'Fake Store');
    assert.strictEqual(res.status, 201);
    assert.ok(res.body.url);
    assert.strictEqual(res.body.scan.merchant, 'Fake Store');
    assert.ok(res.body.scan.amount > 0);
  });

  test('DELETE /api/upload/:filename removes an uploaded file', async () => {
    const res = await request(app)
      .post('/api/upload/receipt')
      .set(auth())
      .attach('receipt', Buffer.from('not-a-real-image'), 'del.jpg')
      .field('merchant', 'Delete Me');
    assert.strictEqual(res.status, 201);
    const filename = res.body.filename;
    const del = await request(app).delete(`/api/upload/${filename}`).set(auth());
    assert.strictEqual(del.status, 200);
    assert.ok(del.body.message);
  });
});

describe('Projects - expense linking', () => {
  let projectId;
  let expenseId;

  test('POST /api/projects creates a project budget', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set(auth())
      .send({ name: 'Kitchen Remodel', total_budget: 3000, start_date: '2026-01-01' });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.spent, 0);
    projectId = res.body.id;
  });

  test('POST /api/expenses creates an expense', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set(auth())
      .send({ amount: 250, merchant: 'Tile Shop', category: 'Home', date: '2026-02-10' });
    assert.strictEqual(res.status, 201);
    expenseId = res.body.id;
  });

  test('POST /api/projects/:id/expenses links expense and increments spent', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/expenses`)
      .set(auth())
      .send({ expense_id: expenseId });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.project.spent, 250);
  });

  test('POST /api/projects/:id/expenses rejects duplicate linking', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/expenses`)
      .set(auth())
      .send({ expense_id: expenseId });
    assert.strictEqual(res.status, 409);
  });

  test('GET /api/projects/:id/expenses lists linked expenses', async () => {
    const res = await request(app).get(`/api/projects/${projectId}/expenses`).set(auth());
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.length, 1);
    assert.strictEqual(res.body[0].id, expenseId);
  });

  test('DELETE /api/projects/:projectId/expenses/:expenseId unlinks and decrements spent', async () => {
    const res = await request(app)
      .delete(`/api/projects/${projectId}/expenses/${expenseId}`)
      .set(auth());
    assert.strictEqual(res.status, 200);
    const proj = await request(app).get(`/api/projects/${projectId}`).set(auth());
    assert.strictEqual(proj.body.spent, 0);
    assert.strictEqual(proj.body.expenses.length, 0);
  });
});

describe('Recurring transactions', () => {
  function daysFromNow(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  test('POST /api/recurring creates a recurring rule', async () => {
    const res = await request(app)
      .post('/api/recurring')
      .set(auth())
      .send({ type: 'expense', amount: 49.99, description: 'Gym membership', frequency: 'monthly', next_date: daysFromNow(7) });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.description, 'Gym membership');
  });

  test('GET /api/recurring/upcoming returns upcoming items', async () => {
    const res = await request(app).get('/api/recurring/upcoming?days=30').set(auth());
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.items.some((i) => i.description === 'Gym membership'));
  });

  test('POST /api/recurring/process auto-creates due transactions', async () => {
    const res = await request(app)
      .post('/api/recurring')
      .set(auth())
      .send({ type: 'expense', amount: 15, description: 'Software subscription', frequency: 'monthly', next_date: daysFromNow(-1) });
    const ruleId = res.body.id;

    const processRes = await request(app).post('/api/recurring/process').set(auth());
    assert.strictEqual(processRes.status, 200);
    const created = processRes.body.created.find((c) => c.recurringId === ruleId);
    assert.ok(created, 'software subscription should be processed');
    assert.strictEqual(created.description, 'Software subscription');
    assert.ok(created.expenseId);

    const expenses = await request(app).get('/api/expenses').set(auth());
    assert.ok(expenses.body.some((e) => e.merchant === 'Software subscription'));
  });
});

describe('Assets & net worth', () => {
  test('POST /api/assets creates an asset', async () => {
    const res = await request(app)
      .post('/api/assets')
      .set(auth())
      .send({ name: 'Checking', type: 'cash', value: 5000, currency: 'USD' });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.name, 'Checking');
  });

  test('POST /api/assets validates type', async () => {
    const res = await request(app)
      .post('/api/assets')
      .set(auth())
      .send({ name: 'Bad', type: 'boat', value: 100 });
    assert.strictEqual(res.status, 400);
  });

  test('GET /api/assets/networth aggregates by type', async () => {
    await request(app).post('/api/assets').set(auth()).send({ name: 'Portfolio', type: 'investment', value: 10000 });
    const res = await request(app).get('/api/assets/networth').set(auth());
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.total, 15000);
    assert.strictEqual(res.body.byType.cash, 5000);
    assert.strictEqual(res.body.byType.investment, 10000);
    assert.strictEqual(res.body.count, 2);
  });

  test('PUT and DELETE assets', async () => {
    const create = await request(app).post('/api/assets').set(auth()).send({ name: 'Temp', type: 'cash', value: 100 });
    const id = create.body.id;
    const put = await request(app).put(`/api/assets/${id}`).set(auth()).send({ name: 'Temp 2', type: 'cash', value: 200 });
    assert.strictEqual(put.status, 200);
    assert.strictEqual(put.body.value, 200);
    const del = await request(app).delete(`/api/assets/${id}`).set(auth());
    assert.strictEqual(del.status, 200);
    const miss = await request(app).delete(`/api/assets/${id}`).set(auth());
    assert.strictEqual(miss.status, 404);
  });
});

describe('Currency conversion', () => {
  test('GET /api/currency/rates seeds USD rates', async () => {
    const res = await request(app).get('/api/currency/rates').set(auth());
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.base, 'USD');
    assert.ok(res.body.rates.length >= 5);
  });

  test('GET /api/currency/convert converts USD to EUR', async () => {
    const res = await request(app).get('/api/currency/convert?amount=100&from=USD&to=EUR').set(auth());
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.rate > 0);
    assert.strictEqual(res.body.converted, Math.round(100 * res.body.rate * 100) / 100);
  });

  test('GET /api/currency/convert rejects invalid amount', async () => {
    const res = await request(app).get('/api/currency/convert?amount=0&from=USD&to=EUR').set(auth());
    assert.strictEqual(res.status, 400);
  });

  test('POST /api/currency/rates adds a custom rate then converts', async () => {
    const res = await request(app)
      .post('/api/currency/rates')
      .set(auth())
      .send({ base: 'EUR', quote: 'GBP', rate: 0.86 });
    assert.strictEqual(res.status, 200);
    const convert = await request(app).get('/api/currency/convert?amount=100&from=EUR&to=GBP').set(auth());
    assert.strictEqual(convert.body.converted, 86);
  });

  test('GET /api/currency/convert/transactions converts balances', async () => {
    await request(app)
      .post('/api/expenses')
      .set(auth())
      .send({ amount: 50, merchant: 'Euro Cafe', category: 'Food', date: '2026-03-01', currency: 'EUR' });
    const res = await request(app).get('/api/currency/convert/transactions?to=USD').set(auth());
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.totalExpenses > 0);
    assert.ok(res.body.totalIncome >= 0);
  });
});

describe('CSV import', () => {
  test('POST /api/import/transactions imports bank CSV with debit/credit columns', async () => {
    const csv = [
      'Date,Description,Debit,Credit',
      '08/01/2026,Whole Foods,45.50,',
      '08/02/2026,Payroll,,3200.00',
      '08/03/2026,Coffee Shop,5.75,',
    ].join('\n');
    const res = await request(app)
      .post('/api/import/transactions')
      .set(auth())
      .attach('file', Buffer.from(csv), 'statement.csv');
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.count, 3);
    assert.ok(res.body.sample[0].negative);
    assert.ok(!res.body.sample[1].negative);
  });

  test('POST /api/import/transactions handles quoted semicolon files', async () => {
    const csv = ['Date;Description;Amount', '"2026-02-01";"Bakery, Downtown";"12.30"', '"2026-02-02";"Bookshop";"8.75"'].join('\n');
    const res = await request(app)
      .post('/api/import/transactions')
      .set(auth())
      .attach('file', Buffer.from(csv), 'bank.csv');
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.count, 2);
    assert.strictEqual(res.body.sample[0].merchant, 'Bakery, Downtown');
  });

  test('POST /api/import/transactions requires a CSV', async () => {
    const res = await request(app).post('/api/import/transactions').set(auth()).send({});
    assert.strictEqual(res.status, 400);
  });
});

describe('Export', () => {
  before(async () => {
    await request(app)
      .post('/api/expenses')
      .set(auth())
      .send({ amount: 88.88, merchant: 'Export Test', category: 'Other', date: '2026-04-01' });
  });

  test('GET /api/export/expenses.csv returns CSV', async () => {
    const res = await request(app).get('/api/export/expenses.csv').set(auth());
    assert.strictEqual(res.status, 200);
    assert.match(res.headers['content-type'], /text\/csv/);
    assert.ok(res.text.includes('Export Test'));
  });

  test('GET /api/export/expenses.json returns JSON', async () => {
    const res = await request(app).get('/api/export/expenses.json').set(auth());
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.expenses));
    assert.ok(res.body.expenses.some((e) => e.merchant === 'Export Test'));
  });

  test('GET /api/export/expenses.pdf returns a PDF', async () => {
    const res = await request(app).get('/api/export/expenses.pdf').set(auth());
    assert.strictEqual(res.status, 200);
    assert.match(res.headers['content-type'], /application\/pdf/);
    assert.ok(res.body instanceof Buffer);
    assert.ok(res.body.length > 100);
    assert.strictEqual(res.body.subarray(0, 4).toString(), '%PDF');
  });

  test('Export respects from/to date filters', async () => {
    const res = await request(app).get('/api/export/expenses.json?from=2099-01-01&to=2099-12-31').set(auth());
    assert.strictEqual(res.body.count, 0);
    assert.deepStrictEqual(res.body.expenses, []);
  });
});

describe('Settings', () => {
  test('GET /api/settings returns defaults', async () => {
    const res = await request(app).get('/api/settings').set(auth());
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.preferred_currency, 'USD');
    assert.strictEqual(res.body.notify_budget, 1);
  });

  test('PUT /api/settings updates preferences', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set(auth())
      .send({ preferred_currency: 'EUR', notify_budget: false });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.preferred_currency, 'EUR');
    assert.strictEqual(res.body.notify_budget, 0);
  });

  test('PUT /api/settings rejects invalid currency', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set(auth())
      .send({ preferred_currency: 'eu' });
    assert.strictEqual(res.status, 400);
  });
});

describe('Expense currency field', () => {
  test('POST /api/expenses stores currency', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set(auth())
      .send({ amount: 30, merchant: 'Tokyo Ramen', category: 'Food', date: '2026-05-01', currency: 'JPY' });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.currency, 'JPY');
  });
});
