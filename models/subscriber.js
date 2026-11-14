// =============================================================================
// models/subscriber.js — A NEWSLETTER SUBSCRIBER
// -----------------------------------------------------------------------------
// Created when someone enters their email in the newsletter box on the
// homepage (see routes/newsletter.js). They then get the welcome email.
// =============================================================================
const mongoose = require('mongoose');

const subscriberSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  subscribedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Subscriber', subscriberSchema);
