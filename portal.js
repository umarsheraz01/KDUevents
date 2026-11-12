// Backend URL comes from config.js (localhost in development, hosted URL in production)
const API_BASE = window.KDU_API_BASE || 'http://localhost:5050/api';

// Shown when the backend can't be reached (e.g. on GitHub Pages before the server is hosted)
const DEFAULT_EVENTS = [
  { _id: "1", title: "Future Forward: Tech & Innovation Summit", category: "Technology", date: "Dec 12, 2026, 10:00 AM", venue: "Innovation Hall", dept: "Faculty of Computing", seats: 42, description: "Showcase of AI and student tech projects.", image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80" },
  { _id: "2", title: "The Creative Exchange", category: "Arts & Culture", date: "Dec 18, 2026, 5:30 PM", venue: "The Atrium", dept: "Faculty of Arts", seats: 18, description: "Student art and music showcase.", image: "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=800&q=80" },
  { _id: "3", title: "Campus Founders Meetup", category: "Entrepreneurship", date: "Jan 8, 2027, 5:30 PM", venue: "Student Commons", dept: "School of Business", seats: 27, description: "Startup founders networking session.", image: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=800&q=80" }
];

const STUDENT_TABS = {
  overview: 'Overview', discover: 'Discover events', myevents: 'My events',
  passes: 'Event passes', saved: 'Saved', notifications: 'Notifications'
};
const ADMIN_TABS = {
  'admin-overview': 'Admin dashboard', 'admin-events': 'Manage events', 'admin-students': 'Students',
  'admin-activity': 'Activity log', 'admin-updates': 'Send updates'
};
const TAB_LABELS = { ...STUDENT_TABS, ...ADMIN_TABS };

let announcements = [];
let adminData = { summary: null, events: [], students: [], activity: [], updates: [] };

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

let eventsData = DEFAULT_EVENTS.slice();
let activeUser = null;
let authMode = 'login'; // 'login' or 'signup'
let selectedRole = 'student'; // 'student' or 'admin'
let activeSelectedEventId = null;
let userState = { registered: [], saved: [] };

document.addEventListener("DOMContentLoaded", () => {
  refreshIcons();
  fetchEvents();
  restoreSession();
  // The form already calls handleAuthAction via its onsubmit attribute,
  // so no extra submit listener is added here (that caused double submissions).
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
  renderDiscoverGrid(eventsData);
  if (activeUser && !isAdmin()) renderUserLists();
}

// SESSION TOKEN (issued by the server after a successful sign-in)
const TOKEN_KEY = 'kdu-portal-token';

function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
}
function setToken(token) {
  try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch (e) {}
}

// Re-open the portal after a page refresh if the saved session is still valid
async function restoreSession() {
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { setToken(null); return; }
    const data = await res.json();
    if (data.user) {
      activeUser = data.user;
      openMainPortal(data.state);
    }
  } catch (e) {
    // Server unreachable: stay on the sign-in screen
    console.error("Could not restore session:", e);
  }
}

// PER-USER STATE (saved + registered events)
// Students: stored in MongoDB on the server. Admin: kept in this browser only.
function stateKey() {
  return activeUser ? `kdu-portal-${activeUser.email}` : null;
}

function loadUserState(serverState) {
  userState = { registered: [], saved: [] };
  if (serverState) {
    userState.registered = Array.isArray(serverState.registered) ? serverState.registered.map(String) : [];
    userState.saved = Array.isArray(serverState.saved) ? serverState.saved.map(String) : [];
    return;
  }
  try {
    const raw = localStorage.getItem(stateKey());
    if (raw) {
      const parsed = JSON.parse(raw);
      userState.registered = Array.isArray(parsed.registered) ? parsed.registered : [];
      userState.saved = Array.isArray(parsed.saved) ? parsed.saved : [];
    }
  } catch (e) {}
}

async function saveUserState() {
  if (!activeUser) return;
  if (activeUser.role === 'admin') {
    try { localStorage.setItem(stateKey(), JSON.stringify(userState)); } catch (e) {}
    return;
  }
  try {
    const { ok, status, data } = await apiFetch('/me/state', { method: 'PUT', body: JSON.stringify(userState) });
    if (ok) {
      userState.registered = (data.registered || []).map(String);
      userState.saved = (data.saved || []).map(String);
    } else if (status === 409) {
      // Event filled up before this registration went through
      alert(data.message || "This event is fully booked.");
      userState.registered = (data.registered || []).map(String);
      userState.saved = (data.saved || []).map(String);
    }
  } catch (e) {
    showToast("Couldn't reach the server - your change was not saved.", true);
  }
  await fetchEvents();
  updateModalButtons();
}

// AUTH MESSAGES
function showAuthError(message) {
  const el = document.getElementById("authError");
  if (!el) return alert(message);
  el.textContent = message;
  el.classList.remove("hidden");
}

function clearAuthError() {
  const el = document.getElementById("authError");
  if (el) el.classList.add("hidden");
}

// AUTHENTICATION ROLE TOGGLE (STUDENT / ADMIN)
function selectAuthRole(role) {
  selectedRole = role;
  clearAuthError();
  const stTab = document.getElementById("authStudentTab");
  const adTab = document.getElementById("authAdminTab");
  const emailLabel = document.getElementById("emailLabel");
  const submitBtn = document.getElementById("authSubmitBtn");

  if (stTab) stTab.classList.toggle("active", role === 'student');
  if (adTab) adTab.classList.toggle("active", role === 'admin');
  if (emailLabel) emailLabel.innerText = role === 'admin' ? "Admin email" : "University email";
  if (submitBtn) submitBtn.innerHTML = `<span>Continue to ${role} portal</span> <i data-lucide="arrow-right"></i>`;
  refreshIcons();
}

// TOGGLE BETWEEN SIGN IN & SIGN UP
function toggleAuthMode() {
  authMode = authMode === 'login' ? 'signup' : 'login';
  const isSignup = authMode === 'signup';
  clearAuthError();

  const titleEl = document.getElementById("authHeaderTitle");
  const subtitleEl = document.getElementById("authHeaderSubtitle");
  const signupFields = document.getElementById("signupFieldsGroup");
  const questionEl = document.getElementById("authToggleQuestion");
  const actionEl = document.getElementById("authToggleAction");
  const roleToggleContainer = document.getElementById("roleToggleContainer");
  const submitBtn = document.getElementById("authSubmitBtn");

  if (titleEl) titleEl.innerText = isSignup ? "Create your account." : "Welcome back.";
  if (subtitleEl) subtitleEl.innerText = isSignup ? "Register as a student to start discovering campus events." : "Choose your portal and sign in with your credentials.";
  if (signupFields) signupFields.classList.toggle("hidden", !isSignup);
  if (questionEl) questionEl.innerText = isSignup ? "Already have an account?" : "New to KDU Events?";
  if (actionEl) actionEl.innerText = isSignup ? "Sign in" : "Create an account";
  if (roleToggleContainer) roleToggleContainer.style.display = isSignup ? "none" : "flex";

  if (isSignup) selectAuthRole('student');
  if (submitBtn) {
    submitBtn.innerHTML = isSignup
      ? `<span>Create student account</span> <i data-lucide="arrow-right"></i>`
      : `<span>Continue to ${selectedRole} portal</span> <i data-lucide="arrow-right"></i>`;
  }
  refreshIcons();
}

// HANDLE LOGIN & REGISTRATION FORM SUBMISSION
async function handleAuthAction(e) {
  if (e) e.preventDefault();
  clearAuthError();

  const email = document.getElementById("authEmailInput").value.trim();
  const password = document.getElementById("authPassInput").value;
  if (!email || !password) return showAuthError("Please enter both email and password.");

  const isSignup = authMode === 'signup';
  const name = document.getElementById("regFullName").value.trim();
  const studentId = document.getElementById("regStudentId").value.trim();
  const dept = document.getElementById("regDept").value;

  if (isSignup && !name) return showAuthError("Please enter your full name.");
  if (isSignup && password.length < 6) return showAuthError("Password must be at least 6 characters.");

  const submitBtn = document.getElementById("authSubmitBtn");
  if (submitBtn) submitBtn.disabled = true;

  const endpoint = isSignup ? `${API_BASE}/auth/register` : `${API_BASE}/auth/login`;
  const body = isSignup
    ? { name, email, password, studentId, dept }
    : { email, password, role: selectedRole };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok && data.user && data.token) {
      activeUser = data.user;
      setToken(data.token);
      openMainPortal(data.state);
    } else {
      // Wrong password, duplicate email, etc. -> do NOT let the user in
      showAuthError(data.message || "Sign in failed. Please check your details.");
    }
  } catch (err) {
    // Server unreachable: never let anyone in without the server checking their details
    showAuthError("Can't reach the KDU Events server right now. Please check your connection and try again.");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function openMainPortal(serverState) {
  document.getElementById("authScreen").classList.add("hidden");
  document.getElementById("mainPortalApp").classList.remove("hidden");
  document.getElementById("authPassInput").value = "";
  loadUserState(serverState);
  document.getElementById("studentNav").classList.toggle("hidden", isAdmin());
  document.getElementById("adminNav").classList.toggle("hidden", !isAdmin());
  updateUserUI();
  if (isAdmin()) {
    navigateTo('admin-overview');
    loadAdminData();
  } else {
    navigateTo('overview');
    loadAnnouncements();
  }
}

function handleSignOut() {
  toggleSidebar(false);
  setToken(null);
  activeUser = null;
  announcements = [];
  adminData = { summary: null, events: [], students: [], activity: [], updates: [] };
  userState = { registered: [], saved: [] };
  const form = document.getElementById("authForm");
  if (form) form.reset();
  document.getElementById("mainPortalApp").classList.add("hidden");
  document.getElementById("authScreen").classList.remove("hidden");
}

function updateUserUI() {
  if (!activeUser) return;
  const nameStr = activeUser.name || activeUser.email.split('@')[0];
  const initials = nameStr.split(/\s+/).filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const adminAccount = isAdmin();

  document.getElementById("userAvatar").innerText = initials;
  document.getElementById("userNameLabel").innerText = nameStr;
  document.getElementById("userAccountTypeLabel").innerText = adminAccount ? 'Admin Account' : 'Student Account';
  document.getElementById("sidebarRoleTag").innerText = adminAccount ? 'Admin Portal' : 'Student Portal';
  if (isAdmin()) return;
  document.getElementById("overviewDeptTag").innerText = activeUser.dept || "Computer Science";
  document.getElementById("overviewWelcomeHeading").innerText = `Welcome back, ${nameStr.split(' ')[0]}.`;
  renderUserLists();
}

// NAVIGATION SYSTEM
// MOBILE SIDEBAR (off-canvas below 1024px)
function toggleSidebar(force) {
  const sidebar = document.getElementById("portalSidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  if (!sidebar) return;
  const open = typeof force === 'boolean' ? force : !sidebar.classList.contains("open");
  sidebar.classList.toggle("open", open);
  if (backdrop) backdrop.classList.toggle("show", open);
  document.body.classList.toggle("no-scroll", open);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') toggleSidebar(false);
});

window.addEventListener('resize', () => {
  if (window.innerWidth >= 1024) toggleSidebar(false);
});

function navigateTo(tabName) {
  toggleSidebar(false);
  // Students can't open admin tabs and the admin doesn't see student tabs
  const allowed = isAdmin() ? ADMIN_TABS : STUDENT_TABS;
  if (!allowed[tabName]) tabName = isAdmin() ? 'admin-overview' : 'overview';

  Object.keys(TAB_LABELS).forEach(tab => {
    const tabEl = document.getElementById(`tab-${tab}`);
    const navEl = document.getElementById(`nav-${tab}`);
    if (tabEl) tabEl.classList.toggle("hidden", tab !== tabName);
    if (navEl) navEl.classList.toggle("active", tab === tabName);
  });

  document.getElementById("headerBreadcrumbTitle").innerText = TAB_LABELS[tabName] || tabName;

  window.scrollTo(0, 0);
  if (isAdmin()) renderAdminAll();
  else if (tabName === 'discover') applyDiscoverFilters();
  else renderUserLists();
  if (tabName === 'notifications') markNotificationsSeen();
  refreshIcons();
}

// EVENT CARD (used by every list)
function eventCardHtml(evt, extraButton) {
  return `
    <div class="stat-card" style="text-align: left;">
      <div style="height: 140px; border-radius: 12px; overflow: hidden; margin-bottom: 12px;">
        <img src="${escapeHtml(evt.image)}" style="width: 100%; height: 100%; object-fit: cover;" alt="${escapeHtml(evt.title)}">
      </div>
      <span class="eyebrow-red">${escapeHtml(evt.category)}</span>
      <h3 style="font-size: 14px; font-weight: 800; margin: 4px 0;">${escapeHtml(evt.title)}</h3>
      <p style="font-size: 11px; color: #64748b; margin-bottom: 12px;">${escapeHtml(evt.date)} • ${escapeHtml(evt.venue)}</p>
      <button type="button" data-action="details" data-id="${escapeHtml(eventId(evt))}" class="btn-primary" style="padding: 8px;">View details</button>
      ${extraButton || ''}
    </div>`;
}

function renderList(containerId, items, emptyText, extraButtonFn) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!items.length) {
    container.className = '';
    container.innerHTML = `<p style="font-size: 13px; color: #64748b; padding: 16px 0;">${escapeHtml(emptyText)}</p>`;
    return;
  }
  container.className = 'events-grid';
  container.innerHTML = items.map(evt => eventCardHtml(evt, extraButtonFn ? extraButtonFn(evt) : '')).join('');
}

