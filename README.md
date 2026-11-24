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
├── login.html              Portal sign-in (Student / Admin tabs)          — title "Login - KDU Events"
├── signup.html             Create a student account                       — title "Sign Up - KDU Events"
├── student-portal.html     The student portal (after signing in)          — title "KDU Events Portal"
├── admin-portal.html       The admin portal (after signing in)            — title "KDU Events Portal"
├── portal.html             Old address: forwards to login / the portal
├── venue.html              "Book a venue" form → emailed to admin@kduevents.co.kr
├── host-event.html         "Host an event" form → emailed to admin@kduevents.co.kr
│
├── css/                    One stylesheet per page
│   ├── style.css             → index.html
│   ├── portal.css            → login, signup, student-portal, admin-portal
│   ├── venue.css             → venue.html
│   └── host-event.css        → host-event.html
│
├── js/                     Website JavaScript (runs in the browser)
│   ├── config.js             Server address (loaded first on every page)
│   ├── home.js               Homepage: video slider, live events, filters, newsletter, menu
│   ├── requests.js           Sends the Host-an-event / Book-a-venue forms to the server
│   └── portal/               The portal, split by feature (each page loads only what it needs):
│       ├── core.js             1. settings, shared state, apiFetch(), helpers
│       ├── auth.js             2. sign in / sign up / login session
│       ├── navigation.js       3. sidebar, tabs, card buttons
│       ├── student.js          4. student portal + EVENT REGISTRATION FORM + QR pass (student-portal.html)
│       └── admin.js            5. admin portal + PARTICIPANT LIST + banner upload (admin-portal.html)
│
├── server.js               SERVER START FILE — wires everything below together
├── lib/                    Server building blocks
│   ├── config.js             settings and secrets from .env
│   ├── db.js                 MongoDB connection + the 3 starter events
│   ├── security.js           password hashing, login tokens, login limits
│   ├── auth.js               requireAuth / requireAdmin (who may use a route)
│   ├── helpers.js            activity log, seat counts, input cleaning
│   ├── mailer.js             sends emails through Gmail
│   └── emails/               welcome-email.js (newsletter) · request-email.js (host/venue requests)
├── routes/                 The API — one file per area
│   ├── events.js             GET /api/events · POST/DELETE /api/events/:id/register
│   ├── auth.js               /api/auth/register · /api/auth/login · /api/auth/me · /api/auth/logout
│   ├── student.js            /api/me/state (saved events) · /api/announcements
│   ├── admin.js              /api/admin/…  (dashboard, events, participant list, uploads, updates)
│   ├── images.js             /api/images/:id (shows uploaded banners)
│   ├── newsletter.js         /api/subscribe (saves the email + sends the welcome email)
│   └── requests.js           /api/requests/host-event · /api/requests/venue-booking (emails the admin)
├── models/                 What each database record looks like
│   ├── event.js · user.js · registration.js · activity.js · request.js
│   └── announcement.js · image.js · setting.js · subscriber.js · revoked-token.js
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
| **Event details** pop-up | `js/portal/student.js` → section 2 · HTML: `#eventDetailModal` in student-portal.html | — |
| **Registration form** | `js/portal/student.js` → section 3 · HTML: `#registerFormModal` in student-portal.html | `routes/events.js` → `POST /api/events/:id/register` |
| **Participant list** + CSV | `js/portal/admin.js` → section 5 · HTML: `#attendeesModal` in admin-portal.html | `routes/admin.js` → `GET /api/admin/events/:id/attendees` |
| Sign in / sign up | `login.html` · `signup.html` · `js/portal/auth.js` | `routes/auth.js` |
| Admin-only account | — | `.env` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`) → `lib/config.js`, `routes/auth.js` |
| Create / delete events | `js/portal/admin.js` → section 3 | `routes/admin.js` |
| Banner upload | `js/portal/admin.js` → section 4 | `routes/admin.js` (upload) · `routes/images.js` (show) |
| QR event pass | `js/portal/student.js` → section 4 | — |
| Updates to students | `js/portal/admin.js` → section 6 · `student.js` → section 5 | `routes/admin.js` · `routes/student.js` |
| Activity log | `js/portal/admin.js` → section 2 | `lib/helpers.js` → `logActivity()` |
| Seat limits (no overbooking) | — | `routes/events.js` (registration) · `lib/helpers.js` → `registrationCounts()` |
| Newsletter + welcome email | `js/home.js` → section 4 | `routes/newsletter.js` · `lib/emails/welcome-email.js` |
| Host an event / Book a venue → email to admin | `js/requests.js` | `routes/requests.js` · `lib/emails/request-email.js` |
| Homepage video slider | `js/home.js` → section 1 | — |
| Featured event pop-up (arrow on the banner → details + Register) | `js/home.js` → section 7 · HTML: `#featured-modal-overlay` in index.html | — |
| Phone / tablet layouts | the `@media` sections at the end of each CSS file | — |

