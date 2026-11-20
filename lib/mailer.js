// =============================================================================
// lib/mailer.js — SENDS EMAILS (Brevo API, or Gmail as a fallback)
// -----------------------------------------------------------------------------
// sendMail({ to, subject, text, html, replyTo })
//
// With BREVO_API_KEY set, emails go through Brevo's web API (HTTPS). This is
// what works on Render: its free plan blocks the ports email servers use, so
// Gmail (SMTP) hangs there.
// Without it, emails go through the Gmail account in EMAIL_USER / EMAIL_PASS
// (handy for local development).
//
// MAIL_FROM is the sender address (default: EMAIL_USER). With Brevo it must be
// a sender or domain verified in the Brevo dashboard.
// =============================================================================
const nodemailer = require('nodemailer');
const { EMAIL_USER, EMAIL_PASS, BREVO_API_KEY, MAIL_FROM } = require('./config');

const FROM_NAME = 'KDU Events';
const TIMEOUT_MS = 15000;
let transporter = null;

function mailerReady() {
  return Boolean((BREVO_API_KEY || (EMAIL_USER && EMAIL_PASS)) && MAIL_FROM);
}

// '"Jane Doe" <jane@x.com>' or 'jane@x.com' -> { name, email }
function parseAddress(addr) {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(addr || '');
  return m ? { email: m[2].trim(), ...(m[1].trim() && { name: m[1].trim() }) } : { email: String(addr).trim() };
}

async function sendWithBrevo({ to, subject, text, html, replyTo }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: MAIL_FROM },
      to: [parseAddress(to)],
      subject,
      htmlContent: html,
      textContent: text,
      ...(replyTo && { replyTo: parseAddress(replyTo) })
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${data.message || data.code || 'send failed'}`);
  return { response: `Brevo messageId ${data.messageId}` };
}

function sendWithGmail({ to, subject, text, html, replyTo }) {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: EMAIL_USER, pass: EMAIL_PASS },
      // Fail fast instead of hanging for minutes when the mail server can't be reached
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000
    });
  }
  return transporter.sendMail({ from: `"${FROM_NAME}" <${MAIL_FROM}>`, to, subject, text, html, replyTo });
}

function sendMail(mail) {
  if (!mailerReady()) return Promise.reject(new Error('Email is not set up (BREVO_API_KEY, or EMAIL_USER / EMAIL_PASS)'));
  return BREVO_API_KEY ? sendWithBrevo(mail) : sendWithGmail(mail);
}

module.exports = { sendMail, mailerReady };
