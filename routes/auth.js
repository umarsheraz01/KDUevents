// =============================================================================
// routes/auth.js — SIGN UP, SIGN IN AND "WHO AM I?"
// -----------------------------------------------------------------------------
// POST /api/auth/register   create a student account (portal "Create an account")
// POST /api/auth/login      sign in as a student or as the admin
// GET  /api/auth/me         restore the session after a page refresh
// =============================================================================
const express = require('express');
const router = express.Router();

const { ADMIN_EMAIL, ADMIN_PASSWORD } = require('../lib/config');
const { dbOnline } = require('../lib/db');
const { hashPassword, verifyPassword, safeEqual, signToken, isLockedOut, recordFail, clearFails } = require('../lib/security');
const { requireAuth, adminUser, publicUser } = require('../lib/auth');
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

module.exports = router;
