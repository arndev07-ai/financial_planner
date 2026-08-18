const xss = require('xss');

function sanitizeString(value) {
  if (typeof value !== 'string') return value;
  return xss(value.trim(), {
    whiteList: {},
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style'],
  });
}

const PASS_THROUGH = new Set(['password', 'confirm']);

function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    for (const key of Object.keys(req.body)) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = PASS_THROUGH.has(key) ? req.body[key] : sanitizeString(req.body[key]);
      }
    }
  }
  next();
}

module.exports = { sanitizeBody, sanitizeString };
