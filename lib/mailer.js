// =============================================================================
// lib/mailer.js — SENDS EMAILS THROUGH GMAIL (Nodemailer)
// -----------------------------------------------------------------------------
// sendMail({ to, subject, text, html, replyTo })
// Uses the Gmail account in EMAIL_USER / EMAIL_PASS (see lib/config.js).
// =============================================================================
const nodemailer = require('nodemailer');
const { EMAIL_USER, EMAIL_PASS } = require('./config');

let transporter = null;

function mailerReady() {
  return Boolean(EMAIL_USER && EMAIL_PASS);
}

function sendMail({ to, subject, text, html, replyTo }) {
  if (!mailerReady()) return Promise.reject(new Error('EMAIL_USER / EMAIL_PASS are not set'));
  if (!transporter) {
    transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: EMAIL_USER, pass: EMAIL_PASS } });
  }
  return transporter.sendMail({ from: `"KDU Events" <${EMAIL_USER}>`, to, subject, text, html, replyTo });
}

module.exports = { sendMail, mailerReady };
