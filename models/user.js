// =============================================================================
// models/user.js — A STUDENT ACCOUNT
// -----------------------------------------------------------------------------
// The admin is NOT stored here: the single admin account comes from .env
// (see lib/config.js).
// =============================================================================
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },          // scrypt hash "salt:hash", never plain text
  role: { type: String, default: 'student' },
  studentId: { type: String, trim: true },
  dept: { type: String, trim: true },
  registered: { type: [String], default: [] },          // ids of events the student registered for
  saved: { type: [String], default: [] },               // ids of events the student saved (favorites)
  phone: { type: String, trim: true },                  // remembered from the last registration form
  lastLoginAt: Date
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
