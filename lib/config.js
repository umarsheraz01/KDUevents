// =============================================================================
// lib/config.js — SETTINGS READ FROM THE .env FILE
// -----------------------------------------------------------------------------
// Every secret or setting the server needs lives here, in one place.
// Locally they come from the .env file; on Render they come from the
// "Environment" settings page. Nothing secret is written in the code.
// =============================================================================
require('dotenv').config();
const crypto = require('crypto');

// MongoDB Atlas connection string (contains the database password)
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/kdu_events';

// The ONE admin account allowed into the Admin Portal
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// Gmail account used to send the newsletter welcome email
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

// Secret used to sign login sessions, and how long a login lasts
let SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  SESSION_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('SESSION_SECRET is not set - using a temporary one (everyone is signed out when the server restarts).');
}
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.warn('ADMIN_EMAIL / ADMIN_PASSWORD are not set - the Admin Portal is disabled.');
}

// Port: Render chooses it automatically; locally it comes from .env (5050)
const PORT = process.env.PORT || 3000;

module.exports = {
  MONGO_URI, ADMIN_EMAIL, ADMIN_PASSWORD, EMAIL_USER, EMAIL_PASS,
  SESSION_SECRET, SESSION_TTL_MS, PORT
};
