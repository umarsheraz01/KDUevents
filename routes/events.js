// =============================================================================
// routes/events.js — EVENT LISTING AND THE EVENT REGISTRATION FORM
// -----------------------------------------------------------------------------
// GET    /api/events                  list every event with "registeredCount" (public)
// POST   /api/events/:id/register     submit the registration form (signed-in students)
// DELETE /api/events/:id/register     cancel a registration (signed-in students)
// =============================================================================
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const { dbOnline, STARTER_EVENTS } = require('../lib/db');
const { requireAuth, publicUser } = require('../lib/auth');
const { PHONE_RE, cleanText, logActivity, registrationCounts, eventsWithCounts } = require('../lib/helpers');
const Event = require('../models/event');
const Registration = require('../models/registration');

// ---- 1. Event listing ---------------------------------------------------------
// Used by the homepage ("Upcoming events") and the portal ("Discover events").
router.get('/', async (req, res) => {
  try {
    if (dbOnline()) return res.json(await eventsWithCounts());
  } catch (e) {
    console.error('Events error:', e.message);
  }
  // Database unreachable: show the starter events so the page is never empty
  res.json(STARTER_EVENTS.map((e, i) => ({ ...e, _id: String(i + 1), registeredCount: 0 })));
});

// ---- 2. Registration form (submit) --------------------------------------------
router.post('/:id/register', requireAuth, async (req, res) => {
  if (req.user.role === 'admin') return res.status(403).json({ message: 'The admin account cannot register for events.' });
  try {
    const user = req.user;
    const id = String(req.params.id);
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ message: 'Event not found.' });
    const evt = await Event.findById(id).lean();
    if (!evt) return res.status(404).json({ message: 'Event not found.' });

    // Read and check the form fields
    const name = cleanText(req.body.name, 100) || user.name;
    const studentId = cleanText(req.body.studentId, 50);
    const dept = cleanText(req.body.dept, 100);
    const phone = cleanText(req.body.phone, 25);
    const note = cleanText(req.body.note, 300);

    if (!name) return res.status(400).json({ message: 'Please enter your full name.' });
    if (!studentId) return res.status(400).json({ message: 'Please enter your student ID.' });
    if (!dept) return res.status(400).json({ message: 'Please choose your department.' });
    if (!PHONE_RE.test(phone)) return res.status(400).json({ message: 'Please enter a valid phone number.' });
    if (req.body.agree !== true) return res.status(400).json({ message: 'Please confirm that you will attend.' });

    // No double registrations
    if ((user.registered || []).includes(id) || await Registration.exists({ eventId: id, user: user._id })) {
      return res.status(409).json({ message: 'You are already registered for this event.' });
    }

    // Seat limit (checked on the server, so the event can never be overbooked)
    const counts = await registrationCounts();
    if ((counts[id] || 0) >= (Number(evt.seats) || 0)) {
      return res.status(409).json({ message: `Sorry, "${evt.title}" is fully booked.` });
    }

    // Save the form + add the event to the student's list
    await Registration.create({ eventId: id, user: user._id, name, email: user.email, studentId, dept, phone, note });
    user.registered = [...new Set([...(user.registered || []), id])];
    // Remember details so the form is pre-filled next time
    if (!user.studentId) user.studentId = studentId;
    if (!user.dept) user.dept = dept;
    user.phone = phone;
    await user.save();

    logActivity('register', user, `${name} registered for "${evt.title}"`, id);
    res.status(201).json({ message: 'Registered', registered: user.registered, saved: user.saved || [], user: publicUser(user) });
  } catch (err) {
    if (err && err.code === 11000) return res.status(409).json({ message: 'You are already registered for this event.' });
    console.error('Register for event error:', err.message);
    res.status(500).json({ message: 'Could not complete your registration. Please try again.' });
  }
});

// ---- 3. Cancel a registration -------------------------------------------------
router.delete('/:id/register', requireAuth, async (req, res) => {
  if (req.user.role === 'admin') return res.status(403).json({ message: 'Admin access only.' });
  try {
    const user = req.user;
    const id = String(req.params.id);
    const had = (user.registered || []).includes(id);
    await Registration.deleteOne({ eventId: id, user: user._id });
    user.registered = (user.registered || []).filter(r => r !== id);
    await user.save();
    if (had) {
      const evt = mongoose.isValidObjectId(id) ? await Event.findById(id).lean() : null;
      logActivity('cancel', user, `${user.name || user.email} cancelled their registration for "${evt ? evt.title : 'an event'}"`, id);
    }
    res.json({ message: 'Registration cancelled', registered: user.registered, saved: user.saved || [] });
  } catch (err) {
    console.error('Cancel registration error:', err.message);
    res.status(500).json({ message: 'Could not cancel your registration.' });
  }
});

module.exports = router;