// One click handler for all card buttons (no inline onclick with injected strings)
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'delete-event') return handleDeleteEvent(btn.dataset.id);
  if (btn.dataset.action === 'attendees') return openAttendeesModal(btn.dataset.id);
  if (btn.dataset.action === 'delete-update') return handleDeleteUpdate(btn.dataset.id);
  const evt = findEvent(btn.dataset.id);
  if (!evt) return;
  if (btn.dataset.action === 'details') openEventDetailModal(eventId(evt));
  if (btn.dataset.action === 'pass') openQrModal(eventId(evt));
});

// RENDER DISCOVER GRID
function renderDiscoverGrid(items) {
  const countLabel = document.getElementById("eventsFoundLabel");
  if (countLabel) countLabel.innerText = `${items.length} event${items.length === 1 ? '' : 's'} found`;
  renderList("discoverGrid", items, "No events match your search.");
  refreshIcons();
}

function applyDiscoverFilters() {
  const query = document.getElementById("searchInput").value.toLowerCase();
  const cat = document.getElementById("categoryFilter").value;
  const status = document.getElementById("statusFilter").value;

  const filtered = eventsData.filter(evt => {
    const matchesQuery = (evt.title || '').toLowerCase().includes(query) || (evt.venue || '').toLowerCase().includes(query);
    const matchesCat = cat === 'all' || evt.category === cat;
    const matchesStatus = status === 'all' || seatsLeft(evt) > 0;
    return matchesQuery && matchesCat && matchesStatus;
  });

  renderDiscoverGrid(filtered);
}

