// =============================================================================
// lib/db.js — CONNECTING TO MONGODB
// -----------------------------------------------------------------------------
// connectDatabase()  opens the connection to MongoDB Atlas (called once in server.js)
// dbOnline()         true while the database connection is working
// STARTER_EVENTS     the 3 example events copied into the database the very first time
// PAST_EVENTS        past campus events copied into the database once (the archive)
// =============================================================================
const mongoose = require('mongoose');
const { MONGO_URI } = require('./config');
const Event = require('../models/event');
const Setting = require('../models/setting');

// Default banner used when the admin creates an event without an image
const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1523580494863-6f3031224c94?auto=format&fit=crop&w=800&q=80';

// Starter events: copied into the database once, then managed by the admin like any other event
const STARTER_EVENTS = [
  { title: "Future Forward: Tech & Innovation Summit", category: "Technology", date: "Dec 12, 2026, 10:00 AM", startsAt: new Date("2026-12-12T10:00:00+09:00"), venue: "Innovation Hall", dept: "Faculty of Computing", seats: 42, description: "Showcase of AI and student tech projects.", image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80" },
  { title: "The Creative Exchange", category: "Arts & Culture", date: "Dec 18, 2026, 5:30 PM", startsAt: new Date("2026-12-18T17:30:00+09:00"), venue: "The Atrium", dept: "Faculty of Arts", seats: 18, description: "Student art and music showcase.", image: "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=800&q=80" },
  { title: "Campus Founders Meetup", category: "Entrepreneurship", date: "Jan 8, 2027, 5:30 PM", startsAt: new Date("2027-01-08T17:30:00+09:00"), venue: "Student Commons", dept: "School of Business", seats: 27, description: "Startup founders networking session.", image: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=800&q=80" }
];

// Past events: copied into the database once, then shown on the homepage
// ("Previously on campus", newest 3) and on past-events.html (all of them).
// Photos use the full site address so they also load on the portal subdomain.
const SITE = 'https://kduevents.co.kr/assets/';
const PAST_EVENTS = [
  { title: "Cultural Day", category: "Arts & Culture", date: "Sep 10, 2026", startsAt: new Date("2026-09-10T10:00:00+09:00"), venue: "Main Campus", dept: "International Office", seats: 312, attendees: 312, description: "Students from around the world shared their food, music, and traditional dress on the main campus.", image: SITE + "matric%202.jpeg", photos: [SITE + "matric%202.jpeg", SITE + "matri%201.jpeg", SITE + "matri%203.jpeg"] },
  { title: "Environment Cleaning Day", category: "Community", date: "Jun 8, 2026", startsAt: new Date("2026-06-08T10:00:00+09:00"), venue: "Main Campus", dept: "Student Council", seats: 240, attendees: 240, description: "Volunteers cleaned up the campus and the surrounding neighbourhood to keep KDU green.", image: SITE + "envirn%202.jpeg", photos: [SITE + "envirn%202.jpeg", SITE + "environ%201.jpeg", SITE + "environ%203.jpeg"] },
  { title: "Sports Day 2026", category: "Sports", date: "May 8, 2026", startsAt: new Date("2026-05-08T10:00:00+09:00"), venue: "Sports Ground", dept: "Sports Committee", seats: 150, attendees: 150, description: "A full day of football, relay races, and team games between departments.", image: SITE + "sports.jpeg", photos: [SITE + "sports.jpeg"] }
];

const dbOnline = () => mongoose.connection.readyState === 1;

// Copy the starter events into the database the first time only
// (a "Setting" flag remembers it, so deleted events never come back)
async function seedEventsOnce() {
  const done = await Setting.findOne({ key: 'eventsSeeded' });
  if (done) return;
  if ((await Event.countDocuments()) === 0) await Event.insertMany(STARTER_EVENTS);
  await Setting.create({ key: 'eventsSeeded', value: true });
  console.log('Starter events added to the database.');
}

// Copy the past events into the database the first time only.
// An event counts as already there when the title AND the day both match
// (so an upcoming event with the same name is not mistaken for it).
// Deleted past events never come back, because the flag below is saved.
async function seedPastEventsOnce() {
  const FLAG = 'pastEventsSeeded2';
  if (await Setting.findOne({ key: FLAG })) return;
  const sameEvent = (a, b) => String(a.title).toLowerCase() === String(b.title).toLowerCase()
    && a.startsAt && new Date(a.startsAt).toDateString() === new Date(b.startsAt).toDateString();
  const existing = await Event.find({}, 'title startsAt').lean();
  const missing = PAST_EVENTS.filter(p => !existing.some(e => sameEvent(e, p)));
  if (missing.length) await Event.insertMany(missing);
  await Setting.create({ key: FLAG, value: true });
  console.log(`Past events added to the database (${missing.length}).`);
}

function connectDatabase() {
  mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 })
    .then(async () => {
      console.log('MongoDB Database Connected Successfully');
      try { await seedEventsOnce(); } catch (e) { console.error('Seeding failed:', e.message); }
      try { await seedPastEventsOnce(); } catch (e) { console.error('Past events seeding failed:', e.message); }
    })
    .catch((err) => console.error('MongoDB connection failed:', err.message));
}

module.exports = { connectDatabase, dbOnline, STARTER_EVENTS, PAST_EVENTS, DEFAULT_IMAGE };
