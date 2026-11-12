// Backend URL comes from config.js (localhost in development, hosted URL in production)
const API_BASE = window.KDU_API_BASE || 'http://localhost:5050/api';

// Shown when the backend can't be reached (e.g. on GitHub Pages before the server is hosted)
const DEFAULT_EVENTS = [
  { _id: "1", title: "Future Forward: Tech & Innovation Summit", category: "Technology", date: "Dec 12, 2026, 10:00 AM", venue: "Innovation Hall", dept: "Faculty of Computing", seats: 42, description: "Showcase of AI and student tech projects.", image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80" },
  { _id: "2", title: "The Creative Exchange", category: "Arts & Culture", date: "Dec 18, 2026, 5:30 PM", venue: "The Atrium", dept: "Faculty of Arts", seats: 18, description: "Student art and music showcase.", image: "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=800&q=80" },
  { _id: "3", title: "Campus Founders Meetup", category: "Entrepreneurship", date: "Jan 8, 2027, 5:30 PM", venue: "Student Commons", dept: "School of Business", seats: 27, description: "Startup founders networking session.", image: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=800&q=80" }
];

const TAB_LABELS = {
  overview: 'Overview', discover: 'Discover events', myevents: 'My events',
  passes: 'Event passes', saved: 'Saved', notifications: 'Notifications'
};

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
      if (Array.isArray(data) && data.length) eventsData = data;
    }
  } catch (err) {
    console.log("Backend unreachable - using local default events data.");
  }
  renderDiscoverGrid(eventsData);
  if (activeUser) renderUserLists();
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
    const res = await fetch(`${API_BASE}/me/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(userState)
    });
    if (res.status === 401) {
      alert("Your session has expired. Please sign in again.");
      handleSignOut();
    }
  } catch (e) {
    console.log("Could not reach the server - changes were not saved.");
  }
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
  updateUserUI();
  navigateTo('overview');
}

function handleSignOut() {
  toggleSidebar(false);
  setToken(null);
  activeUser = null;
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
  const isAdmin = activeUser.role === 'admin';

  document.getElementById("userAvatar").innerText = initials;
  document.getElementById("userNameLabel").innerText = nameStr;
  document.getElementById("userAccountTypeLabel").innerText = isAdmin ? 'Admin Account' : 'Student Account';
  document.getElementById("sidebarRoleTag").innerText = isAdmin ? 'Admin Portal' : 'Student Portal';
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
  Object.keys(TAB_LABELS).forEach(tab => {
    const tabEl = document.getElementById(`tab-${tab}`);
    const navEl = document.getElementById(`nav-${tab}`);
    if (tabEl) tabEl.classList.toggle("hidden", tab !== tabName);
    if (navEl) navEl.classList.toggle("active", tab === tabName);
  });

  document.getElementById("headerBreadcrumbTitle").innerText = TAB_LABELS[tabName] || tabName;

  if (tabName === 'discover') applyDiscoverFilters();
  else renderUserLists();
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

// SEATS (the user's own registration takes one seat)
function seatsLeft(evt) {
  const taken = userState.registered.includes(eventId(evt)) ? 1 : 0;
  return Math.max(0, (Number(evt.seats) || 0) - taken);
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
  if (subText) subText.innerText = `You have ${registered.length} upcoming event${registered.length === 1 ? '' : 's'} and 1 campus update.`;

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

  document.getElementById("modalEventSeats").innerText = `${left} remaining`;

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
  const idx = list.indexOf(activeSelectedEventId);
  if (idx >= 0) list.splice(idx, 1);
  else if (seatsLeft(findEvent(activeSelectedEventId)) > 0) list.push(activeSelectedEventId);
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