// SEATS (registeredCount comes from the server and includes every student)
function seatsLeft(evt) {
  return Math.max(0, (Number(evt.seats) || 0) - (Number(evt.registeredCount) || 0));
}

// OVERVIEW / MY EVENTS / PASSES / SAVED
function renderUserLists() {
  const registered = eventsData.filter(e => userState.registered.includes(eventId(e)));
  const saved = eventsData.filter(e => userState.saved.includes(eventId(e)));

  const regCount = document.getElementById("statRegisteredCount");
  const savedCount = document.getElementById("statSavedCount");
  const subText = document.getElementById("overviewSubText");
  if (regCount) regCount.innerText = registered.length;
  if (savedCount) savedCount.innerText = saved.length;
  if (subText) subText.innerText = `You have ${registered.length} upcoming event${registered.length === 1 ? '' : 's'} and ${announcements.length} campus update${announcements.length === 1 ? '' : 's'}.`;

  renderList("overviewUpcomingContainer", registered.slice(0, 3), "You haven't registered for any events yet. Head to Discover to find one.");
  renderList("myUpcomingContainer", registered, "No upcoming registrations.");
  renderList("passesContainer", registered, "Register for an event to get your digital pass.", evt =>
    `<button type="button" data-action="pass" data-id="${escapeHtml(eventId(evt))}" class="btn-red" style="width: 100%; margin-top: 8px; padding: 8px;">Show pass</button>`);
  renderList("savedEventsContainer", saved, "You haven't saved any events yet.");
  refreshIcons();
}

