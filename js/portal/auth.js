// =============================================================================
// js/portal/auth.js — SIGNING IN, SIGNING UP AND THE LOGIN SESSION
// -----------------------------------------------------------------------------
//   • login token kept in the browser + restoring it after a refresh
//   • the student's saved/registered events (loaded at sign-in)
//   • the sign-in / sign-up form (Student Portal and Admin Portal tabs)
//   • opening the portal after sign-in, and signing out
// =============================================================================

// =============================================================================
// 1. LOGIN SESSION (token saved in the browser)
// =============================================================================
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

// =============================================================================
// 2. THE STUDENT'S SAVED + REGISTERED EVENTS
// =============================================================================
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

// =============================================================================
// 3. SIGN-IN / SIGN-UP FORM AND OPENING THE PORTAL
// =============================================================================
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
    openPendingEvent();
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
