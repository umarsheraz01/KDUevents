// =============================================================================
// routes/admin.js — EVERYTHING ONLY THE ADMIN CAN DO
// -----------------------------------------------------------------------------
// Every route in this file is protected by requireAdmin (the "router.use"
// line below), so students and visitors get "Admin access only".
//
// GET    /api/admin/summary                 dashboard numbers + recent activity
// GET    /api/admin/students                list of student accounts
// GET    /api/admin/activity                activity log
// POST   /api/admin/events                  create an event
// DELETE /api/admin/events/:id              delete an event (+ its registrations and banner)
// PUT    /api/admin/events/:id              edit an event (date, details, poster…)
// GET    /api/admin/events/:id/attendees    PARTICIPANT LIST for one event
// POST   /api/admin/images                  upload an event banner
// POST   /api/admin/announcements           send an update to all students
// DELETE /api/admin/announcements/:id       remove an update
// =============================================================================
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const { DEFAULT_IMAGE } = require('../lib/db');
const { requireAdmin } = require('../lib/auth');
const { cleanText, logActivity, registrationCounts } = require('../lib/helpers');
const Event = require('../models/event');
const User = require('../models/user');
const Registration = require('../models/registration');
const Activity = require('../models/activity');
const Announcement = require('../models/announcement');
const Image = require('../models/image');

// Banner uploads are bigger than normal requests, so they get their own size limit
const imageJson = express.json({ limit: '4mb' });
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;

// Only the admin may use any route below
router.use(requireAdmin);

// =============================================================================
// DASHBOARD, STUDENTS, ACTIVITY LOG
// =============================================================================
router.get('/summary', async (req, res) => {
  try {
    const [students, eventIds, announcements, recent, counts] = await Promise.all([
      User.countDocuments({ role: { $ne: 'admin' } }),
      Event.find().distinct('_id'),
      Announcement.countDocuments(),
      Activity.find().sort({ createdAt: -1 }).limit(8).lean(),
      registrationCounts()
    ]);
    // Only count registrations for events that still exist
    const registrations = eventIds.reduce((sum, id) => sum + (counts[String(id)] || 0), 0);
    res.json({ students, events: eventIds.length, registrations, announcements, recent });
  } catch (err) {
    console.error('Summary error:', err.message);
    res.status(500).json({ message: 'Could not load the dashboard.' });
  }
});

router.get('/students', async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: 'admin' } }).sort({ createdAt: -1 }).lean();
    res.json(users.map(u => ({
      _id: String(u._id), name: u.name, email: u.email, studentId: u.studentId, dept: u.dept,
      registeredCount: (u.registered || []).length, savedCount: (u.saved || []).length,
      createdAt: u.createdAt, lastLoginAt: u.lastLoginAt
    })));
  } catch (err) {
    res.status(500).json({ message: 'Could not load students.' });
  }
});

router.get('/activity', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 300);
    res.json(await Activity.find().sort({ createdAt: -1 }).limit(limit).lean());
  } catch (err) {
    res.status(500).json({ message: 'Could not load activity.' });
  }
});

// =============================================================================
// EVENTS: CREATE, EDIT, DELETE, PARTICIPANT LIST
// =============================================================================
// Reads and checks the event form. Returns { error } or { fields }.
// When editing, an empty image means "keep the current poster".
function readEventFields(body, editing) {
  const title = cleanText(body.title, 150);
  // One or more categories separated by commas, e.g. "Technology, Academic"
  const category = cleanText(body.category, 200).split(',').map(c => c.trim()).filter(Boolean).join(', ');
  const venue = cleanText(body.venue, 120);
  const dept = cleanText(body.dept, 120);
  const description = cleanText(body.description, 2000);
  const seats = Math.floor(Number(body.seats));
  const startsAt = new Date(body.startsAt);
  // End time is optional; when given it must be after the start
  const endsAt = body.endsAt ? new Date(body.endsAt) : null;
  let image = cleanText(body.image, 1000);

  if (!title) return { error: 'Please enter an event title.' };
  if (!category) return { error: 'Please choose a category.' };
  if (isNaN(startsAt.getTime())) return { error: 'Please choose a valid date and time.' };
  if (endsAt && (isNaN(endsAt.getTime()) || endsAt <= startsAt)) return { error: 'The end time must be later than the start time.' };
  if (!venue) return { error: 'Please enter a venue.' };
  if (!dept) return { error: 'Please enter the department or organizer.' };
  if (!Number.isFinite(seats) || seats < 1 || seats > 100000) return { error: 'Seats must be a number between 1 and 100000.' };
  if (!description) return { error: 'Please enter a description.' };
  // Banner: an uploaded image ("/api/images/<id>") or a web link
  const uploaded = /^\/api\/images\/[a-f0-9]{24}$/.test(image);
  if (image && !uploaded && !/^https?:\/\//i.test(image)) return { error: 'Image must be an uploaded picture or a web address starting with http:// or https://' };
  if (!image && !editing) image = DEFAULT_IMAGE;

  const date = cleanText(body.date, 60) || startsAt.toUTCString();
  const fields = { title, category, date, startsAt, endsAt, venue, dept, seats, description };
  if (image) fields.image = image;
  return { fields };
}

// Removes an uploaded banner from the database (web links are left alone)
async function deleteUploadedImage(src) {
  const match = /^\/api\/images\/([a-f0-9]{24})$/.exec(src || '');
  if (match) await Image.findByIdAndDelete(match[1]).catch(() => {});
}

router.post('/events', async (req, res) => {
  try {
    const { error, fields } = readEventFields(req.body, false);
    if (error) return res.status(400).json({ message: error });
    const evt = await Event.create({ ...fields, endsAt: fields.endsAt || undefined });
    logActivity('event_created', req.user, `Admin created the event "${fields.title}"`, evt._id);
    res.status(201).json({ ...evt.toObject(), _id: String(evt._id), registeredCount: 0 });
  } catch (err) {
    console.error('Create event error:', err.message);
    res.status(500).json({ message: 'Could not create the event.' });
  }
});

// EDIT AN EVENT: same fields as creating one
router.put('/events/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Event not found.' });
    const { error, fields } = readEventFields(req.body, true);
    if (error) return res.status(400).json({ message: error });

    const evt = await Event.findById(req.params.id);
    if (!evt) return res.status(404).json({ message: 'Event not found.' });
    // Seats can't go below the number of students already registered
    const registered = await User.countDocuments({ registered: String(evt._id) });
    if (fields.seats < registered) return res.status(400).json({ message: `${registered} students are already registered, so seats can't be lower than ${registered}.` });

    const oldImage = evt.image;
    const { endsAt, ...rest } = fields;
    evt.set(rest);
    evt.endsAt = endsAt || undefined;
    await evt.save();
    if (fields.image && fields.image !== oldImage) await deleteUploadedImage(oldImage);

    logActivity('event_updated', req.user, `Admin edited the event "${evt.title}"`, evt._id);
    res.json({ ...evt.toObject(), _id: String(evt._id), registeredCount: registered });
  } catch (err) {
    console.error('Edit event error:', err.message);
    res.status(500).json({ message: 'Could not save the event.' });
  }
});