// EVENT DETAIL MODAL
function openEventDetailModal(id) {
  const evt = findEvent(id);
  if (!evt) return;
  activeSelectedEventId = eventId(evt);

  document.getElementById("modalEventTitle").innerText = evt.title;
  document.getElementById("modalEventImg").src = evt.image;
  document.getElementById("modalEventImg").alt = evt.title;
  document.getElementById("modalEventCategory").innerText = evt.category;
  document.getElementById("modalEventDescription").innerText = evt.description || '';
  document.getElementById("modalEventDate").innerText = evt.date;
  document.getElementById("modalEventVenue").innerText = evt.venue;
  document.getElementById("modalEventDept").innerText = evt.dept;

  updateModalButtons();
  document.getElementById("eventDetailModal").classList.remove("hidden");
  refreshIcons();
}

function updateModalButtons() {
  const evt = findEvent(activeSelectedEventId);
  if (!evt) return;
  const isRegistered = userState.registered.includes(activeSelectedEventId);
  const isSaved = userState.saved.includes(activeSelectedEventId);
  const left = seatsLeft(evt);

  document.getElementById("modalEventSeats").innerText = `${left} of ${evt.seats} remaining`;
  document.querySelector("#eventDetailModal .modal-actions").classList.toggle("hidden", isAdmin());

  const regBtn = document.getElementById("modalRegisterBtn");
  regBtn.innerText = isRegistered ? "Cancel registration" : (left > 0 ? "Register now" : "Fully booked");
  regBtn.disabled = !isRegistered && left <= 0;

  const heartBtn = document.getElementById("modalHeartBtn");
  heartBtn.style.color = isSaved ? '#e63946' : '';
  heartBtn.setAttribute('aria-label', isSaved ? 'Remove from saved' : 'Save event');
  heartBtn.setAttribute('aria-pressed', isSaved ? 'true' : 'false');
}

