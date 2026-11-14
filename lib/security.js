// =============================================================================
// lib/security.js — PASSWORDS, LOGIN TOKENS AND LOGIN LIMITS
// -----------------------------------------------------------------------------
// hashPassword / verifyPassword   store passwords safely (scrypt + random salt)
// safeEqual                       compare the admin password without timing leaks
// signToken / readToken           create and check login sessions (HMAC-signed, 7 days)
// isLockedOut / recordFail /
// clearFails                      brute-force protection: 10 wrong passwords
//                                 from one connection = locked for 15 minutes
// =============================================================================
const crypto = require('crypto');
const { SESSION_SECRET, SESSION_TTL_MS } = require('./config');

// ---- Passwords --------------------------------------------------------------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
}

// Constant-time string comparison (used for the admin password)
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// ---- Login sessions ---------------------------------------------------------
// A token looks like: base64url(payload).signature
// The browser stores it and sends it back as "Authorization: Bearer <token>".
function signToken(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + SESSION_TTL_MS })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

// Returns the payload if the token is genuine and not expired, otherwise null
function readToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    return payload.exp > Date.now() ? payload : null;
  } catch (e) { return null; }
}

// ---- Brute-force protection ---------------------------------------------------
const failedLogins = new Map();          // ip -> { count, first }
const LOCK_WINDOW_MS = 15 * 60 * 1000;   // 15 minutes
const MAX_FAILS = 10;

function isLockedOut(ip) {
  const entry = failedLogins.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.first > LOCK_WINDOW_MS) { failedLogins.delete(ip); return false; }
  return entry.count >= MAX_FAILS;
}

function recordFail(ip) {
  const entry = failedLogins.get(ip);
  if (!entry || Date.now() - entry.first > LOCK_WINDOW_MS) failedLogins.set(ip, { count: 1, first: Date.now() });
  else entry.count++;
}

function clearFails(ip) {
  failedLogins.delete(ip);
}

module.exports = {
  hashPassword, verifyPassword, safeEqual,
  signToken, readToken,
  isLockedOut, recordFail, clearFails
};
