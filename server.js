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

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1523580494863-6f3031224c94?auto=format&fit=crop&w=800&q=80';

// Starter events: copied into the database once, then managed by the admin
const STARTER_EVENTS = [
  { title: "Future Forward: Tech & Innovation Summit", category: "Technology", date: "Dec 12, 2026, 10:00 AM", startsAt: new Date("2026-12-12T10:00:00+09:00"), venue: "Innovation Hall", dept: "Faculty of Computing", seats: 42, description: "Showcase of AI and student tech projects.", image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80" },
  { title: "The Creative Exchange", category: "Arts & Culture", date: "Dec 18, 2026, 5:30 PM", startsAt: new Date("2026-12-18T17:30:00+09:00"), venue: "The Atrium", dept: "Faculty of Arts", seats: 18, description: "Student art and music showcase.", image: "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=800&q=80" },
  { title: "Campus Founders Meetup", category: "Entrepreneurship", date: "Jan 8, 2027, 5:30 PM", startsAt: new Date("2027-01-08T17:30:00+09:00"), venue: "Student Commons", dept: "School of Business", seats: 27, description: "Startup founders networking session.", image: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=800&q=80" }
];

// ---------------------------------------------------------------------------
// DATABASE MODELS
// ---------------------------------------------------------------------------
const EventSchema = new mongoose.Schema({
  title: String, category: String, date: String, startsAt: Date, venue: String,
  dept: String, seats: Number, description: String, image: String
}, { timestamps: true });

const UserSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, default: 'student' },
  studentId: { type: String, trim: true },
  dept: { type: String, trim: true },
  registered: { type: [String], default: [] },
  saved: { type: [String], default: [] },
  lastLoginAt: Date
}, { timestamps: true });

// Everything that happens in the portal, shown to the admin
const ActivitySchema = new mongoose.Schema({
  type: String,        // signup, login, admin_login, register, cancel, save, unsave, event_created, event_deleted, update_posted, update_deleted
  actorName: String,
  actorEmail: String,
  role: String,        // student | admin
  message: String,
  eventId: String
}, { timestamps: true });

// Updates sent by the admin to all students
const AnnouncementSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true }
}, { timestamps: true });

const SettingSchema = new mongoose.Schema({ key: { type: String, unique: true }, value: mongoose.Schema.Types.Mixed });

const Event = mongoose.model('Event', EventSchema);
const User = mongoose.model('User', UserSchema);
const Activity = mongoose.model('Activity', ActivitySchema);
const Announcement = mongoose.model('Announcement', AnnouncementSchema);
const Setting = mongoose.model('Setting', SettingSchema);

const dbOnline = () => mongoose.connection.readyState === 1;

// Copy the starter events into the database the first time only
async function seedEventsOnce() {
  const done = await Setting.findOne({ key: 'eventsSeeded' });
  if (done) return;
  if ((await Event.countDocuments()) === 0) await Event.insertMany(STARTER_EVENTS);
  await Setting.create({ key: 'eventsSeeded', value: true });
  console.log('Starter events added to the database.');
}

mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 })
  .then(async () => {
    console.log('MongoDB Database Connected Successfully');
    try { await seedEventsOnce(); } catch (e) { console.error('Seeding failed:', e.message); }
  })
  .catch((err) => console.error('MongoDB connection failed:', err.message));

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

const cleanText = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);

// Record something in the activity log (never blocks or breaks the request)
function logActivity(type, actor, message, eventId) {
  if (!dbOnline()) return;
  Activity.create({
    type, message, eventId: eventId ? String(eventId) : undefined,
    actorName: actor.name || actor.email, actorEmail: actor.email, role: actor.role || 'student'
  }).catch(err => console.error('Activity log error:', err.message));
}

// How many students are registered for each event: { eventId: count }
async function registrationCounts() {
  const rows = await User.aggregate([
    { $unwind: '$registered' },
    { $group: { _id: '$registered', count: { $sum: 1 } } }
  ]);
  return Object.fromEntries(rows.map(r => [String(r._id), r.count]));
}