function handleModalRegisterAction() {
  if (!activeUser || !activeSelectedEventId) return;
  const list = userState.registered;
  const evt = findEvent(activeSelectedEventId);
  const idx = list.indexOf(activeSelectedEventId);
  if (idx >= 0) {
    list.splice(idx, 1);
    evt.registeredCount = Math.max(0, (evt.registeredCount || 0) - 1);
    showToast("Registration cancelled.");
  } else if (seatsLeft(evt) > 0) {
    list.push(activeSelectedEventId);
    evt.registeredCount = (evt.registeredCount || 0) + 1;
    showToast("You're registered! Your pass is in Event passes.");
  }
  saveUserState();
  updateModalButtons();
  renderUserLists();
}

function handleModalHeartToggle() {
  if (!activeUser || !activeSelectedEventId) return;
  const list = userState.saved;
  const idx = list.indexOf(activeSelectedEventId);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(activeSelectedEventId);
  saveUserState();
  updateModalButtons();
  renderUserLists();
}

function closeEventDetailModal() {
  document.getElementById("eventDetailModal").classList.add("hidden");
}

// QR PASS MODAL (unique code per user + event)
function openQrModal(id) {
  const evt = findEvent(id);
  if (!evt || !activeUser) return;
  const code = `KDU-PASS|${eventId(evt)}|${activeUser.email}`;

  document.getElementById("qrEventTitle").innerText = evt.title;
  document.getElementById("qrEventDate").innerText = evt.date;
  document.getElementById("qrHolderName").innerText = activeUser.name || activeUser.email;
  document.getElementById("qrHolderId").innerText = activeUser.studentId || '—';
  document.getElementById("qrPassImg").src =
    `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(code)}`;
  document.getElementById("qrModal").classList.remove("hidden");
}

function closeQrModal() {
  document.getElementById("qrModal").classList.add("hidden");
}

// =========================================================================
// SHARED HELPERS
// =========================================================================
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

// =========================================================================
// STUDENT: UPDATES FROM THE ADMIN (Notifications tab + bell)
// =========================================================================
const seenKey = () => `kdu-portal-seen-${activeUser ? activeUser.email : ''}`;

async function loadAnnouncements() {
  try {
    const { ok, data } = await apiFetch('/announcements');
    if (ok && Array.isArray(data)) announcements = data;
  } catch (e) {}
  renderStudentNotifications();
  renderUserLists();
}

function renderStudentNotifications() {
  const list = document.getElementById("studentNotificationsList");
  if (list) {
    list.innerHTML = announcements.map(a => `
      <div class="notification-card">
        <div class="icon-box icon-red"><i data-lucide="megaphone"></i></div>
        <div>
          <h4>${escapeHtml(a.title)}</h4>
          <p>${escapeHtml(a.message)}</p>
          <span class="timestamp">From KDU Events Admin • ${escapeHtml(formatDateTime(a.createdAt))}</span>
        </div>
      </div>`).join('');
  }
  updateBell();
  refreshIcons();
}

function unseenCount() {
  let seen = 0;
  try { seen = Number(localStorage.getItem(seenKey())) || 0; } catch (e) {}
  return announcements.filter(a => new Date(a.createdAt).getTime() > seen).length;
}

function updateBell() {
  const n = isAdmin() ? 0 : unseenCount();
  const badge = document.getElementById("bellBadge");
  const navCount = document.getElementById("navNotifCount");
  [badge, navCount].forEach(el => {
    if (!el) return;
    el.textContent = n > 9 ? '9+' : String(n);
    el.classList.toggle("hidden", n === 0);
  });
}

