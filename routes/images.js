// =============================================================================
// routes/images.js — SHOW AN UPLOADED EVENT BANNER
// -----------------------------------------------------------------------------
// GET /api/images/:id   returns the image file (public, so it works in <img> tags)
// Banners are uploaded by the admin through routes/admin.js (POST /api/admin/images).
// =============================================================================
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const { dbOnline } = require('../lib/db');
const Image = require('../models/image');

router.get('/:id', async (req, res) => {
  try {
    if (!dbOnline() || !mongoose.isValidObjectId(req.params.id)) return res.status(404).end();
    const img = await Image.findById(req.params.id).lean();
    if (!img) return res.status(404).end();
    res.set('Content-Type', img.contentType);
    res.set('Cache-Control', 'public, max-age=31536000, immutable'); // browsers can cache it for a year
    res.set('X-Content-Type-Options', 'nosniff');
    res.send(img.data.buffer ? Buffer.from(img.data.buffer) : img.data);
  } catch (err) {
    res.status(404).end();
  }
});

module.exports = router;
