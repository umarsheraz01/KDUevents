// =============================================================================
// routes/newsletter.js — NEWSLETTER SIGN-UP + WELCOME EMAIL
// -----------------------------------------------------------------------------
// POST /api/subscribe   { email }
//   1. checks the email address
//   2. saves it in MongoDB and answers the visitor straight away
//   3. sends the welcome email in the background (Gmail can be slow or hang,
//      and must never keep the visitor waiting)
// If an address is already saved but its welcome email never went out
// (welcomeSent: false), signing up again re-sends it instead of refusing.
// Used by the newsletter box on the homepage and the featured event page.
// The email's design lives in lib/emails/welcome-email.js.
// =============================================================================
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const Subscriber = require('../models/subscriber');
const welcomeEmail = require('../lib/emails/welcome-email');
const { sendMail } = require('../lib/mailer');

const EMAIL_TIMEOUT_MS = 20 * 1000;

function sendWelcome(email) {
  return Promise.race([
    sendMail({ to: email, subject: welcomeEmail.subject, text: welcomeEmail.text, html: welcomeEmail.html }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Email timed out')), EMAIL_TIMEOUT_MS))
  ])
    .then(info => {
      console.log('Welcome email sent to', email, info && info.response);
      return Subscriber.updateOne({ email }, { welcomeSent: true });
    })
    .catch(err => console.error(`Welcome email error for ${email}:`, err.message));
}

router.post('/subscribe', async (req, res) => {
  try {
    // 1. Check the email address
    const email = (req.body.email || '').toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ message: 'Subscriptions are temporarily unavailable. Please try again later.' });
    }

    // 2. Save it (once)
    const existing = await Subscriber.findOne({ email });
    if (existing && existing.welcomeSent !== false) {
      return res.status(400).json({ message: 'This email is already subscribed!' });
    }
    if (!existing) {
      try {
        await Subscriber.create({ email, welcomeSent: false });
      } catch (err) {
        if (err.code !== 11000) throw err; // 11000 = saved by a double click a moment ago
      }
    }

    // 3. Answer now, send the welcome email in the background
    res.status(200).json({ message: 'Subscribed! Check your inbox for a welcome email.' });
    sendWelcome(email);
  } catch (err) {
    console.error('Subscription error:', err);
    res.status(500).json({ message: 'Server error during subscription.' });
  }
});

module.exports = router;