router.delete('/events/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Event not found.' });
    const evt = await Event.findByIdAndDelete(req.params.id);
    if (!evt) return res.status(404).json({ message: 'Event not found.' });
    const id = String(evt._id);
    // Clean up everything that pointed to this event
    await User.updateMany({}, { $pull: { registered: id, saved: id } });
    await Registration.deleteMany({ eventId: id });
    await deleteUploadedImage(evt.image);
    logActivity('event_deleted', req.user, `Admin deleted the event "${evt.title}"`, id);
    res.json({ message: 'Event deleted' });
  } catch (err) {
    console.error('Delete event error:', err.message);
    res.status(500).json({ message: 'Could not delete the event.' });
  }
});

// PARTICIPANT LIST: registration form details for every student registered for the event
router.get('/events/:id/attendees', async (req, res) => {
  try {
    const id = String(req.params.id);
    const [regs, users] = await Promise.all([
      Registration.find({ eventId: id }).sort({ createdAt: 1 }).lean(),
      User.find({ registered: id }).lean()
    ]);
    const list = regs.map(r => ({ name: r.name, email: r.email, studentId: r.studentId, dept: r.dept, phone: r.phone, note: r.note, registeredAt: r.createdAt }));
    // Older registrations made before the registration form existed
    const withForm = new Set(regs.map(r => String(r.user)));
    users.filter(u => !withForm.has(String(u._id))).forEach(u => list.push({
      name: u.name, email: u.email, studentId: u.studentId, dept: u.dept, phone: u.phone || '', note: '', registeredAt: null
    }));
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: 'Could not load attendees.' });
  }
});

// =============================================================================
// BANNER UPLOAD   Body: { image: "data:image/jpeg;base64,..." }
// (the uploaded file is then served by routes/images.js)
// =============================================================================
router.post('/images', imageJson, async (req, res) => {
  try {
    const match = /^data:([a-z/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body.image || ''));
    if (!match) return res.status(400).json({ message: 'Please choose an image file.' });
    const contentType = match[1].toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.includes(contentType)) return res.status(400).json({ message: 'Only JPG, PNG, WebP or GIF images are allowed.' });
    const data = Buffer.from(match[2], 'base64');
    if (!data.length) return res.status(400).json({ message: 'The image file is empty.' });
    if (data.length > MAX_IMAGE_BYTES) return res.status(413).json({ message: 'The image is too large. Please use one under 2.5 MB.' });

    const img = await Image.create({ data, contentType, size: data.length });
    res.status(201).json({ url: `/api/images/${img._id}` });
  } catch (err) {
    console.error('Image upload error:', err.message);
    res.status(500).json({ message: 'Could not upload the image.' });
  }
});

// =============================================================================
// UPDATES FOR STUDENTS (announcements)
// =============================================================================
router.post('/announcements', async (req, res) => {
  try {
    const title = cleanText(req.body.title, 150);
    const message = cleanText(req.body.message, 2000);
    if (!title || !message) return res.status(400).json({ message: 'Please enter a title and a message.' });
    const a = await Announcement.create({ title, message });
    logActivity('update_posted', req.user, `Admin sent the update "${title}" to all students`);
    res.status(201).json(a);
  } catch (err) {
    res.status(500).json({ message: 'Could not send the update.' });
  }
});

router.delete('/announcements/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Update not found.' });
    const a = await Announcement.findByIdAndDelete(req.params.id);
    if (!a) return res.status(404).json({ message: 'Update not found.' });
    logActivity('update_deleted', req.user, `Admin removed the update "${a.title}"`);
    res.json({ message: 'Update removed' });
  } catch (err) {
    res.status(500).json({ message: 'Could not remove the update.' });
  }
});

module.exports = router;
