const jwt = require('jsonwebtoken');

function getSecret() {
  return process.env.JWT_SECRET || 'dev-secret-change-me';
}

function signToken(payload) {
  return jwt.sign(payload, getSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

const COOKIE_NAME = 'pennywise_token';

module.exports = { signToken, verifyToken, getSecret, COOKIE_NAME };
