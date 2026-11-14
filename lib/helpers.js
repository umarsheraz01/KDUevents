// =============================================================================
// lib/helpers.js — SMALL SHARED TOOLS USED BY THE ROUTES
// -----------------------------------------------------------------------------
// cleanText()           trim user input and cap its length
// cleanIdList()         tidy a list of event ids sent by the browser
// EMAIL_RE / PHONE_RE   simple format checks for email and phone numbers
// logActivity()         add a line to the admin's activity log
// registrationCounts()  how many students registered for each event
// eventsWithCounts()    all events, each with its registeredCount
// =============================================================================
const { dbOnline } = require('./db');
const Event = require('../models/event');
const User = require('../models/user');
const Activity = require('../models/activity');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+()\d][\d\s()+-]{6,19}$/;

const cleanText = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);

function cleanIdList(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map(String).filter(id => id.length > 0 && id.length <= 64))].slice(0, 200);
}

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

// All events sorted by date, each with "registeredCount" (used for "seats left")
async function eventsWithCounts() {
  const [events, counts] = await Promise.all([
    Event.find().sort({ startsAt: 1, createdAt: 1 }).lean(),
    registrationCounts()
  ]);
  return events.map(e => ({ ...e, _id: String(e._id), registeredCount: counts[String(e._id)] || 0 }));
}

module.exports = { EMAIL_RE, PHONE_RE, cleanText, cleanIdList, logActivity, registrationCounts, eventsWithCounts };
