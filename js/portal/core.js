// =============================================================================
// js/portal/core.js — PORTAL BASICS (loaded first)
// -----------------------------------------------------------------------------
// Everything the other portal files share:
//   • settings: server address, tab names, starter events
//   • shared state: who is signed in, the events list, saved/registered events
//   • apiFetch(): talk to the server with the login token
//   • small helpers: escapeHtml, showToast, formatDateTime, timeAgo…
//   • page start-up: sign-in pages vs. portal pages
//
// The portal is split into 4 pages (each sets <body data-page="…">):
//   login.html           data-page="login"    core.js → auth.js
//   signup.html          data-page="signup"   core.js → auth.js
//   student-portal.html  data-page="student"  core.js → auth.js → navigation.js → student.js
//   admin-portal.html    data-page="admin"    core.js → auth.js → navigation.js → admin.js
// (portal.html only forwards old links to the right page)
// =============================================================================

// Which page is this? ('login' | 'signup' | 'student' | 'admin')
const PAGE = (document.body && document.body.dataset.page) || 'login';
const IS_AUTH_PAGE = PAGE === 'login' || PAGE === 'signup';

// The 4 portal pages
const PAGES = {
  login: 'login.html',
  signup: 'signup.html',
  student: 'student-portal.html',
  admin: 'admin-portal.html'
};

// =============================================================================
// 1. SETTINGS, SHARED STATE AND SERVER CALLS
// =============================================================================
// Backend URL comes from config.js (localhost in development, hosted URL in production)
const API_BASE = window.KDU_API_BASE || 'http://localhost:5050/api';

// Shown when the backend can't be reached (e.g. on GitHub Pages before the server is hosted)
const DEFAULT_EVENTS = [
  { _id: "1", title: "Future Forward: Tech & Innovation Summit", category: "Technology", date: "Dec 12, 2026, 10:00 AM", venue: "Innovation Hall", dept: "Faculty of Computing", seats: 42, description: "Showcase of AI and student tech projects.", image: "assets/WhatsApp Image 2026-10-12 at 11.01.35.jpeg" },
  { _id: "2", title: "Cultural Day", category: "Arts & Culture", date: "Dec 18, 2026, 5:30 PM", venue: "The Atrium", dept: "Faculty of Arts", seats: 18, description: "Student art and music showcase.", image: "assets/WhatsApp Image 2026-10-12 at 11.01.37.jpeg" },
  { _id: "3", title: "Campus Founders Meetup", category: "Entrepreneurship", date: "Jan 8, 2027, 5:30 PM", venue: "Student Commons", dept: "School of Business", seats: 27, description: "Startup founders networking session.", image: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=800&q=80" }
];

// Tab id -> title shown in the top bar. Each tab is a <section id="tab-…"> in student-portal.html / admin-portal.html
const STUDENT_TABS = {
  overview: 'Overview', discover: 'Discover events', myevents: 'My events',
  passes: 'Event passes', saved: 'Saved', notifications: 'Notifications'
};
const ADMIN_TABS = {
  'admin-overview': 'Admin dashboard', 'admin-events': 'Manage events', 'admin-students': 'Students',
  'admin-activity': 'Activity log', 'admin-updates': 'Send updates'
};
const TAB_LABELS = { ...STUDENT_TABS, ...ADMIN_TABS };

// ---- Shared state (used by every portal file) ----
let announcements = [];   // updates from the admin (student Notifications tab)
let adminData = { summary: null, events: [], students: [], activity: [], updates: [] };  // admin tabs data

// Calls the backend with the signed-in user's session token
async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${getToken()}` };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && activeUser) {
    alert(data.message || "Your session has expired. Please sign in again.");
    handleSignOut();
  }
  return { ok: res.ok, status: res.status, data };
}

const isAdmin = () => Boolean(activeUser && activeUser.role === 'admin');

// Uploaded banners are stored on our server as "/api/images/<id>"; links are used as-is
const SERVER_ORIGIN = API_BASE.replace(/\/api\/?$/, '');
function imageUrl(src) {
  if (!src) return '';
  return String(src).startsWith('/api/images/') ? SERVER_ORIGIN + src : src;
}

let eventsData = DEFAULT_EVENTS.slice();     // every event (loaded from the server)
let activeUser = null;                        // who is signed in: { name, email, role, studentId, dept, phone }
let selectedRole = 'student';                 // login.html tab: 'student' or 'admin'
let activeSelectedEventId = null;             // event open in the details pop-up
let userState = { registered: [], saved: [] };  // the student's registered + saved event ids

// ---- Page start-up ----
// Sign-in / sign-up pages: show the form (or skip it if already signed in).
// Portal pages: check the login, then load events and open the portal.
document.addEventListener("DOMContentLoaded", () => {
  refreshIcons();
  if (IS_AUTH_PAGE) {
    initAuthPage();
    // The form already calls handleAuthAction via its onsubmit attribute,
    // so no extra submit listener is added here (that caused double submissions).
    return;
  }
  fetchEvents();
  restoreSession();
});

function refreshIcons() {
  if (window.lucide) lucide.createIcons();
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const eventId = (evt) => String(evt._id || evt.id);
const findEvent = (id) => eventsData.find(e => eventId(e) === String(id));

// =============================================================================
// 2. LOADING EVENTS FROM THE SERVER
// =============================================================================
// FETCH EVENTS FROM BACKEND API (falls back to DEFAULT_EVENTS)
async function fetchEvents() {
  try {
    const res = await fetch(`${API_BASE}/events`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) eventsData = data;
    }
  } catch (err) {
    console.log("Backend unreachable - using local default events data.");
  }
  // Student page only (the admin page draws its own lists in admin.js)
  if (PAGE !== 'student') return;
  renderDiscoverGrid(eventsData);
  if (activeUser) renderUserLists();
  openPendingEvent();
}

// Links like login.html?event=<id> (from the homepage) open that event once signed in
let pendingEventId = new URLSearchParams(window.location.search).get('event');
function eventQuery() {
  return pendingEventId ? `?event=${encodeURIComponent(pendingEventId)}` : '';
}
function openPendingEvent() {
  if (PAGE !== 'student' || !pendingEventId || !activeUser || isAdmin() || !findEvent(pendingEventId)) return;
  const id = pendingEventId;
  pendingEventId = null;
  navigateTo('discover');
  openEventDetailModal(id);
}

// =============================================================================
// 3. SMALL HELPERS (pop-up messages, dates, empty lists)
// =============================================================================
let toastTimer = null;
function showToast(message, isError) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("toast-error", Boolean(isError));
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3200);
}

function formatDateTime(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function timeAgo(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDateTime(d);
}

function emptyState(text) {
  return `<p class="empty-text">${escapeHtml(text)}</p>`;
}
