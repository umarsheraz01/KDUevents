// KDU EVENTS - NODE.JS + EXPRESS + MONGODB BACKEND
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
// Small JSON bodies everywhere, except the image upload route which allows larger ones
const smallJson = express.json({ limit: '100kb' });
const imageJson = express.json({ limit: '4mb' });
app.use((req, res, next) => (req.path === '/api/admin/images' ? next() : smallJson(req, res, next)));
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
  phone: { type: String, trim: true },
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

// Event banner images uploaded by the admin (stored in MongoDB so they survive server restarts)
const ImageSchema = new mongoose.Schema({
  data: { type: Buffer, required: true },
  contentType: { type: String, required: true },
  size: Number
}, { timestamps: true });

// One document per student per event, filled in through the registration form
const RegistrationSchema = new mongoose.Schema({
  eventId: { type: String, required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  studentId: { type: String, trim: true },
  dept: { type: String, trim: true },
  phone: { type: String, trim: true },
  note: { type: String, trim: true }
}, { timestamps: true });
RegistrationSchema.index({ eventId: 1, user: 1 }, { unique: true });

const SettingSchema = new mongoose.Schema({ key: { type: String, unique: true }, value: mongoose.Schema.Types.Mixed });

const Event = mongoose.model('Event', EventSchema);
const User = mongoose.model('User', UserSchema);
const Activity = mongoose.model('Activity', ActivitySchema);
const Announcement = mongoose.model('Announcement', AnnouncementSchema);
const Setting = mongoose.model('Setting', SettingSchema);
const Registration = mongoose.model('Registration', RegistrationSchema);
const Image = mongoose.model('Image', ImageSchema);

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
  return { name: u.name, email: u.email, role: 'student', studentId: u.studentId, dept: u.dept, phone: u.phone || '' };
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

// Saved (favorite) events. Registrations go through the registration form endpoints below.
app.put('/api/me/state', requireAuth, async (req, res) => {
  if (req.user.role === 'admin') return res.json({ registered: [], saved: [] });
  try {
    const user = req.user;
    const events = await Event.find().lean();
    const byId = new Map(events.map(e => [String(e._id), e]));
    const nextSaved = cleanIdList(req.body.saved).filter(id => byId.has(id));
    const prevSaved = user.saved || [];

    user.saved = nextSaved;
    await user.save();

    const who = user.name || user.email;
    nextSaved.filter(id => !prevSaved.includes(id))
      .forEach(id => logActivity('save', user, `${who} saved "${byId.get(id).title}"`, id));

    res.json({ registered: user.registered || [], saved: user.saved });
  } catch (err) {
    console.error('Save state error:', err.message);
    res.status(500).json({ message: 'Could not save your changes.' });
  }
});

// ---------------------------------------------------------------------------
// EVENT REGISTRATION FORM
// ---------------------------------------------------------------------------
const PHONE_RE = /^[+()\d][\d\s()+-]{6,19}$/;

app.post('/api/events/:id/register', requireAuth, async (req, res) => {
  if (req.user.role === 'admin') return res.status(403).json({ message: 'The admin account cannot register for events.' });
  try {
    const user = req.user;
    const id = String(req.params.id);
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ message: 'Event not found.' });
    const evt = await Event.findById(id).lean();
    if (!evt) return res.status(404).json({ message: 'Event not found.' });

    const name = cleanText(req.body.name, 100) || user.name;
    const studentId = cleanText(req.body.studentId, 50);
    const dept = cleanText(req.body.dept, 100);
    const phone = cleanText(req.body.phone, 25);
    const note = cleanText(req.body.note, 300);

    if (!name) return res.status(400).json({ message: 'Please enter your full name.' });
    if (!studentId) return res.status(400).json({ message: 'Please enter your student ID.' });
    if (!dept) return res.status(400).json({ message: 'Please choose your department.' });
    if (!PHONE_RE.test(phone)) return res.status(400).json({ message: 'Please enter a valid phone number.' });
    if (req.body.agree !== true) return res.status(400).json({ message: 'Please confirm that you will attend.' });

    if ((user.registered || []).includes(id) || await Registration.exists({ eventId: id, user: user._id })) {
      return res.status(409).json({ message: 'You are already registered for this event.' });
    }

    const counts = await registrationCounts();
    if ((counts[id] || 0) >= (Number(evt.seats) || 0)) {
      return res.status(409).json({ message: `Sorry, "${evt.title}" is fully booked.` });
    }

    await Registration.create({ eventId: id, user: user._id, name, email: user.email, studentId, dept, phone, note });
    user.registered = [...new Set([...(user.registered || []), id])];
    // Remember details for next time
    if (!user.studentId) user.studentId = studentId;
    if (!user.dept) user.dept = dept;
    user.phone = phone;
    await user.save();

    logActivity('register', user, `${name} registered for "${evt.title}"`, id);
    res.status(201).json({ message: 'Registered', registered: user.registered, saved: user.saved || [], user: publicUser(user) });
  } catch (err) {
    if (err && err.code === 11000) return res.status(409).json({ message: 'You are already registered for this event.' });
    console.error('Register for event error:', err.message);
    res.status(500).json({ message: 'Could not complete your registration. Please try again.' });
  }
});