function markNotificationsSeen() {
  if (!activeUser || isAdmin()) return;
  try { localStorage.setItem(seenKey(), String(Date.now())); } catch (e) {}
  updateBell();
}

function handleBellClick() {
  navigateTo(isAdmin() ? 'admin-activity' : 'notifications');
}

// =========================================================================
// ADMIN PORTAL
// =========================================================================
async function loadAdminData() {
  if (!isAdmin()) return;
  try {
    const [summary, students, activity, updates] = await Promise.all([
      apiFetch('/admin/summary'),
      apiFetch('/admin/students'),
      apiFetch('/admin/activity?limit=200'),
      apiFetch('/announcements'),
      fetchEvents()
    ]);
    if (!isAdmin()) return; // signed out while loading
    if (summary.ok) adminData.summary = summary.data;
    if (students.ok) adminData.students = students.data;
    if (activity.ok) adminData.activity = activity.data;
    if (updates.ok) adminData.updates = updates.data;
    if (!summary.ok) showToast(summary.data.message || "Couldn't load the dashboard.", true);
  } catch (e) {
    showToast("Couldn't reach the server. Please try again.", true);
  }
  renderAdminAll();
}

function renderAdminAll() {
  if (!isAdmin()) return;
  renderAdminOverview();
  renderAdminEvents();
  renderAdminStudents();
  renderAdminActivity();
  renderAdminUpdates();
  refreshIcons();
}

const ACTIVITY_ICONS = {
  signup: 'user-plus', login: 'log-in', admin_login: 'shield-check', register: 'ticket',
  cancel: 'x-circle', save: 'heart', event_created: 'calendar-plus', event_deleted: 'trash-2',
  update_posted: 'megaphone', update_deleted: 'trash-2'
};

function activityItemHtml(a) {
  const icon = ACTIVITY_ICONS[a.type] || 'activity';
  const tone = a.role === 'admin' ? 'tone-admin' : (a.type === 'cancel' ? 'tone-red' : 'tone-blue');
  return `
    <div class="activity-item">
      <div class="activity-icon ${tone}"><i data-lucide="${icon}"></i></div>
      <div class="activity-body">
        <p>${escapeHtml(a.message)}</p>
        <span>${escapeHtml(a.actorEmail || '')}${a.actorEmail ? ' • ' : ''}${escapeHtml(timeAgo(a.createdAt))}</span>
      </div>
    </div>`;
}

function renderAdminOverview() {
  const s = adminData.summary;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  if (s) {
    set("adminStatStudents", s.students);
    set("adminStatEvents", s.events);
    set("adminStatRegistrations", s.registrations);
    set("adminStatUpdates", s.announcements);
    set("adminOverviewSubText", `${s.students} student${s.students === 1 ? '' : 's'} • ${s.events} event${s.events === 1 ? '' : 's'} • ${s.registrations} registration${s.registrations === 1 ? '' : 's'} across campus.`);
  }

  const recent = document.getElementById("adminRecentActivity");
  if (recent) {
    const items = (s && s.recent) || adminData.activity.slice(0, 8);
    recent.innerHTML = items.length ? items.map(activityItemHtml).join('') : emptyState("No activity yet. It will appear here as students sign up and register.");
  }

  const cap = document.getElementById("adminCapacityList");
  if (cap) {
    cap.innerHTML = eventsData.length ? eventsData.map(evt => {
      const taken = Number(evt.registeredCount) || 0;
      const total = Number(evt.seats) || 0;
      const pct = total ? Math.min(100, Math.round((taken / total) * 100)) : 0;
      return `
        <div class="capacity-item">
          <div class="capacity-top"><strong>${escapeHtml(evt.title)}</strong><span>${taken}/${total}</span></div>
          <div class="progress"><div class="progress-bar ${pct >= 90 ? 'full' : ''}" style="width:${pct}%"></div></div>
        </div>`;
    }).join('') : emptyState("No events yet. Create your first event.");
  }
}

