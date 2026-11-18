// =============================================================================
// models/revoked-token.js — LOGIN TOKENS THAT WERE SIGNED OUT
// -----------------------------------------------------------------------------
// When someone presses "Sign out", their token's signature is stored here so the
// server refuses it from then on (even if a copy is still in another tab/browser).
// MongoDB deletes each record by itself once the token would have expired anyway.
// =============================================================================
const mongoose = require('mongoose');

const revokedTokenSchema = new mongoose.Schema({
  sig: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, expires: 0 }   // auto-delete at this time
});

module.exports = mongoose.model('RevokedToken', revokedTokenSchema);