async function eventsWithCounts() {
  const [events, counts] = await Promise.all([
    Event.find().sort({ startsAt: 1, createdAt: 1 }).lean(),
    registrationCounts()
  ]);
  return events.map(e => ({ ...e, _id: String(e._id), registeredCount: counts[String(e._id)] || 0 }));
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

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access only.' });
    if (!dbOnline()) return res.status(503).json({ message: 'The database is unavailable. Please try again shortly.' });
    next();
  });
}

// ---------------------------------------------------------------------------
// EVENTS (public)
// ---------------------------------------------------------------------------
app.get('/api/events', async (req, res) => {
  try {
    if (dbOnline()) return res.json(await eventsWithCounts());
  } catch (e) {
    console.error('Events error:', e.message);
  }
  res.json(STARTER_EVENTS.map((e, i) => ({ ...e, _id: String(i + 1), registeredCount: 0 })));
});

// ---------------------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------------------
app.post('/api/auth/register', async (req, res) => {
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
    failedLogins.delete(ip);
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
    const user = req.user;
    const events = await Event.find().lean();
    const byId = new Map(events.map(e => [String(e._id), e]));

    // Only keep ids of events that still exist
    const nextRegistered = cleanIdList(req.body.registered).filter(id => byId.has(id));
    const nextSaved = cleanIdList(req.body.saved).filter(id => byId.has(id));

    const prevRegistered = user.registered || [];
    const prevSaved = user.saved || [];
    const added = nextRegistered.filter(id => !prevRegistered.includes(id));
    const removed = prevRegistered.filter(id => !nextRegistered.includes(id) && byId.has(id));

    // Seat limit check for new registrations
    if (added.length) {
      const counts = await registrationCounts();
      for (const id of added) {
        const evt = byId.get(id);
        if ((counts[id] || 0) >= (Number(evt.seats) || 0)) {
          return res.status(409).json({ message: `Sorry, "${evt.title}" is fully booked.`, registered: prevRegistered, saved: prevSaved });
        }
      }
    }

    user.registered = nextRegistered;
    user.saved = nextSaved;
    await user.save();

    const who = user.name || user.email;
    added.forEach(id => logActivity('register', user, `${who} registered for "${byId.get(id).title}"`, id));
    removed.forEach(id => logActivity('cancel', user, `${who} cancelled their registration for "${byId.get(id).title}"`, id));
    nextSaved.filter(id => !prevSaved.includes(id))
      .forEach(id => logActivity('save', user, `${who} saved "${byId.get(id).title}"`, id));

    res.json({ registered: user.registered, saved: user.saved });
  } catch (err) {
    console.error('Save state error:', err.message);
    res.status(500).json({ message: 'Could not save your changes.' });
  }
});

// Updates from the admin, shown in every student's Notifications tab
app.get('/api/announcements', requireAuth, async (req, res) => {
  try {
    if (!dbOnline()) return res.json([]);
    res.json(await Announcement.find().sort({ createdAt: -1 }).limit(50).lean());
  } catch (err) {
    res.status(500).json({ message: 'Could not load updates.' });
  }
});

// ---------------------------------------------------------------------------
// ADMIN
// ---------------------------------------------------------------------------
app.get('/api/admin/summary', requireAdmin, async (req, res) => {
  try {
    const [students, eventIds, announcements, recent, counts] = await Promise.all([
      User.countDocuments({ role: { $ne: 'admin' } }),
      Event.find().distinct('_id'),
      Announcement.countDocuments(),
      Activity.find().sort({ createdAt: -1 }).limit(8).lean(),
      registrationCounts()
    ]);
    // Only count registrations for events that still exist
    const registrations = eventIds.reduce((sum, id) => sum + (counts[String(id)] || 0), 0);
    res.json({ students, events: eventIds.length, registrations, announcements, recent });
  } catch (err) {
    console.error('Summary error:', err.message);
    res.status(500).json({ message: 'Could not load the dashboard.' });
  }
});

app.get('/api/admin/students', requireAdmin, async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: 'admin' } }).sort({ createdAt: -1 }).lean();
    res.json(users.map(u => ({
      _id: String(u._id), name: u.name, email: u.email, studentId: u.studentId, dept: u.dept,
      registeredCount: (u.registered || []).length, savedCount: (u.saved || []).length,
      createdAt: u.createdAt, lastLoginAt: u.lastLoginAt
    })));
  } catch (err) {
    res.status(500).json({ message: 'Could not load students.' });
  }
});