function renderAdminEvents() {
  const container = document.getElementById("adminEventsList");
  const count = document.getElementById("adminEventsCount");
  if (count) count.textContent = `(${eventsData.length})`;
  if (!container) return;
  if (!eventsData.length) {
    container.className = '';
    container.innerHTML = emptyState("No events yet. Use the form above to publish one.");
    return;
  }
  container.className = 'events-grid';
  container.innerHTML = eventsData.map(evt => {
    const id = escapeHtml(eventId(evt));
    const taken = Number(evt.registeredCount) || 0;
    const total = Number(evt.seats) || 0;
    const pct = total ? Math.min(100, Math.round((taken / total) * 100)) : 0;
    return `
      <div class="stat-card admin-event-card">
        <div class="admin-event-img"><img src="${escapeHtml(evt.image)}" alt="${escapeHtml(evt.title)}"></div>
        <span class="eyebrow-red">${escapeHtml(evt.category)}</span>
        <h3>${escapeHtml(evt.title)}</h3>
        <p class="admin-event-meta">${escapeHtml(evt.date)} • ${escapeHtml(evt.venue)}</p>
        <div class="capacity-top"><span>Registered</span><span>${taken}/${total}</span></div>
        <div class="progress"><div class="progress-bar ${pct >= 90 ? 'full' : ''}" style="width:${pct}%"></div></div>
        <div class="admin-card-actions">
          <button type="button" class="btn-gray flex-center" data-action="attendees" data-id="${id}"><i data-lucide="users"></i> Attendees</button>
          <button type="button" class="btn-danger flex-center" data-action="delete-event" data-id="${id}"><i data-lucide="trash-2"></i> Delete</button>
        </div>
      </div>`;
  }).join('');
}

function renderAdminStudents() {
  const body = document.getElementById("adminStudentsBody");
  if (!body) return;
  const q = (document.getElementById("adminStudentSearch")?.value || '').toLowerCase().trim();
  const rows = adminData.students.filter(st =>
    !q || [st.name, st.email, st.studentId, st.dept].some(v => (v || '').toLowerCase().includes(q)));

  const label = document.getElementById("adminStudentsCount");
  if (label) label.textContent = `${rows.length} student${rows.length === 1 ? '' : 's'}${q ? ' found' : ' in total'}`;

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6">${emptyState(q ? "No students match your search." : "No students have signed up yet.")}</td></tr>`;
    return;
  }
  body.innerHTML = rows.map(st => {
    const name = st.name || st.email;
    const initials = name.split(/\s+/).filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase();
    return `
      <tr>
        <td data-label="Student">
          <div class="student-cell">
            <div class="avatar avatar-sm">${escapeHtml(initials)}</div>
            <div><strong>${escapeHtml(name)}</strong><span>${escapeHtml(st.email)}</span></div>
          </div>
        </td>
        <td data-label="Student ID">${escapeHtml(st.studentId || '—')}</td>
        <td data-label="Department">${escapeHtml(st.dept || '—')}</td>
        <td data-label="Registered"><span class="pill-count">${st.registeredCount}</span></td>
        <td data-label="Joined">${escapeHtml(formatDateTime(st.createdAt))}</td>
        <td data-label="Last sign-in">${escapeHtml(st.lastLoginAt ? timeAgo(st.lastLoginAt) : '—')}</td>
      </tr>`;
  }).join('');
}

function renderAdminActivity() {
  const list = document.getElementById("adminActivityList");
  if (!list) return;
  const filter = document.getElementById("adminActivityFilter")?.value || 'all';
  const items = adminData.activity.filter(a =>
    filter === 'all' ? true : filter === 'admin' ? a.role === 'admin' : a.type === filter);
  list.innerHTML = items.length ? items.map(activityItemHtml).join('') : emptyState("No activity to show.");
}

function renderAdminUpdates() {
  const list = document.getElementById("adminUpdatesList");
  if (!list) return;
  list.innerHTML = adminData.updates.length ? adminData.updates.map(a => `
    <div class="notification-card">
      <div class="icon-box icon-red"><i data-lucide="megaphone"></i></div>
      <div class="notification-main">
        <h4>${escapeHtml(a.title)}</h4>
        <p>${escapeHtml(a.message)}</p>
        <span class="timestamp">Sent ${escapeHtml(formatDateTime(a.createdAt))}</span>
      </div>
      <button type="button" class="btn-icon-danger" data-action="delete-update" data-id="${escapeHtml(a._id)}" aria-label="Delete update"><i data-lucide="trash-2"></i></button>
    </div>`).join('') : emptyState("You haven't sent any updates yet.");
}

