// =============================================================================
// server.js — START HERE (KDU EVENTS BACKEND)
// -----------------------------------------------------------------------------
// This file only wires the pieces together. The real work lives in:
//
//   lib/config.js        settings and secrets from .env
//   lib/db.js            MongoDB connection + starter events
//   lib/security.js      passwords, login tokens, login limits
//   lib/auth.js          requireAuth / requireAdmin route guards
//   lib/helpers.js       small shared tools (activity log, seat counts…)
//   models/              what each kind of database record looks like
//   routes/              the API: one file per area (see the list below)
//
// Run locally with:  npm start   (http://localhost:5050)
// Live on Render at: https://kduevents.onrender.com
// =============================================================================
const express = require('express');
const cors = require('cors');
const { PORT } = require('./lib/config');
const { connectDatabase } = require('./lib/db');

const app = express();

// ---- 1. Read JSON request bodies --------------------------------------------
// Normal requests may be up to 100 KB. Banner uploads (/api/admin/images) set
// their own bigger limit inside routes/admin.js, so they are skipped here.
const smallJson = express.json({ limit: '100kb' });
app.use((req, res, next) => (req.path === '/api/admin/images' ? next() : smallJson(req, res, next)));

// ---- 2. Allow the website (GitHub Pages) to call this server ----------------
app.use(cors());

// ---- 3. Connect to MongoDB ----------------------------------------------------
connectDatabase();

// ---- 4. API routes -----------------------------------------------------------
app.use('/api/events', require('./routes/events'));   // event listing + registration form
app.use('/api/auth', require('./routes/auth'));       // sign up, sign in, restore session
app.use('/api', require('./routes/student'));         // saved events, announcements
app.use('/api/admin', require('./routes/admin'));     // admin portal (dashboard, events, participant list…)
app.use('/api/images', require('./routes/images'));   // uploaded event banners
app.use('/api', require('./routes/newsletter'));      // newsletter sign-up + welcome email

// ---- 5. Friendly errors for bad request bodies -------------------------------
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') return res.status(413).json({ message: 'The upload is too large. Please use a smaller image.' });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid request.' });
  next(err);
});

// ---- 6. Start listening ------------------------------------------------------
app.listen(PORT, () => console.log(`KDU Events Server running on port ${PORT}`));
