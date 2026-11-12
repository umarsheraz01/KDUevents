const express = require('express');
const router = express.Router();
const Subscriber = require('../models/subscriber');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');

router.post('/subscribe', async (req, res) => {
  try {
    const email = (req.body.email || '').toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ message: 'Subscriptions are temporarily unavailable. Please try again later.' });
    }

    // Check if already subscribed
    const existing = await Subscriber.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'Email is already subscribed!' });
    }

    // Save to MongoDB
    const newSubscriber = new Subscriber({ email });
    await newSubscriber.save();

    // Setup Nodemailer transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    // Branded HTML Email Template
    const htmlTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to KDU Events</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #0b192c; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #ffffff;">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0b192c; padding: 40px 10px;">
          <tr>
            <td align="center">
              <!-- Card Container -->
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #1e293b; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);">
                
                <!-- Header / Logo -->
                <tr>
                  <td style="padding: 36px 32px 20px 32px; text-align: left; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
                    <h1 style="margin: 0; font-size: 24px; font-weight: 800; tracking-spacing: 0.5px; color: #ffffff;">
                      KDU <span style="color: #ff3b30;">EVENTS</span>
                    </h1>
                  </td>
                </tr>

                <!-- Main Content -->
                <tr>
                  <td style="padding: 32px;">
                    <h2 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #ffffff; line-height: 1.3;">
                      You're officially on the list! 🎉
                    </h2>
                    <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                      Thank you for joining the KDU Events newsletter. You'll now be the first to know about upcoming campus life events, workshops, socials, and tech showcases.
                    </p>
                    
                    <!-- Highlight Feature Box -->
                    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 10px; margin-bottom: 28px;">
                      <tr>
                        <td style="padding: 18px 20px;">
                          <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 600; text-transform: uppercase; color: #ff3b30; letter-spacing: 1px;">
                            STAY IN THE LOOP
                          </p>
                          <p style="margin: 0; font-size: 14px; color: #94a3b8; line-height: 1.4;">
                            Never miss out on student registration deadlines or guest speaker announcements.
                          </p>
                        </td>
                      </tr>
                    </table>

                    <!-- Call To Action Button -->
                    <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto 10px 0;">
                      <tr>
                        <td align="center" style="border-radius: 8px; background-color: #ff3b30;">
                          <a href="http://kduevents.co.kr" target="_blank" style="font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; border: 1px solid #ff3b30; display: inline-block;">
                            Explore Upcoming Events &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding: 24px 32px; background-color: rgba(0, 0, 0, 0.2); border-top: 1px solid rgba(255, 255, 255, 0.08); text-align: center;">
                    <p style="margin: 0 0 8px 0; font-size: 12px; color: #64748b;">
                      International Office, Main Campus — Kyungdong University
                    </p>
                    <p style="margin: 0; font-size: 12px; color: #475569;">
                      &copy; 2026 KDU Events. All rights reserved.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    // Send Welcome Email
    const info = await transporter.sendMail({
      from: `"KDU Events" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Welcome to KDU Events! 🎉',
      text: 'Thank you for subscribing to KDU Events. Never miss what is happening next!',
      html: htmlTemplate
    });

    console.log('Email sent successfully:', info.response);

    res.status(200).json({ message: 'Subscribed successfully and email sent!' });
  } catch (err) {
    console.error('Subscription error:', err);
    res.status(500).json({ message: 'Server error during subscription.' });
  }
});

module.exports = router;