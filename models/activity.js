// =============================================================================
// models/activity.js — ONE LINE IN THE ADMIN'S ACTIVITY LOG
// -----------------------------------------------------------------------------
// Written by logActivity() in lib/helpers.js whenever something happens.
// =============================================================================
const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  // signup, login, admin_login, register, cancel, save,
  // event_created, event_deleted, update_posted, update_deleted
  type: String,
  actorName: String,
  actorEmail: String,
  role: String,       // "student" or "admin"
  message: String,    // readable sentence shown in the log
  eventId: String
}, { timestamps: true });

module.exports = mongoose.model('Activity', activitySchema);
