// =============================================================================
// models/request.js — A "HOST AN EVENT" OR "BOOK A VENUE" REQUEST
// -----------------------------------------------------------------------------
// Saved when someone submits host-event.html or venue.html (see
// routes/requests.js). The admin is emailed the details and replies directly.
// =============================================================================
const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  type: { type: String, enum: ['host-event', 'venue-booking'], required: true },
  name: String,           // organizer / student name
  email: String,          // where the admin replies
  phone: String,
  studentId: String,
  details: { type: Object, default: {} },   // every other form field
  emailed: { type: Boolean, default: false } // was the admin email sent?
}, { timestamps: true });

module.exports = mongoose.model('Request', requestSchema);
