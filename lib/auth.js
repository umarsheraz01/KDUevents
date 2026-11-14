// =============================================================================
// lib/auth.js — WHO IS MAKING THIS REQUEST?
// -----------------------------------------------------------------------------
// requireAuth    route guard: the request must carry a valid login token
//                (sets req.user to the student's database record, or to the admin)
// requireAdmin   route guard: the request must come from the admin account
// adminUser()    the admin's profile (the admin is not stored in the database)
// publicUser()   the safe parts of a student record to send to the browser
//                (never the password hash)
// =============================================================================
const { ADMIN_EMAIL } = require('./config');
const { readToken } = require('./security');
const { dbOnline } = require('./db');
const User = require('../models/user');

function adminUser() {
  return { name: 'KDU Admin', email: ADMIN_EMAIL, role: 'admin', studentId: 'ADMIN', dept: 'Administration' };
}

function publicUser(u) {
  return { name: u.name, email: u.email, role: 'student', studentId: u.studentId, dept: u.dept, phone: u.phone || '' };
}

// Reads "Authorization: Bearer <token>" and loads the signed-in user
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const payload = readToken(header.startsWith('Bearer ') ? header.slice(7) : '');
    if (!payload) return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });

    // Admin token: only valid for the admin email set in .env
    if (payload.role === 'admin') {
      if (!ADMIN_EMAIL || payload.email !== ADMIN_EMAIL) return res.status(401).json({ message: 'Please sign in again.' });
      req.user = adminUser();
      return next();
    }

    // Student token: load the account from the database
    if (!dbOnline()) return res.status(503).json({ message: 'The database is unavailable. Please try again shortly.' });
    const user = await User.findById(payload.uid);
    if (!user) return res.status(401).json({ message: 'Account not found. Please sign in again.' });
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Please sign in again.' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access only.' });
    if (!dbOnline()) return res.status(503).json({ message: 'The database is unavailable. Please try again shortly.' });
    next();
  });
}

module.exports = { requireAuth, requireAdmin, adminUser, publicUser };
