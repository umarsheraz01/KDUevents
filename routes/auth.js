// =============================================================================
// routes/auth.js — SIGN UP, SIGN IN AND "WHO AM I?"
// -----------------------------------------------------------------------------
// POST /api/auth/register   create a student account (portal "Create an account")
// POST /api/auth/login      sign in as a student or as the admin
// GET  /api/auth/me         restore the session after a page refresh
// POST /api/auth/logout     sign out: the token stops working on the server
// POST /api/auth/forgot-password   email a student a one-time "reset password" link
// POST /api/auth/reset-password    set a new password using that link
// =============================================================================
const crypto = require('crypto');
const express = require('express');
const router = express.Router();

const { ADMIN_EMAIL, ADMIN_PASSWORD, SITE_URL } = require('../lib/config');
const { sendMail } = require('../lib/mailer');
const resetEmail = require('../lib/emails/reset-email');
const { dbOnline } = require('../lib/db');
const { hashPassword, verifyPassword, safeEqual, signToken, isLockedOut, recordFail, clearFails } = require('../lib/security');
const { requireAuth, adminUser, publicUser, revokeToken } = require('../lib/auth');
const { EMAIL_RE, cleanText, logActivity } = require('../lib/helpers');
const User = require('../models/user');

// ---- Create a student account ------------------------------------------------
router.post('/register', async (req, res) => {
  try {
    const name = cleanText(req.body.name, 100);
    const email = cleanText(req.body.email, 200).toLowerCase();
    const password = String(req.body.password || '');
    const studentId = cleanText(req.body.studentId, 50);
    const dept = cleanText(req.body.dept, 100);

    if (!name) return res.status(400).json({ message: 'Please enter your full name.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Please enter a valid email address.' });
    if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    if (email === ADMIN_EMAIL) return res.status(400).json({ message: 'This email cannot be used for a student account.' });
    if (!dbOnline()) return res.status(503).json({ message: 'Registration is temporarily unavailable. Please try again shortly.' });

    if (await User.exists({ email })) {
      return res.status(409).json({ message: 'An account with this email already exists. Please sign in.' });
    }

    const user = await User.create({ name, email, password: hashPassword(password), role: 'student', studentId, dept, lastLoginAt: new Date() });
    logActivity('signup', user, `${user.name} created a student account`);
    res.status(201).json({
      message: 'Account created',
      user: publicUser(user),
      token: signToken({ uid: String(user._id), role: 'student' }),
      state: { registered: [], saved: [] }
    });
  } catch (err) {
    if (err && err.code === 11000) return res.status(409).json({ message: 'An account with this email already exists. Please sign in.' });
    console.error('Register error:', err.message);
    res.status(500).json({ message: 'Registration failed. Please try again.' });
  }
});

// ---- Sign in (student or admin) ----------------------------------------------
router.post('/login', async (req, res) => {
  const ip = req.ip;
  try {
    if (isLockedOut(ip)) {
      return res.status(429).json({ message: 'Too many failed attempts. Please wait 15 minutes and try again.' });
    }

    const email = String(req.body.email || '').toLowerCase().trim();
    const password = String(req.body.password || '');
    const role = req.body.role === 'admin' ? 'admin' : 'student';
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });

    // ADMIN PORTAL: only the single admin account from .env may enter
    if (role === 'admin') {
      const ok = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD) && email === ADMIN_EMAIL && safeEqual(password, ADMIN_PASSWORD);
      if (!ok) {
        recordFail(ip);
        return res.status(401).json({ message: 'Invalid admin email or password.' });
      }
      clearFails(ip);
      logActivity('admin_login', adminUser(), 'Admin signed in');
      return res.json({ message: 'Login successful', user: adminUser(), token: signToken({ email: ADMIN_EMAIL, role: 'admin' }), state: null });
    }

    // STUDENT PORTAL
    if (email === ADMIN_EMAIL) {
      return res.status(403).json({ message: 'This is the admin account. Please use the Admin Portal tab.' });
    }
    if (!dbOnline()) return res.status(503).json({ message: 'Sign-in is temporarily unavailable. Please try again shortly.' });

    const user = await User.findOne({ email });
    if (!user || !verifyPassword(password, user.password)) {
      recordFail(ip);
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    clearFails(ip);
    user.lastLoginAt = new Date();
    await user.save();
    logActivity('login', user, `${user.name || user.email} signed in`);
    res.json({
      message: 'Login successful',
      user: publicUser(user),
      token: signToken({ uid: String(user._id), role: 'student' }),
      state: { registered: user.registered || [], saved: user.saved || [] }
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ message: 'Server error during sign-in. Please try again.' });
  }
});

// ---- Restore a session after a page refresh -----------------------------------
router.get('/me', requireAuth, (req, res) => {
  const u = req.user;
  if (u.role === 'admin') return res.json({ user: u, state: null });
  res.json({ user: publicUser(u), state: { registered: u.registered || [], saved: u.saved || [] } });
});