Every code file starts with a short header explaining what it does, and long files are split into **numbered sections** (`// 1. …`, `/* 1. … */`) that match the list at the top of the file.

---

## 4. Running it on your computer (no live site needed)

The whole project, website and server, can run on one computer from VS Code. Nothing has to be online except the database (MongoDB Atlas). When the pages are opened from your own computer, `js/config.js` automatically sends every request to the local server at `http://localhost:5050` instead of Render.

**You need:**
- [VS Code](https://code.visualstudio.com/)
- [Node.js](https://nodejs.org/) (the LTS version; it includes `npm`)
- The **Live Server** extension in VS Code (Extensions panel → search "Live Server" → Install)
- An internet connection (for the MongoDB Atlas database)

**Steps:**
1. Open the project folder in VS Code (**File → Open Folder…**).
2. Check that the hidden **`.env`** file is in the folder (it isn't on GitHub, so it comes with the zipped project). Without it the server starts on the wrong port and can't reach the database.
3. Open a terminal (**Terminal → New Terminal**) and install the server's packages (only needed once):
   ```
   npm install
   ```
4. Start the server:
   ```
   npm start
   ```
   You should see `KDU Events Server running on port 5050` and `MongoDB Database Connected Successfully`. **Leave this terminal open**, because closing it stops the server.
5. In the file list, right-click **`index.html` → Open with Live Server**. The site opens at `http://127.0.0.1:5500` and uses the local server.
6. Student portal: create an account on the Sign Up page. Admin portal: sign in on the Admin tab of the login page using `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`.

To stop the server, click in the terminal and press **Ctrl + C**.

**If something doesn't work:**
| Problem | Fix |
|---|---|
| "Can't reach server" on the website | The server isn't running, or it isn't on port 5050. Run `npm start` and check that `.env` has `PORT=5050`. |
| MongoDB connection error in the terminal | Check the internet connection. In MongoDB Atlas → **Network Access**, this computer's IP (or `0.0.0.0/0`) must be allowed. |
| `npm` is not recognised | Node.js isn't installed. Install it, then close and reopen VS Code. |
| Port 5050 already in use | Another copy of the server is running. Close the other terminal, or press Ctrl + C in it. |
| Emails aren't sent | Only email needs the Gmail details (`EMAIL_USER` / `EMAIL_PASS`) in `.env`. Everything else works without them. |

The `.env` file must contain: `PORT`, `MONGO_URI`, `EMAIL_USER`, `EMAIL_PASS`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SESSION_SECRET`. Optional: `REQUESTS_EMAIL` (inbox for host/venue requests, default admin@kduevents.co.kr), `SITE_URL` (website address used in "reset password" email links, default https://kduevents.co.kr; links from the live site or a local Live Server copy open where the student came from). On Render also set `BREVO_API_KEY` and `MAIL_FROM` (a sender verified in Brevo): Render's free plan blocks Gmail's SMTP ports, so emails go through Brevo's web API whenever `BREVO_API_KEY` is set; without it the server falls back to Gmail.

## 5. Publishing changes

```
git add -A
git commit -m "Describe your change"
git push
```

- **GitHub Pages** updates the website in 1–2 minutes.
- **Render** re-deploys the server automatically (2–3 minutes).
- If you change a value in `.env`, change it in Render → Environment as well (Render doesn't read your `.env` file).
