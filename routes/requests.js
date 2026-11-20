// =============================================================================
// routes/requests.js — "HOST AN EVENT" AND "BOOK A VENUE" FORMS
// -----------------------------------------------------------------------------
// POST /api/requests/host-event      (form on host-event.html)
// POST /api/requests/venue-booking   (form on venue.html)
//   1. checks the required fields
//   2. saves the request in MongoDB (if the database is online)
//   3. emails every detail to the admin (REQUESTS_EMAIL, default
//      admin@kduevents.co.kr) with "Reply-To" set to the sender, so the
//      admin can answer them just by pressing Reply.
// Each connection may send at most 5 requests per hour (spam protection).
// =============================================================================
const express = require('express');
const router = express.Router();

const { REQUESTS_EMAIL } = require('../lib/config');
const { dbOnline } = require('../lib/db');
const { EMAIL_RE, PHONE_RE, cleanText } = require('../lib/helpers');
const { sendMail, mailerReady } = require('../lib/mailer');
const requestEmail = require('../lib/emails/request-email');
const Request = require('../models/request');

// ---- Spam protection: 5 requests per connection per hour ---------------------
const recent = new Map(); // ip -> [timestamps]
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;
function tooMany(ip) {
  const now = Date.now();
  const list = (recent.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_WINDOW) { recent.set(ip, list); return true; }
  list.push(now);
  recent.set(ip, list);
  return false;
}

// ---- Shared contact checks ---------------------------------------------------
function readContact(body) {
  return {
    name: cleanText(body.name, 120),
    email: cleanText(body.email, 160).toLowerCase(),
    phone: cleanText(body.phone, 25),
    studentId: cleanText(body.studentId, 50)
  };
}
function contactError(c, { needStudentId }) {
  if (!c.name) return 'Please enter your name.';
  if (!EMAIL_RE.test(c.email)) return 'Please enter a valid email address.';
  if (!PHONE_RE.test(c.phone)) return 'Please enter a valid phone number.';
  if (needStudentId && !c.studentId) return 'Please enter your student ID.';
  return null;
}

// Save the request, then email the admin.
// If the request is saved in the database, the visitor gets an answer straight
// away and the email is sent in the background (email can be slow, and must
// never keep the visitor waiting). If it could not be saved, the email is the
// only copy, so we wait for it (with a time limit) before answering.
const EMAIL_TIMEOUT_MS = 20 * 1000;

function sendWithTimeout(mail) {
  return Promise.race([
    sendMail(mail),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Email timed out')), EMAIL_TIMEOUT_MS))
  ]);
}

async function saveAndEmail(type, contact, details, title, rows) {
  let doc = null;
  if (dbOnline()) {
    doc = await Request.create({ type, ...contact, details }).catch(err => {
      console.error('Request save error:', err.message);
      return null;
    });
  }
  const mail = { to: REQUESTS_EMAIL, replyTo: `"${contact.name.replace(/"/g, '')}" <${contact.email}>`, ...requestEmail(title, rows, contact.email) };

  if (!doc) {
    await sendWithTimeout(mail); // no saved copy: the email must succeed
    return;
  }
  sendWithTimeout(mail)
    .then(() => Request.updateOne({ _id: doc._id }, { emailed: true }))
    .catch(err => console.error(`Request email error (saved as ${doc._id}):`, err.message));
}

function guard(req, res) {
  if (!mailerReady() && !dbOnline()) {
    res.status(503).json({ message: 'Requests are temporarily unavailable. Please email admin@kduevents.co.kr directly.' });
    return false;
  }
  // Render sits behind a proxy, so use the visitor's address from X-Forwarded-For
  const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  if (tooMany(ip)) {
    res.status(429).json({ message: 'Too many requests. Please try again in an hour.' });
    return false;
  }
  return true;
}

// ---- Host an event -------------------------------------------------------------
router.post('/host-event', async (req, res) => {
  try {
    const b = req.body || {};
    const contact = readContact(b);
    const d = {
      title: cleanText(b.title, 150),
      category: cleanText(b.category, 60),
      audience: cleanText(b.audience, 60),
      description: cleanText(b.description, 3000),
      date: cleanText(b.date, 20),
      time: cleanText(b.time, 10),
      venue: cleanText(b.venue, 100),
      attendees: cleanText(b.attendees, 10),
      logistics: (Array.isArray(b.logistics) ? b.logistics : []).map(v => cleanText(v, 60)).filter(Boolean).slice(0, 10)
    };
    const err = contactError(contact, { needStudentId: false })
      || (!d.title && 'Please enter the event title.')
      || (!d.category && 'Please choose a category.')
      || (!d.description && 'Please describe the event.')
      || (!d.date && 'Please choose the event date.')
      || (!d.time && 'Please choose the start time.')
      || (!d.venue && 'Please choose a venue.');
    if (err) return res.status(400).json({ message: err });
    if (!guard(req, res)) return;

    await saveAndEmail('host-event', contact, d, `New event proposal: ${d.title}`, [
      ['Organizer', contact.name], ['Email', contact.email], ['Phone', contact.phone], ['Student ID', contact.studentId],
      ['Event title', d.title], ['Category', d.category], ['Target audience', d.audience],
      ['Date', d.date], ['Start time', d.time], ['Venue', d.venue], ['Expected attendees', d.attendees],
      ['Equipment & logistics', d.logistics.join(', ') || 'None'], ['Description', d.description]
    ]);
    res.json({ message: 'Thank you! Your event proposal was sent. The KDU Events team will reply to your email soon.' });
  } catch (e) {
    console.error('Host event request error:', e);
    res.status(500).json({ message: 'Could not send your request. Please try again or email admin@kduevents.co.kr.' });
  }
});

// ---- Book a venue --------------------------------------------------------------
router.post('/venue-booking', async (req, res) => {
  try {
    const b = req.body || {};
    const contact = readContact(b);
    const d = {
      venue: cleanText(b.venue, 100),
      date: cleanText(b.date, 20),
      time: cleanText(b.time, 10),
      description: cleanText(b.description, 3000)
    };
    const err = contactError(contact, { needStudentId: true })
      || (!d.venue && 'Please choose a venue.')
      || (!d.date && 'Please choose the reservation date.')
      || (!d.time && 'Please choose a time slot.')
      || (!d.description && 'Please describe the event.');
    if (err) return res.status(400).json({ message: err });
    if (!guard(req, res)) return;

    await saveAndEmail('venue-booking', contact, d, `New venue booking: ${d.venue} on ${d.date}`, [
      ['Name / organization', contact.name], ['Email', contact.email], ['Phone', contact.phone], ['Student ID', contact.studentId],
      ['Venue', d.venue], ['Date', d.date], ['Time', d.time], ['Description & purpose', d.description]
    ]);
    res.json({ message: 'Thank you! Your venue request was sent. The KDU Events team will reply to your email soon.' });
  } catch (e) {
    console.error('Venue booking request error:', e);
    res.status(500).json({ message: 'Could not send your request. Please try again or email admin@kduevents.co.kr.' });
  }
});

module.exports = router;