app.get('/api/admin/activity', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 300);
    res.json(await Activity.find().sort({ createdAt: -1 }).limit(limit).lean());
  } catch (err) {
    res.status(500).json({ message: 'Could not load activity.' });
  }
});

app.post('/api/admin/events', requireAdmin, async (req, res) => {
  try {
    const title = cleanText(req.body.title, 150);
    const category = cleanText(req.body.category, 60);
    const venue = cleanText(req.body.venue, 120);
    const dept = cleanText(req.body.dept, 120);
    const description = cleanText(req.body.description, 2000);
    const seats = Math.floor(Number(req.body.seats));
    const startsAt = new Date(req.body.startsAt);
    let image = cleanText(req.body.image, 1000);

    if (!title) return res.status(400).json({ message: 'Please enter an event title.' });
    if (!category) return res.status(400).json({ message: 'Please choose a category.' });
    if (isNaN(startsAt.getTime())) return res.status(400).json({ message: 'Please choose a valid date and time.' });
    if (!venue) return res.status(400).json({ message: 'Please enter a venue.' });
    if (!Number.isFinite(seats) || seats < 1 || seats > 100000) return res.status(400).json({ message: 'Seats must be a number between 1 and 100000.' });
    if (image && !/^https?:\/\//i.test(image)) return res.status(400).json({ message: 'Image must be a web address starting with http:// or https://' });
    if (!image) image = DEFAULT_IMAGE;

    const date = cleanText(req.body.date, 60) || startsAt.toUTCString();
    const evt = await Event.create({ title, category, date, startsAt, venue, dept, seats, description, image });
    logActivity('event_created', req.user, `Admin created the event "${title}"`, evt._id);
    res.status(201).json({ ...evt.toObject(), _id: String(evt._id), registeredCount: 0 });
  } catch (err) {
    console.error('Create event error:', err.message);
    res.status(500).json({ message: 'Could not create the event.' });
  }
});

app.delete('/api/admin/events/:id', requireAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Event not found.' });
    const evt = await Event.findByIdAndDelete(req.params.id);
    if (!evt) return res.status(404).json({ message: 'Event not found.' });
    const id = String(evt._id);
    await User.updateMany({}, { $pull: { registered: id, saved: id } });
    logActivity('event_deleted', req.user, `Admin deleted the event "${evt.title}"`, id);
    res.json({ message: 'Event deleted' });
  } catch (err) {
    console.error('Delete event error:', err.message);
    res.status(500).json({ message: 'Could not delete the event.' });
  }
});

app.get('/api/admin/events/:id/attendees', requireAdmin, async (req, res) => {
  try {
    const users = await User.find({ registered: req.params.id }).sort({ name: 1 }).lean();
    res.json(users.map(u => ({ name: u.name, email: u.email, studentId: u.studentId, dept: u.dept })));
  } catch (err) {
    res.status(500).json({ message: 'Could not load attendees.' });
  }
});

app.post('/api/admin/announcements', requireAdmin, async (req, res) => {
  try {
    const title = cleanText(req.body.title, 150);
    const message = cleanText(req.body.message, 2000);
    if (!title || !message) return res.status(400).json({ message: 'Please enter a title and a message.' });
    const a = await Announcement.create({ title, message });
    logActivity('update_posted', req.user, `Admin sent the update "${title}" to all students`);
    res.status(201).json(a);
  } catch (err) {
    res.status(500).json({ message: 'Could not send the update.' });
  }
});

app.delete('/api/admin/announcements/:id', requireAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Update not found.' });
    const a = await Announcement.findByIdAndDelete(req.params.id);
    if (!a) return res.status(404).json({ message: 'Update not found.' });
    logActivity('update_deleted', req.user, `Admin removed the update "${a.title}"`);
    res.json({ message: 'Update removed' });
  } catch (err) {
    res.status(500).json({ message: 'Could not remove the update.' });
  }
});

// Newsletter subscription (routes/api.js -> POST /api/subscribe)
app.use('/api', require('./routes/api'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`KDU Events Server running on port ${PORT}`));
