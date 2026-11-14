// =============================================================================
// models/registration.js — ONE FILLED-IN EVENT REGISTRATION FORM
// -----------------------------------------------------------------------------
// One document per student per event. The admin's participant list is built
// from these documents.
// =============================================================================
const mongoose = require('mongoose');

const registrationSchema = new mongoose.Schema({
  eventId: { type: String, required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  studentId: { type: String, trim: true },
  dept: { type: String, trim: true },
  phone: { type: String, trim: true },
  note: { type: String, trim: true }   // optional message for the organizer
}, { timestamps: true });

// A student can register for the same event only once
registrationSchema.index({ eventId: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('Registration', registrationSchema);
