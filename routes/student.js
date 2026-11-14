// =============================================================================
// routes/student.js — A SIGNED-IN STUDENT'S OWN DATA
// -----------------------------------------------------------------------------
// PUT /api/me/state         save the student's favorite ("saved") events
// GET /api/announcements    updates from the admin (Notifications tab)
// =============================================================================
const express = require('express');
const router = express.Router();

const { dbOnline } = require('../lib/db');
const { requireAuth } = require('../lib/auth');
const { cleanIdList, logActivity } = require('../lib/helpers');
const Event = require('../models/event');
const Announcement = require('../models/announcement');

// ---- Saved (favorite) events ----------------------------------------------------
// Registrations are NOT changed here; they go through the registration form
// (routes/events.js).
router.put('/me/state', requireAuth, async (req, res) => {
  if (req.user.role === 'admin') return res.json({ registered: [], saved: [] });
  try {
    const user = req.user;
    const events = await Event.find().lean();
    const byId = new Map(events.map(e => [String(e._id), e]));
    const nextSaved = cleanIdList(req.body.saved).filter(id => byId.has(id));
    const prevSaved = user.saved || [];

    user.saved = nextSaved;
    await user.save();

    const who = user.name || user.email;
    nextSaved.filter(id => !prevSaved.includes(id))
      .forEach(id => logActivity('save', user, `${who} saved "${byId.get(id).title}"`, id));

    res.json({ registered: user.registered || [], saved: user.saved });
  } catch (err) {
    console.error('Save state error:', err.message);
    res.status(500).json({ message: 'Could not save your changes.' });
  }
});

// ---- Updates from the admin -----------------------------------------------------
router.get('/announcements', requireAuth, async (req, res) => {
  try {
    if (!dbOnline()) return res.json([]);
    res.json(await Announcement.find().sort({ createdAt: -1 }).limit(50).lean());
  } catch (err) {
    res.status(500).json({ message: 'Could not load updates.' });
  }
});

module.exports = router;
