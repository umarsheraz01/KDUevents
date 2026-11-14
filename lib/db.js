// =============================================================================
// lib/db.js — CONNECTING TO MONGODB
// -----------------------------------------------------------------------------
// connectDatabase()  opens the connection to MongoDB Atlas (called once in server.js)
// dbOnline()         true while the database connection is working
// STARTER_EVENTS     the 3 example events copied into the database the very first time
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

function connectDatabase() {
  mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 })
    .then(async () => {
      console.log('MongoDB Database Connected Successfully');
      try { await seedEventsOnce(); } catch (e) { console.error('Seeding failed:', e.message); }
    })
    .catch((err) => console.error('MongoDB connection failed:', err.message));
}

module.exports = { connectDatabase, dbOnline, STARTER_EVENTS, DEFAULT_IMAGE };
