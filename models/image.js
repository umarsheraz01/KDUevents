// =============================================================================
// models/image.js — AN EVENT BANNER UPLOADED BY THE ADMIN
// -----------------------------------------------------------------------------
// Stored inside MongoDB (not on the server's disk) because Render's free plan
// wipes uploaded files whenever the server restarts.
// =============================================================================
const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema({
  data: { type: Buffer, required: true },          // the image file itself
  contentType: { type: String, required: true },   // e.g. "image/jpeg"
  size: Number                                     // bytes
}, { timestamps: true });

module.exports = mongoose.model('Image', imageSchema);
