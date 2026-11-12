// KDU EVENTS - NODE.JS + EXPRESS + MONGODB BACKEND
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(cors());

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/kdu_events';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  SESSION_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('SESSION_SECRET is not set - using a temporary one (everyone is signed out when the server restarts).');
}
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.warn('ADMIN_EMAIL / ADMIN_PASSWORD are not set - the Admin Portal is disabled.');
}

// Events shown when the database has no events yet (or is offline)
const DEFAULT_EVENTS = [
  { _id: "1", title: "Future Forward: Tech & Innovation Summit", category: "Technology", date: "Dec 12, 2026, 10:00 AM", venue: "Innovation Hall", dept: "Faculty of Computing", seats: 42, description: "Showcase of AI and student tech projects.", image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80" },
  { _id: "2", title: "The Creative Exchange", category: "Arts & Culture", date: "Dec 18, 2026, 5:30 PM", venue: "The Atrium", dept: "Faculty of Arts", seats: 18, description: "Student art and music showcase.", image: "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=800&q=80" },
  { _id: "3", title: "Campus Founders Meetup", category: "Entrepreneurship", date: "Jan 8, 2027, 5:30 PM", venue: "Student Commons", dept: "School of Business", seats: 27, description: "Startup founders networking session.", image: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=800&q=80" }
];

// ---------------------------------------------------------------------------
// DATABASE
// ---------------------------------------------------------------------------
mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 })
  .then(() => console.log('MongoDB Database Connected Successfully'))
  .catch((err) => console.error('MongoDB connection failed:', err.message));

const EventSchema = new mongoose.Schema({
  title: String, category: String, date: String, venue: String,
  dept: String, seats: Number, description: String, image: String
});

const UserSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, default: 'student' },
  studentId: { type: String, trim: true },
  dept: { type: String, trim: true },
  registered: { type: [String], default: [] },
  saved: { type: [String], default: [] }
}, { timestamps: true });

const Event = mongoose.model('Event', EventSchema);
const User = mongoose.model('User', UserSchema);

const dbOnline = () => mongoose.connection.readyState === 1;

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
}

// Constant-time string comparison (used for the admin password)
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Signed session tokens: base64url(payload).signature
function signToken(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + SESSION_TTL_MS })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function readToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    return payload.exp > Date.now() ? payload : null;
  } catch (e) { return null; }
}

function adminUser() {
  return { name: 'KDU Admin', email: ADMIN_EMAIL, role: 'admin', studentId: 'ADMIN', dept: 'Administration' };
}

function publicUser(u) {
  return { name: u.name, email: u.email, role: 'student', studentId: u.studentId, dept: u.dept };
}

// Simple brute-force protection: max 10 failed sign-ins per IP every 15 minutes
const failedLogins = new Map();
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;

function isLockedOut(ip) {
  const entry = failedLogins.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.first > LOCK_WINDOW_MS) { failedLogins.delete(ip); return false; }
  return entry.count >= MAX_FAILS;
}
function recordFail(ip) {
  const entry = failedLogins.get(ip);
  if (!entry || Date.now() - entry.first > LOCK_WINDOW_MS) failedLogins.set(ip, { count: 1, first: Date.now() });
  else entry.count++;
}

// Auth middleware: reads "Authorization: Bearer <token>"
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const payload = readToken(header.startsWith('Bearer ') ? header.slice(7) : '');
    if (!payload) return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });

    if (payload.role === 'admin') {
      if (!ADMIN_EMAIL || payload.email !== ADMIN_EMAIL) return res.status(401).json({ message: 'Please sign in again.' });
      req.user = adminUser();
      return next();
    }

    if (!dbOnline()) return res.status(503).json({ message: 'The database is unavailable. Please try again shortly.' });
    const user = await User.findById(payload.uid);
    if (!user) return res.status(401).json({ message: 'Account not found. Please sign in again.' });
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Please sign in again.' });
  }
}

// ---------------------------------------------------------------------------
// EVENTS
// ---------------------------------------------------------------------------
app.get('/api/events', async (req, res) => {
  try {
    if (dbOnline()) {
      const events = await Event.find();
      if (events.length) return res.json(events);
    }
  } catch (e) {}
  res.json(DEFAULT_EVENTS);
});

// ---------------------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------------------
app.post('/api/auth/register', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').toLowerCase().trim();
    const password = String(req.body.password || '');
    const studentId = String(req.body.studentId || '').trim();
    const dept = String(req.body.dept || '').trim();

    if (!name) return res.status(400).json({ message: 'Please enter your full name.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Please enter a valid email address.' });
    if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    if (email === ADMIN_EMAIL) return res.status(400).json({ message: 'This email cannot be used for a student account.' });
    if (!dbOnline()) return res.status(503).json({ message: 'Registration is temporarily unavailable. Please try again shortly.' });

    if (await User.exists({ email })) {
      return res.status(409).json({ message: 'An account with this email already exists. Please sign in.' });
    }

    const user = await User.create({ name, email, password: hashPassword(password), role: 'student', studentId, dept });
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

app.post('/api/auth/login', async (req, res) => {
  const ip = req.ip;
  try {
    if (isLockedOut(ip)) {
      return res.status(429).json({ message: 'Too many failed attempts. Please wait 15 minutes and try again.' });
    }

    const email = String(req.body.email || '').toLowerCase().trim();
    const password = String(req.body.password || '');
    const role = req.body.role === 'admin' ? 'admin' : 'student';
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });

    // ADMIN PORTAL: only the single configured admin account may enter
    if (role === 'admin') {
      const ok = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD) && email === ADMIN_EMAIL && safeEqual(password, ADMIN_PASSWORD);
      if (!ok) {
        recordFail(ip);
        return res.status(401).json({ message: 'Invalid admin email or password.' });
      }
      failedLogins.delete(ip);
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
    failedLogins.delete(ip);
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

// Restore a session after a page refresh
app.get('/api/auth/me', requireAuth, (req, res) => {
  const u = req.user;
  if (u.role === 'admin') return res.json({ user: u, state: null });
  res.json({ user: publicUser(u), state: { registered: u.registered || [], saved: u.saved || [] } });
});

// ---------------------------------------------------------------------------
// STUDENT DATA (saved + registered events, stored in MongoDB)
// ---------------------------------------------------------------------------
function cleanIdList(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map(String).filter(id => id.length > 0 && id.length <= 64))].slice(0, 200);
}

app.put('/api/me/state', requireAuth, async (req, res) => {
  if (req.user.role === 'admin') return res.json({ registered: [], saved: [] });
  try {
    req.user.registered = cleanIdList(req.body.registered);
    req.user.saved = cleanIdList(req.body.saved);
    await req.user.save();
    res.json({ registered: req.user.registered, saved: req.user.saved });
  } catch (err) {
    console.error('Save state error:', err.message);
    res.status(500).json({ message: 'Could not save your changes.' });
  }
});

// Newsletter subscription (routes/api.js -> POST /api/subscribe)
app.use('/api', require('./routes/api'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`KDU Events Server running on port ${PORT}`));
