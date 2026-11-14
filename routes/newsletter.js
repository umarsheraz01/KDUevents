// =============================================================================
// routes/newsletter.js — NEWSLETTER SIGN-UP + WELCOME EMAIL
// -----------------------------------------------------------------------------
// POST /api/subscribe   { email }
//   1. checks the email address
//   2. saves it in MongoDB (refuses duplicates)
//   3. sends the welcome email through Gmail (Nodemailer)
// Used by the newsletter box on the homepage and the featured event page.
// The email's design lives in lib/emails/welcome-email.js.
// =============================================================================
const express = require('express');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const router = express.Router();

const { EMAIL_USER, EMAIL_PASS } = require('../lib/config');
const Subscriber = require('../models/subscriber');
const welcomeEmail = require('../lib/emails/welcome-email');

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
    if (existing) {
      return res.status(400).json({ message: 'Email is already subscribed!' });
    }
    const newSubscriber = new Subscriber({ email });
    await newSubscriber.save();

    // 3. Send the welcome email through Gmail
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: EMAIL_USER, pass: EMAIL_PASS }
    });
    const info = await transporter.sendMail({
      from: `"KDU Events" <${EMAIL_USER}>`,
      to: email,
      subject: welcomeEmail.subject,
      text: welcomeEmail.text,
      html: welcomeEmail.html
    });
    console.log('Email sent successfully:', info.response);

    res.status(200).json({ message: 'Subscribed successfully and email sent!' });
  } catch (err) {
    console.error('Subscription error:', err);
    res.status(500).json({ message: 'Server error during subscription.' });
  }
});

module.exports = router;