app.delete('/api/events/:id/register', requireAuth, async (req, res) => {
  if (req.user.role === 'admin') return res.status(403).json({ message: 'Admin access only.' });
  try {
    const user = req.user;
    const id = String(req.params.id);
    const had = (user.registered || []).includes(id);
    await Registration.deleteOne({ eventId: id, user: user._id });
    user.registered = (user.registered || []).filter(r => r !== id);
    await user.save();
    if (had) {
      const evt = mongoose.isValidObjectId(id) ? await Event.findById(id).lean() : null;
      logActivity('cancel', user, `${user.name || user.email} cancelled their registration for "${evt ? evt.title : 'an event'}"`, id);
    }
    res.json({ message: 'Registration cancelled', registered: user.registered, saved: user.saved || [] });
  } catch (err) {
    console.error('Cancel registration error:', err.message);
    res.status(500).json({ message: 'Could not cancel your registration.' });
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
    const uploaded = /^\/api\/images\/[a-f0-9]{24}$/.test(image);
    if (image && !uploaded && !/^https?:\/\//i.test(image)) return res.status(400).json({ message: 'Image must be an uploaded picture or a web address starting with http:// or https://' });
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
    await Registration.deleteMany({ eventId: id });
    const imageMatch = /^\/api\/images\/([a-f0-9]{24})$/.exec(evt.image || '');
    if (imageMatch) await Image.findByIdAndDelete(imageMatch[1]).catch(() => {});
    logActivity('event_deleted', req.user, `Admin deleted the event "${evt.title}"`, id);
    res.json({ message: 'Event deleted' });
  } catch (err) {
    console.error('Delete event error:', err.message);
    res.status(500).json({ message: 'Could not delete the event.' });
  }
});

// Upload an event banner. Body: { image: "data:image/jpeg;base64,..." }
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;

app.post('/api/admin/images', requireAdmin, imageJson, async (req, res) => {
  try {
    const match = /^data:([a-z/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body.image || ''));
    if (!match) return res.status(400).json({ message: 'Please choose an image file.' });
    const contentType = match[1].toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.includes(contentType)) return res.status(400).json({ message: 'Only JPG, PNG, WebP or GIF images are allowed.' });
    const data = Buffer.from(match[2], 'base64');
    if (!data.length) return res.status(400).json({ message: 'The image file is empty.' });
    if (data.length > MAX_IMAGE_BYTES) return res.status(413).json({ message: 'The image is too large. Please use one under 2.5 MB.' });

    const img = await Image.create({ data, contentType, size: data.length });
    res.status(201).json({ url: `/api/images/${img._id}` });
  } catch (err) {
    console.error('Image upload error:', err.message);
    res.status(500).json({ message: 'Could not upload the image.' });
  }
});

// Serve an uploaded image (public, so it works in <img> tags)
app.get('/api/images/:id', async (req, res) => {
  try {
    if (!dbOnline() || !mongoose.isValidObjectId(req.params.id)) return res.status(404).end();
    const img = await Image.findById(req.params.id).lean();
    if (!img) return res.status(404).end();
    res.set('Content-Type', img.contentType);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('X-Content-Type-Options', 'nosniff');
    res.send(img.data.buffer ? Buffer.from(img.data.buffer) : img.data);
  } catch (err) {
    res.status(404).end();
  }
});

// Participant list: registration form details for every student registered for the event
app.get('/api/admin/events/:id/attendees', requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    const [regs, users] = await Promise.all([
      Registration.find({ eventId: id }).sort({ createdAt: 1 }).lean(),
      User.find({ registered: id }).lean()
    ]);
    const list = regs.map(r => ({ name: r.name, email: r.email, studentId: r.studentId, dept: r.dept, phone: r.phone, note: r.note, registeredAt: r.createdAt }));
    // Older registrations made before the form existed
    const withForm = new Set(regs.map(r => String(r.user)));
    users.filter(u => !withForm.has(String(u._id))).forEach(u => list.push({
      name: u.name, email: u.email, studentId: u.studentId, dept: u.dept, phone: u.phone || '', note: '', registeredAt: null
    }));
    res.json(list);
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

// Friendly message when a request body is too large or malformed
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') return res.status(413).json({ message: 'The upload is too large. Please use a smaller image.' });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid request.' });
  next(err);
});

// Newsletter subscription (routes/api.js -> POST /api/subscribe)
app.use('/api', require('./routes/api'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`KDU Events Server running on port ${PORT}`));
