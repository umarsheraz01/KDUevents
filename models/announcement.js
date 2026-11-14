// =============================================================================
// models/announcement.js — AN UPDATE SENT BY THE ADMIN TO ALL STUDENTS
// -----------------------------------------------------------------------------
// Shown in every student's Notifications tab.
// =============================================================================
const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true }
}, { timestamps: true });

module.exports = mongoose.model('Announcement', announcementSchema);
