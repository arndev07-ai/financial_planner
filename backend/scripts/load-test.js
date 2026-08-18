// Simple load test for the PennyWise API.
// Usage: node scripts/load-test.js [concurrency] [requests]
const BASE = process.env.API_URL || 'http://localhost:5000/api';

const concurrency = Number(process.argv[2]) || 20;
const total = Number(process.argv[3]) || 200;

async function oneUser(id) {
  const email = `load${id}@test.com`;
  const password = 'loadtest123';
  let token = null;
  let res = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Load ${id}`, email, password }),
  });
  if (res.status === 409) {
    res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  }
  const data = await res.json();
  token = data.token;
  if (!token) throw new Error(`No token for user ${id}`);

  const auth = { Authorization: `Bearer ${token}` };
  const out = [];

  // health + core read endpoints
  for (const url of ['/health', '/expenses', '/income', '/budgets', '/projects', '/categories', '/recurring']) {
    const t0 = Date.now();
    const r = await fetch(`${BASE}${url}`, { headers: auth });
    out.push({ url, status: r.status, ms: Date.now() - t0 });
  }

  // write endpoint
  const t0 = Date.now();
  const r = await fetch(`${BASE}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ amount: 12.5, merchant: `Load Shop ${id}`, category: 'Other', date: new Date().toISOString().slice(0, 10) }),
  });
  out.push({ url: 'POST /expenses', status: r.status, ms: Date.now() - t0 });

  return out;
}

async function run() {
  console.log(`Load test: ${concurrency} concurrent × ${total} requests (API: ${BASE})`);
  const start = Date.now();
  const tasks = [];
  for (let i = 0; i < concurrency; i++) tasks.push(oneUser(i));
  const results = (await Promise.all(tasks)).flat();

  const ok = results.filter((r) => r.status >= 200 && r.status < 300).length;
  const errors = results.filter((r) => r.status >= 400);
  const totalMs = Date.now() - start;
  const avg = results.reduce((s, r) => s + r.ms, 0) / results.length;
  const max = Math.max(...results.map((r) => r.ms));

  console.log(`\nResults (${results.length} requests):`);
  console.log(`  OK:        ${ok}`);
  console.log(`  Errors:    ${errors.length}`);
  if (errors.length) console.log(`  Error detail: ${JSON.stringify(errors.slice(0, 3))}`);
  console.log(`  Total time: ${(totalMs / 1000).toFixed(2)}s`);
  console.log(`  Requests/s: ${Math.round((results.length / totalMs) * 1000)}`);
  console.log(`  Avg latency: ${avg.toFixed(0)}ms`);
  console.log(`  Max latency: ${max}ms`);

  if (errors.length > 0) process.exitCode = 1;
}

run().catch((err) => {
  console.error('Load test failed:', err.message);
  process.exitCode = 1;
});
