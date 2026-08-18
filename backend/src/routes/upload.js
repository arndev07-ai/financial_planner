const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { backendRoot } = require('../db');
const { ocrReceipt } = require('../services/ocr');

const router = express.Router();
router.use(authenticate);

const UPLOAD_DIR = path.join(backendRoot(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf'].includes(ext) ? ext : '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /image\/(jpeg|png|gif|webp)|application\/pdf/.test(file.mimetype);
    cb(ok ? null : new Error('Only image and PDF files are allowed'), ok);
  },
});

function safeResolve(filename) {
  const full = path.resolve(UPLOAD_DIR, path.basename(filename));
  if (!full.startsWith(UPLOAD_DIR)) return null;
  return full;
}

router.post('/receipt', upload.single('receipt'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No receipt file provided' });

  const fullPath = path.join(UPLOAD_DIR, req.file.filename);
  const url = `/uploads/${req.file.filename}`;

  try {
    const extracted = await ocrReceipt(fullPath, { ...req.body, originalname: req.file.originalname });
    const scan = {
      merchant: extracted.merchant || req.body.merchant || null,
      amount: extracted.amount || null,
      date: extracted.date || req.body.date || null,
      confidence: extracted.confidence,
      source: extracted.source,
      note: extracted.source === 'ocr'
        ? 'Receipt scanned with OCR. Please verify the extracted details.'
        : 'Receipt uploaded. Fill in the details to continue.',
    };
    res.status(201).json({
      message: 'Receipt uploaded and scanned',
      filename: req.file.filename,
      url,
      scan,
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:filename', (req, res) => {
  const full = safeResolve(req.params.filename);
  if (!full) return res.status(400).json({ error: 'Invalid filename' });
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'File not found' });
  fs.unlinkSync(full);
  res.json({ message: 'Receipt deleted', filename: req.params.filename });
});

module.exports = router;
