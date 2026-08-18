const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { backendRoot } = require('../db');

const router = express.Router();
router.use(authenticate);

const TMP_DIR = path.join(backendRoot(), 'tmp');
fs.mkdirSync(TMP_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TMP_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}-import-${file.originalname.replace(/[^\w.-]/g, '_')}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /(text\/csv|application\/csv|text\/plain|application\/vnd.ms-excel|csv)/.test(file.mimetype) || file.originalname.endsWith('.csv')),
});

function parseCsv(text) {
  const delimiter = text.includes(';') ? ';' : ',';
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const parseLine = (line) => {
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') {
          inQ = false;
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQ = true;
      } else if (ch === delimiter) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  };

  return lines.map(parseLine);
}

function toDate(raw) {
  const s = String(raw).trim();
  let d;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) d = new Date(s);
  else if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s)) {
    const [m, day, y] = s.split('/').map(Number);
    d = new Date(y > 99 ? y : 2000 + y, m - 1, day);
  } else if (/^\d{1,2}-\d{1,2}-\d{2,4}/.test(s)) {
    const [m, day, y] = s.split('-').map(Number);
    d = new Date(y > 99 ? y : 2000 + y, m - 1, day);
  } else {
    d = new Date(s);
  }
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseNumber(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).replace(/[$€£¥,\s]/g, '');
  if (!s) return null;
  const n = Number(s.replace(/\((.*)\)/, '-$1'));
  return isNaN(n) ? null : n;
}

function inferColumns(header) {
  const lower = header.map((h) => String(h).toLowerCase());
  const find = (patterns) => lower.findIndex((h) => patterns.some((p) => h.includes(p)));
  const dateIdx = find(['date']);
  const descIdx = find(['description', 'merchant', 'payee', 'details', 'name', 'memo', 'narration']);
  const debitIdx = find(['debit', 'withdraw', 'money out', 'outflow', 'spend']);
  const creditIdx = find(['credit', 'deposit', 'money in', 'inflow', 'income']);
  const amountIdx = find(['amount']);
  return { dateIdx, descIdx, debitIdx, creditIdx, amountIdx };
}

function parseRows(csv) {
  if (csv.length === 0) return [];
  const header = csv[0].map((h) => String(h).trim());
  const hasHeader = header.some((h) => /date|amount|description|merchant|debit|credit/i.test(h));
  const startIdx = hasHeader ? 1 : 0;
  const cols = inferColumns(hasHeader ? header : []);

  const rows = [];
  for (let i = startIdx; i < csv.length; i++) {
    const line = csv[i];
    const get = (idx) => (idx >= 0 && idx < line.length ? line[idx] : undefined);

    const date = toDate(get(cols.dateIdx));
    const desc = get(cols.descIdx !== undefined ? cols.descIdx : 1) || '';
    let amount = null;
    if (cols.debitIdx >= 0 && cols.creditIdx >= 0) {
      const debit = parseNumber(get(cols.debitIdx));
      const credit = parseNumber(get(cols.creditIdx));
      amount = credit ? credit : debit !== null ? -debit : null;
    } else if (cols.amountIdx >= 0) {
      amount = parseNumber(get(cols.amountIdx));
    } else {
      for (let j = 0; j < line.length; j++) {
        const n = parseNumber(line[j]);
        if (n !== null && Math.abs(n) > 0 && !/^\d{4}/.test(String(line[j]).trim())) {
          amount = n;
          break;
        }
      }
    }

    if (!date || amount === null || amount === 0) continue;
    rows.push({ date, merchant: String(desc).slice(0, 120) || 'Unknown', amount: Math.abs(amount), negative: amount < 0 });
  }
  return rows;
}

router.post('/transactions', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No CSV file provided' });

  try {
    const text = fs.readFileSync(req.file.path, 'utf-8');
    const csv = parseCsv(text);
    const parsed = parseRows(csv);

    const db = req.app.locals.db;
    const insert = db.prepare(
      `INSERT INTO expenses (user_id, amount, merchant, category, date, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    const tx = db.transaction((list) => {
      for (const r of list) {
        insert.run(req.user.id, r.amount, r.merchant, 'Other', r.date, 'Imported from bank CSV');
      }
    });
    tx(parsed);

    res.status(201).json({
      message: `Imported ${parsed.length} transaction(s)`,
      count: parsed.length,
      skipped: parsed.length === 0 ? 1 : 0,
      sample: parsed.slice(0, 3),
    });
  } catch (err) {
    return res.status(400).json({ error: 'Could not parse the CSV file: ' + err.message });
  } finally {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  }
});

module.exports = router;
