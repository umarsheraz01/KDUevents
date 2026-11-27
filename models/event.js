// =============================================================================
// models/event.js — AN EVENT (created by the admin, shown to everyone)
// =============================================================================
const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: String,
  category: String,     // Technology, Arts & Culture, Entrepreneurship, Sports, Academic
  date: String,         // readable date shown on the site, e.g. "Dec 12, 2026, 10:00 AM"
  startsAt: Date,       // real date, used for sorting
  endsAt: Date,         // optional end time (same day), e.g. 4:00 PM
  venue: String,
  dept: String,         // organizing department
  seats: Number,        // total seats; registrations stop when full
  description: String,
  image: String,        // web link, or "/api/images/<id>" for an uploaded banner
  photos: [String],     // extra photos shown in the archive gallery once the event is over
  attendees: Number     // how many people actually came (shown in the archive)
}, { timestamps: true });

module.exports = mongoose.model('Event', eventSchema);
