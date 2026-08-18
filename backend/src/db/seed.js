require('dotenv').config();
const bcrypt = require('bcryptjs');
const { getDb } = require('./index');
const { runUp } = require('./migrate');

function randomDate(monthsAgo, maxDaysOffset) {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  d.setDate(d.getDate() - Math.floor(Math.random() * maxDaysOffset));
  return d.toISOString().slice(0, 10);
}

function seedDataIntoUser(db, userId) {
  const cats = db.prepare('SELECT * FROM categories WHERE user_id IS NULL').all();

  const expenseCat = ['Food & Dining', 'Groceries', 'Transport', 'Housing', 'Utilities', 'Entertainment', 'Shopping', 'Health', 'Education', 'Travel'];
  const incomeCat = ['Salary', 'Freelance', 'Investments', 'Gifts'];

  const expenseInsert = db.prepare(
    'INSERT INTO expenses (user_id, amount, merchant, category, date, notes) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const incomeInsert = db.prepare(
    'INSERT INTO income (user_id, amount, source, category, date, is_recurring, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const merchants = {
    'Food & Dining': ['Starbucks', 'Burger Joint', 'Local Sushi', 'Pizza Palace', 'Cafe Nero', 'Thai Garden'],
    Groceries: ['Whole Foods', 'Trader Joes', 'Local Market', 'Costco', 'Safeway'],
    Transport: ['Uber', 'Gas Station', 'Metro Card', 'Lyft'],
    Housing: ['Rent Payment', 'Maintenance Fee'],
    Utilities: ['Electric Bill', 'Internet', 'Water Bill', 'Phone Bill'],
    Entertainment: ['Netflix', 'Cinema', 'Spotify', 'Concert Tickets', 'Steam'],
    Shopping: ['Amazon', 'Nike Store', 'Best Buy', 'IKEA'],
    Health: ['Pharmacy', 'Gym Membership', 'Dentist', 'Doctor Visit'],
    Education: ['Online Course', 'Books', 'Workshop'],
    Travel: ['Flight Tickets', 'Hotel', 'Airbnb'],
  };

  const tx = db.transaction(() => {
    for (let i = 0; i < 180; i++) {
      const cat = expenseCat[Math.floor(Math.random() * expenseCat.length)];
      const merchantList = merchants[cat] || ['Unknown Store'];
      const amount = Math.round((5 + Math.random() * 120) * 100) / 100;
      const date = randomDate(Math.floor(Math.random() * 6), 28);
      expenseInsert.run(userId, amount, merchantList[Math.floor(Math.random() * merchantList.length)], cat, date, 'Seeded demo expense');
    }

    for (let i = 0; i < 14; i++) {
      const cat = incomeCat[Math.floor(Math.random() * incomeCat.length)];
      const amount = Math.round((500 + Math.random() * 3000) * 100) / 100;
      const date = randomDate(Math.floor(Math.random() * 4), 28);
      const isRecurring = cat === 'Salary' ? 1 : 0;
      incomeInsert.run(userId, amount, cat, cat, date, isRecurring, 'Seeded demo income');
    }

    const budgetInsert = db.prepare(
      'INSERT INTO budgets (user_id, category_id, amount, month_year) VALUES (?, ?, ?, ?)'
    );
    const now = new Date();
    const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const budgetMap = {
      'Food & Dining': 500,
      Groceries: 400,
      Transport: 200,
      Housing: 1500,
      Utilities: 300,
      Entertainment: 150,
      Shopping: 250,
      Health: 200,
      Education: 100,
      Travel: 300,
    };
    for (const [name, amount] of Object.entries(budgetMap)) {
      const cat = cats.find((c) => c.name === name);
      if (cat) budgetInsert.run(userId, cat.id, amount, monthYear);
    }

    const projInsert = db.prepare(
      'INSERT INTO project_budgets (user_id, name, total_budget, spent, start_date) VALUES (?, ?, ?, 0, ?)'
    );
    const start = new Date();
    start.setDate(start.getDate() - 15);
    projInsert.run(userId, 'Home Renovation', 5000, start.toISOString().slice(0, 10));
    projInsert.run(userId, 'Vacation Fund', 2000, start.toISOString().slice(0, 10));

    const assetInsert = db.prepare(
      'INSERT INTO assets (user_id, name, type, value, currency, note) VALUES (?, ?, ?, ?, ?, ?)'
    );
    assetInsert.run(userId, 'Checking Account', 'cash', 5400, 'USD', 'Primary checking');
    assetInsert.run(userId, 'Savings Account', 'cash', 12500, 'USD', 'Emergency fund');
    assetInsert.run(userId, 'Index Fund Portfolio', 'investment', 28000, 'USD', 'Vanguard index funds');
    assetInsert.run(userId, 'Bitcoin', 'crypto', 3200, 'USD', 'Long term hold');
    assetInsert.run(userId, 'Apartment Equity', 'property', 95000, 'USD', 'Estimate');

    db.prepare(
      'INSERT INTO settings (user_id, preferred_currency, notify_budget) VALUES (?, ?, 1)'
    ).run(userId, 'USD');

    const recurringInsert = db.prepare(
      'INSERT INTO recurring_transactions (user_id, type, amount, description, frequency, next_date) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    recurringInsert.run(userId, 'expense', 15.99, 'Netflix', 'monthly', nextWeek.toISOString().slice(0, 10));
    recurringInsert.run(userId, 'expense', 1200, 'Rent', 'monthly', new Date().toISOString().slice(0, 10));
    recurringInsert.run(userId, 'income', 4500, 'Salary', 'monthly', new Date().toISOString().slice(0, 10));

    const totalAssets = db.prepare('SELECT SUM(value) s FROM assets WHERE user_id = ?').get(userId).s || 0;
    db.prepare(
      'INSERT INTO net_worth_snapshots (user_id, date, value) VALUES (?, ?, ?) ON CONFLICT(user_id, date) DO NOTHING'
    ).run(userId, new Date().toISOString().slice(0, 10), totalAssets);
  });
  tx();
}

function seedDemoUser() {
  runUp({ close: false });
  const db = getDb();

  const email = process.env.SEED_EMAIL || 'demo@pennywise.app';
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

  let userId;
  if (existing) {
    userId = existing.id;
    const hasData = db.prepare('SELECT COUNT(*) c FROM expenses WHERE user_id = ?').get(userId).c > 0;
    if (hasData) {
      console.log(`Demo user ${email} already has data (id=${userId}). Skipping.`);
      db.close();
      return;
    }
    console.log(`Demo user ${email} exists (id=${userId}). Seeding data...`);
    seedDataIntoUser(db, userId);
    db.close();
    return;
  }

  const passwordHash = bcrypt.hashSync('demo12345', 10);
  const info = db.prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)').run(email, passwordHash, 'Demo User');
  userId = info.lastInsertRowid;
  seedDataIntoUser(db, userId);

  console.log(`Demo user created: ${email} / demo12345 (id=${userId})`);
  console.log('Seeded 180 expenses, 14 incomes, budgets and project budgets.');
  db.close();
}

if (require.main === module) {
  seedDemoUser();
}

module.exports = { seedDemoUser };