// ---- Create / delete events ----
async function handleCreateEvent(e) {
  e.preventDefault();
  const errEl = document.getElementById("adminEventError");
  errEl.classList.add("hidden");

  const dateValue = document.getElementById("evDate").value;
  const startsAt = new Date(dateValue);
  const body = {
    title: document.getElementById("evTitle").value.trim(),
    category: document.getElementById("evCategory").value,
    startsAt: isNaN(startsAt.getTime()) ? '' : startsAt.toISOString(),
    date: isNaN(startsAt.getTime()) ? '' : formatDateTime(startsAt),
    venue: document.getElementById("evVenue").value.trim(),
    dept: document.getElementById("evDept").value.trim(),
    seats: document.getElementById("evSeats").value,
    image: document.getElementById("evImage").value.trim(),
    description: document.getElementById("evDescription").value.trim()
  };

  const btn = document.getElementById("adminEventSubmit");
  btn.disabled = true;
  try {
    const { ok, data } = await apiFetch('/admin/events', { method: 'POST', body: JSON.stringify(body) });
    if (!ok) {
      errEl.textContent = data.message || "Couldn't create the event.";
      errEl.classList.remove("hidden");
      return;
    }
    document.getElementById("adminEventForm").reset();
    showToast(`"${data.title}" is now live for students.`);
    await loadAdminData();
  } catch (err) {
    errEl.textContent = "Couldn't reach the server. Please try again.";
    errEl.classList.remove("hidden");
  } finally {
    btn.disabled = false;
  }
}

async function handleDeleteEvent(id) {
  const evt = findEvent(id);
  if (!evt) return;
  const taken = Number(evt.registeredCount) || 0;
  const warning = taken ? `\n\n${taken} student${taken === 1 ? ' is' : 's are'} registered. Their registrations will be removed.` : '';
  if (!confirm(`Delete "${evt.title}"?${warning}`)) return;
  try {
    const { ok, data } = await apiFetch(`/admin/events/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!ok) return showToast(data.message || "Couldn't delete the event.", true);
    showToast(`"${evt.title}" was deleted.`);
    await loadAdminData();
  } catch (e) {
    showToast("Couldn't reach the server. Please try again.", true);
  }
}

// ---- Attendees ----
async function openAttendeesModal(id) {
  const evt = findEvent(id);
  if (!evt) return;
  document.getElementById("attendeesTitle").textContent = evt.title;
  document.getElementById("attendeesSub").textContent = `${evt.date} • ${evt.venue}`;
  const list = document.getElementById("attendeesList");
  list.innerHTML = emptyState("Loading…");
  document.getElementById("attendeesModal").classList.remove("hidden");
  refreshIcons();
  try {
    const { ok, data } = await apiFetch(`/admin/events/${encodeURIComponent(id)}/attendees`);
    if (!ok) { list.innerHTML = emptyState(data.message || "Couldn't load attendees."); return; }
    list.innerHTML = data.length ? data.map((st, i) => `
      <div class="attendee-row">
        <span class="attendee-num">${i + 1}</span>
        <div><strong>${escapeHtml(st.name || st.email)}</strong><span>${escapeHtml(st.email)}${st.studentId ? ' • ' + escapeHtml(st.studentId) : ''}</span></div>
        <span class="attendee-dept">${escapeHtml(st.dept || '')}</span>
      </div>`).join('') : emptyState("No students have registered yet.");
  } catch (e) {
    list.innerHTML = emptyState("Couldn't reach the server.");
  }
}

function closeAttendeesModal() {
  document.getElementById("attendeesModal").classList.add("hidden");
}

// ---- Updates for students ----
async function handleSendUpdate(e) {
  e.preventDefault();
  const errEl = document.getElementById("adminUpdateError");
  errEl.classList.add("hidden");
  const body = {
    title: document.getElementById("updTitle").value.trim(),
    message: document.getElementById("updMessage").value.trim()
  };
  const btn = document.getElementById("adminUpdateSubmit");
  btn.disabled = true;
  try {
    const { ok, data } = await apiFetch('/admin/announcements', { method: 'POST', body: JSON.stringify(body) });
    if (!ok) {
      errEl.textContent = data.message || "Couldn't send the update.";
      errEl.classList.remove("hidden");
      return;
    }
    document.getElementById("adminUpdateForm").reset();
    showToast("Update sent to all students.");
    await loadAdminData();
  } catch (err) {
    errEl.textContent = "Couldn't reach the server. Please try again.";
    errEl.classList.remove("hidden");
  } finally {
    btn.disabled = false;
  }
}

async function handleDeleteUpdate(id) {
  if (!confirm("Remove this update? Students will no longer see it.")) return;
  try {
    const { ok, data } = await apiFetch(`/admin/announcements/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!ok) return showToast(data.message || "Couldn't remove the update.", true);
    showToast("Update removed.");
    await loadAdminData();
  } catch (e) {
    showToast("Couldn't reach the server. Please try again.", true);
  }
}

// Close admin modal with Escape too
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAttendeesModal();
});