// ---- Sign out: this token can never be used again ------------------------------
router.post('/logout', requireAuth, async (req, res) => {
  try {
    await revokeToken(req.token, req.tokenExp);
    res.json({ message: 'Signed out' });
  } catch (err) {
    console.error('Logout error:', err.message);
    res.status(500).json({ message: 'Could not sign out on the server.' });
  }
});

// =============================================================================
// FORGOT PASSWORD (students only - the admin password lives in .env)
// =============================================================================
// 1. login.html → "Forgot password?" → reset-password.html asks for the email
// 2. POST /forgot-password emails a link: reset-password.html?token=<random code>
//    (only a SHA-256 hash of the code is saved, so a database leak can't be used)
// 3. The student opens the link, types a new password → POST /reset-password
//    The code works once, for 30 minutes, and old logins stop working.
const RESET_TTL_MIN = 30;
const RESET_COOLDOWN_MS = 60 * 1000;              // one email per account per minute
const hashResetToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

// Max 5 reset emails per connection every 15 minutes
const resetRequests = new Map();                  // ip -> { count, first }
function tooManyResetRequests(ip) {
  const now = Date.now();
  const entry = resetRequests.get(ip);
  if (!entry || now - entry.first > 15 * 60 * 1000) { resetRequests.set(ip, { count: 1, first: now }); return false; }
  entry.count++;
  return entry.count > 5;
}

// The link opens on the site the student came from, but only if it's ours
// (the live site or a local copy) - never an address someone else sent us.
function siteFor(req) {
  const origin = String(req.headers.origin || '');
  const ok = /^https:\/\/(www\.)?kduevents\.co\.kr$/.test(origin)
    || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return ok ? origin : SITE_URL;
}

const RESET_SENT = 'If a student account uses that email, a reset link is on its way. Check your inbox (and spam folder).';

router.post('/forgot-password', async (req, res) => {
  try {
    const email = cleanText(req.body.email, 200).toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Please enter a valid email address.' });
    if (email === ADMIN_EMAIL) return res.status(400).json({ message: 'The admin password is set on the server and cannot be reset here.' });
    if (tooManyResetRequests(req.ip)) return res.status(429).json({ message: 'Too many reset requests. Please wait 15 minutes and try again.' });
    if (!dbOnline()) return res.status(503).json({ message: 'Password reset is temporarily unavailable. Please try again shortly.' });

    // Same answer whether or not the account exists, so nobody can test which emails are registered
    const user = await User.findOne({ email });
    if (!user) return res.json({ message: RESET_SENT });
    if (user.resetRequestedAt && Date.now() - user.resetRequestedAt.getTime() < RESET_COOLDOWN_MS) {
      return res.json({ message: RESET_SENT });
    }

    const token = crypto.randomBytes(32).toString('hex');
    user.resetTokenHash = hashResetToken(token);
    user.resetTokenExpires = new Date(Date.now() + RESET_TTL_MIN * 60 * 1000);
    user.resetRequestedAt = new Date();
    await user.save();

    const link = `${siteFor(req)}/reset-password.html?token=${token}`;
    try {
      await sendMail({ to: user.email, ...resetEmail(user.name, link, RESET_TTL_MIN) });
    } catch (mailErr) {
      console.error('Reset email error:', mailErr.message);
      user.resetRequestedAt = undefined;   // let them try again straight away
      await user.save().catch(() => {});
      return res.status(502).json({ message: "We couldn't send the reset email right now. Please try again in a few minutes." });
    }
    logActivity('password_reset_requested', user, `${user.name || user.email} asked for a password reset email`);
    res.json({ message: RESET_SENT });
  } catch (err) {
    console.error('Forgot password error:', err.message);
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const token = String(req.body.token || '');
    const password = String(req.body.password || '');
    if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ message: 'This reset link is not valid. Please ask for a new one.' });
    if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    if (!dbOnline()) return res.status(503).json({ message: 'Password reset is temporarily unavailable. Please try again shortly.' });

    const user = await User.findOne({ resetTokenHash: hashResetToken(token), resetTokenExpires: { $gt: new Date() } });
    if (!user) return res.status(400).json({ message: 'This reset link has expired or was already used. Please ask for a new one.' });

    user.password = hashPassword(password);
    user.passwordChangedAt = new Date();    // signs the account out everywhere (see lib/auth.js)
    user.resetTokenHash = undefined;
    user.resetTokenExpires = undefined;
    user.resetRequestedAt = undefined;
    await user.save();
    logActivity('password_reset', user, `${user.name || user.email} reset their password`);
    res.json({ message: 'Your password has been changed. You can now sign in with your new password.' });
  } catch (err) {
    console.error('Reset password error:', err.message);
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
