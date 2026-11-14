# KDU Events — Project Guide

A web system for campus events at Kyungdong University: a public website, a **student portal** and an **admin portal**, backed by a Node.js server and a MongoDB database.

- **Live website:** https://kduevents.co.kr (GitHub Pages)
- **Live server (API):** https://kduevents.onrender.com (Render)
- **Database:** MongoDB Atlas

---

## 1. How the pieces fit together

```
 Browser (phone / laptop)
        │  opens the pages
        ▼
 Website  — HTML, CSS, JavaScript  (this folder, published by GitHub Pages)
        │  asks for data:  fetch("https://kduevents.onrender.com/api/...")
        ▼
 Server   — server.js + lib/ + routes/ + models/   (Node.js + Express, on Render)
        │  reads and writes
        ▼
 Database — MongoDB Atlas  (events, students, registrations, activity, …)
```

`js/config.js` decides which server the website talks to: your own computer (`http://localhost:5050`) when you open the files locally, or Render on the live site.

---

## 2. Folder map

```
Event Management/
│
├── index.html              Homepage
├── portal.html             Student portal + admin portal (one page, two modes)
├── featured-event.html     Full page for the featured event
├── venue.html              "Book a venue" form (not connected to the server yet)
├── host-event.html         "Host an event" form (not connected to the server yet)
│
├── css/                    One stylesheet per page
│   ├── style.css             → index.html
│   ├── portal.css            → portal.html
│   ├── featured-event.css    → featured-event.html (plus Tailwind classes in the HTML)
│   ├── venue.css             → venue.html
│   └── host-event.css        → host-event.html
│
├── js/                     Website JavaScript (runs in the browser)
│   ├── config.js             Server address (loaded first on every page)
│   ├── home.js               Homepage: video slider, live events, filters, newsletter, menu
│   ├── featured-event.js     Featured event page: menu, schedule, share, newsletter
│   └── portal/               The portal, split by feature (loaded in this order):
│       ├── core.js             1. settings, shared state, apiFetch(), helpers
│       ├── auth.js             2. sign in / sign up / login session
│       ├── navigation.js       3. sidebar, tabs, card buttons
│       ├── student.js          4. student portal + EVENT REGISTRATION FORM + QR pass
│       └── admin.js            5. admin portal + PARTICIPANT LIST + banner upload
│
├── server.js               SERVER START FILE — wires everything below together
├── lib/                    Server building blocks
│   ├── config.js             settings and secrets from .env
│   ├── db.js                 MongoDB connection + the 3 starter events
│   ├── security.js           password hashing, login tokens, login limits
│   ├── auth.js               requireAuth / requireAdmin (who may use a route)
│   ├── helpers.js            activity log, seat counts, input cleaning
│   └── emails/welcome-email.js   design of the newsletter welcome email
├── routes/                 The API — one file per area
│   ├── events.js             GET /api/events · POST/DELETE /api/events/:id/register
│   ├── auth.js               /api/auth/register · /api/auth/login · /api/auth/me
│   ├── student.js            /api/me/state (saved events) · /api/announcements
│   ├── admin.js              /api/admin/…  (dashboard, events, participant list, uploads, updates)
│   ├── images.js             /api/images/:id (shows uploaded banners)
│   └── newsletter.js         /api/subscribe (saves the email + sends the welcome email)
├── models/                 What each database record looks like
│   ├── event.js · user.js · registration.js · activity.js
│   └── announcement.js · image.js · setting.js · subscriber.js
│
├── assets/                 Photos, videos and video poster images
├── logo.svg · kdu-login.jpg
├── .env                    SECRETS (database, Gmail, admin password) — never uploaded to GitHub
├── package.json            Server dependencies + "npm start"
└── scripts/deploy-portal.sh   (optional) publish the portal to a subdomain — not used now
```

---

## 3. "Where is the code for…?"

| Feature | Website (browser) | Server |
|---|---|---|
| **Event listing** on the homepage | `js/home.js` → section 3 | `routes/events.js` → `GET /api/events` |
| **Event listing** in the portal (Discover) | `js/portal/student.js` → section 1 | same |
| **Event details** pop-up | `js/portal/student.js` → section 2 · HTML: `#eventDetailModal` in portal.html | — |
| **Registration form** | `js/portal/student.js` → section 3 · HTML: `#registerFormModal` | `routes/events.js` → `POST /api/events/:id/register` |
| **Participant list** + CSV | `js/portal/admin.js` → section 5 · HTML: `#attendeesModal` | `routes/admin.js` → `GET /api/admin/events/:id/attendees` |
| Sign in / sign up | `js/portal/auth.js` | `routes/auth.js` |
| Admin-only account | — | `.env` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`) → `lib/config.js`, `routes/auth.js` |
| Create / delete events | `js/portal/admin.js` → section 3 | `routes/admin.js` |
| Banner upload | `js/portal/admin.js` → section 4 | `routes/admin.js` (upload) · `routes/images.js` (show) |
| QR event pass | `js/portal/student.js` → section 4 | — |
| Updates to students | `js/portal/admin.js` → section 6 · `student.js` → section 5 | `routes/admin.js` · `routes/student.js` |
| Activity log | `js/portal/admin.js` → section 2 | `lib/helpers.js` → `logActivity()` |
| Seat limits (no overbooking) | — | `routes/events.js` (registration) · `lib/helpers.js` → `registrationCounts()` |
| Newsletter + welcome email | `js/home.js` → section 4 | `routes/newsletter.js` · `lib/emails/welcome-email.js` |
| Homepage video slider | `js/home.js` → section 1 | — |
| Phone / tablet layouts | the `@media` sections at the end of each CSS file | — |

Every code file starts with a short header explaining what it does, and long files are split into **numbered sections** (`// 1. …`, `/* 1. … */`) that match the list at the top of the file.

---

## 4. Running it on your computer

1. Install the server's packages once: `npm install`
2. Start the server: `npm start` → you'll see `KDU Events Server running on port 5050` and `MongoDB Database Connected Successfully`
3. Open `index.html` with VS Code **Live Server** (or open the file directly). Keep the server terminal open while you use the portal.

The `.env` file must contain: `PORT`, `MONGO_URI`, `EMAIL_USER`, `EMAIL_PASS`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SESSION_SECRET`.

## 5. Publishing changes

```
git add -A
git commit -m "Describe your change"
git push
```

- **GitHub Pages** updates the website in 1–2 minutes.
- **Render** re-deploys the server automatically (2–3 minutes).
- If you change a value in `.env`, change it in Render → Environment as well (Render doesn't read your `.env` file).
