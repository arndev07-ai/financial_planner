const express = require('express');
const PDFDocument = require('pdfkit');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function buildQuery(req) {
  const { from, to, category, merchant } = req.query;
  const params = [req.user.id];
  let where = 'WHERE user_id = ?';
  if (from) {
    where += ' AND date >= ?';
    params.push(from);
  }
  if (to) {
    where += ' AND date <= ?';
    params.push(to);
  }
  if (category) {
    where += ' AND category = ?';
    params.push(category);
  }
  if (merchant) {
    where += ' AND lower(merchant) LIKE ?';
    params.push(`%${merchant.toLowerCase()}%`);
  }
  return { where, params };
}

function getRows(db, req) {
  const { where, params } = buildQuery(req);
  return db.prepare(`SELECT * FROM expenses ${where} ORDER BY date DESC`).all(...params);
}

function toCsv(rows) {
  const header = ['id', 'date', 'merchant', 'category', 'amount', 'currency', 'receipt_path', 'notes'];
  const escape = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.map(escape).join(',')];
  for (const r of rows) {
    lines.push(header.map((h) => escape(r[h])).join(','));
  }
  return lines.join('\n');
}

router.get('/expenses.csv', (req, res) => {
  const db = req.app.locals.db;
  const rows = getRows(db, req);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="pennywise-expenses-${Date.now()}.csv"`);
  res.send(toCsv(rows));
});

router.get('/expenses.json', (req, res) => {
  const db = req.app.locals.db;
  const rows = getRows(db, req);
  res.setHeader('Content-Disposition', `attachment; filename="pennywise-expenses-${Date.now()}.json"`);
  res.json({ exportedAt: new Date().toISOString(), count: rows.length, expenses: rows });
});

router.get('/expenses.pdf', (req, res) => {
  const db = req.app.locals.db;
  const rows = getRows(db, req);
  const total = rows.reduce((s, r) => s + r.amount, 0);

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="pennywise-report-${Date.now()}.pdf"`);
  doc.pipe(res);

  doc.fontSize(20).fillColor('#0f172a').text('PennyWise - Expense Report', { align: 'center' });
  doc.moveDown(0.4);
  doc.fontSize(11).fillColor('#64748b').text(`Generated ${new Date().toLocaleString()}`, { align: 'center' });
  doc.moveDown(0.6);

  const summary = {
    'Total expenses': total.toFixed(2),
    'Transactions': rows.length,
    ...(req.query.from ? { From: req.query.from } : {}),
    ...(req.query.to ? { To: req.query.to } : {}),
  };
  doc.fontSize(13).fillColor('#0f172a').text('Summary');
  doc.moveDown(0.3);
  for (const [k, v] of Object.entries(summary)) {
    doc.fontSize(11).fillColor('#475569').text(`${k}: ${v}`);
  }
  doc.moveDown(0.8);

  if (rows.length > 0) {
    doc.fontSize(13).fillColor('#0f172a').text('Transactions');
    doc.moveDown(0.3);
    const tableTop = doc.y;
    doc.fontSize(9);
    doc.fillColor('#0f172a').text('Date', 40, tableTop);
    doc.text('Merchant', 120, tableTop);
    doc.text('Category', 290, tableTop);
    doc.text('Amount', 440, tableTop);
    doc.moveDown(0.4);
    let y = doc.y;
    doc.fontSize(9).fillColor('#334155');
    for (const r of rows.slice(0, 400)) {
      doc.text(r.date, 40, y);
      doc.text((r.merchant || '').slice(0, 24), 120, y);
      doc.text((r.category || '').slice(0, 18), 290, y);
      doc.text(r.amount.toFixed(2), 440, y);
      y += 14;
      if (y > 760) {
        doc.addPage();
        y = 60;
      }
    }
  }

  doc.end();
});

module.exports = router;
