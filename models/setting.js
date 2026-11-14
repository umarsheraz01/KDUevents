// =============================================================================
// models/setting.js — SMALL KEY/VALUE FLAGS FOR THE SERVER ITSELF
// -----------------------------------------------------------------------------
// Example: { key: "eventsSeeded", value: true } remembers that the starter
// events were already copied into the database (see lib/db.js).
// =============================================================================
const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  value: mongoose.Schema.Types.Mixed
});

module.exports = mongoose.model('Setting', settingSchema);
