// =============================================================================
// js/portal/auth.js — SIGNING IN, SIGNING UP AND THE LOGIN SESSION
// -----------------------------------------------------------------------------
//   • login token kept in the browser
//   • moving between the pages: login.html / signup.html → student-portal.html
//     or admin-portal.html, and back to login.html after signing out
//   • the student's saved/registered events (loaded when the portal opens)
//   • the sign-in form (Student Portal / Admin Portal tabs) and sign-up form
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

// Go to another portal page (replace = the Back button won't bounce between them)
function goTo(url) {
  window.location.replace(url);
}

// The right portal for an account: admin → admin-portal.html, student → student-portal.html
function portalUrlFor(role) {
  return role === 'admin' ? PAGES.admin : PAGES.student + eventQuery();
}

// Asks the server who this token belongs to. Returns the { user, state } or null.
// "invalid: true" means the server rejected the token (signed out / expired).
async function checkToken(token) {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401 || res.status === 403) return { invalid: true };
    if (!res.ok) return null;
    const data = await res.json();
    return data.user ? data : null;
  } catch (e) {
    return null; // server unreachable
  }
}

// PORTAL PAGES: only open the portal for a valid login of the right kind
async function restoreSession() {
  const token = getToken();
  if (!token) return goTo(PAGES.login + eventQuery());

  const data = await checkToken(token);
  if (!data || data.invalid) {
    if (data && data.invalid) setToken(null);
    return goTo(PAGES.login + eventQuery());
  }

  // Student on the admin page, or the admin on the student page → the right portal
  const wanted = data.user.role === 'admin' ? 'admin' : 'student';
  if (PAGE !== wanted) return goTo(portalUrlFor(data.user.role));

  activeUser = data.user;
  openMainPortal(data.state);
}

// SIGN-IN / SIGN-UP PAGES: already signed in? Go straight to the portal.
async function initAuthPage() {
  clearLoginFields();
  const token = getToken();
  if (!token) return;
  const data = await checkToken(token);
  if (data && data.user) return goTo(portalUrlFor(data.user.role));
  if (data && data.invalid) setToken(null);
}

// Keep the "Create an account" / "Sign in" link pointing at the same event (if any)
document.addEventListener("DOMContentLoaded", () => {
  const link = document.getElementById("authSwitchLink");
  if (link && eventQuery()) link.setAttribute("href", link.getAttribute("href") + eventQuery());
});

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
// 3. SIGN-IN / SIGN-UP FORMS, OPENING THE PORTAL, SIGNING OUT
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

// SIGN-IN PAGE: STUDENT PORTAL / ADMIN PORTAL TABS
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
  const emailInput = document.getElementById("authEmailInput");
  if (emailInput) emailInput.placeholder = role === 'admin' ? "admin@kduevents.co.kr" : "student@kdu.ac.kr";
  if (submitBtn) submitBtn.innerHTML = `<span>Continue to ${role} portal</span> <i data-lucide="arrow-right"></i>`;
  refreshIcons();
}

// HANDLE THE SIGN-IN (login.html) AND SIGN-UP (signup.html) FORMS
async function handleAuthAction(e) {
  if (e) e.preventDefault();
  clearAuthError();

  const email = document.getElementById("authEmailInput").value.trim();
  const password = document.getElementById("authPassInput").value;
  if (!email || !password) return showAuthError("Please enter both email and password.");

  const isSignup = PAGE === 'signup';
  let body;
  if (isSignup) {
    const name = document.getElementById("regFullName").value.trim();
    const studentId = document.getElementById("regStudentId").value.trim();
    const dept = document.getElementById("regDept").value;
    const confirmPass = document.getElementById("authPassConfirm").value;
    if (!name) return showAuthError("Please enter your full name.");
    if (password.length < 6) return showAuthError("Password must be at least 6 characters.");
    if (password !== confirmPass) return showAuthError("The two passwords don't match. Please type the same password in both boxes.");
    body = { name, email, password, studentId, dept };
  } else {
    body = { email, password, role: selectedRole };
  }

  const submitBtn = document.getElementById("authSubmitBtn");
  if (submitBtn) submitBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/auth/${isSignup ? 'register' : 'login'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok && data.user && data.token) {
      setToken(data.token);
      ["authPassInput", "authPassConfirm"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });
      return goTo(portalUrlFor(data.user.role));   // keep the button disabled while leaving
    }
    // Wrong password, duplicate email, etc. -> do NOT let the user in
    showAuthError(data.message || "Sign in failed. Please check your details.");
  } catch (err) {
    // Server unreachable: never let anyone in without the server checking their details
    showAuthError("Can't reach the KDU Events server right now. Please check your connection and try again.");
  }
  if (submitBtn) submitBtn.disabled = false;
}

// PORTAL PAGES: show the portal once the login has been checked
function openMainPortal(serverState) {
  document.getElementById("portalLoading")?.classList.add("hidden");
  document.getElementById("mainPortalApp").classList.remove("hidden");
  loadUserState(serverState);
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

// SIGN OUT: cancel the login on the server, forget it here, back to login.html
let signingOut = false;
async function handleSignOut() {
  if (signingOut) return;
  signingOut = true;
  const oldToken = getToken();
  setToken(null);   // other open portal tabs notice this and sign out too
  activeUser = null;
  if (oldToken) {
    // Wait (max 3 seconds) for the server to cancel the token before leaving the page
    await Promise.race([
      fetch(`${API_BASE}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${oldToken}` } }).catch(() => {}),
      new Promise(resolve => setTimeout(resolve, 3000))
    ]);
  }
  goTo(PAGES.login);
}

// Empty the email & password boxes (again a moment later, in case the browser refills them)
function clearLoginFields() {
  const form = document.getElementById("authForm");
  if (form) form.reset();
  const wipe = () => {
    const email = document.getElementById("authEmailInput");
    const pass = document.getElementById("authPassInput");
    const confirmPass = document.getElementById("authPassConfirm");
    if (email) email.value = "";
    if (pass) pass.value = "";
    if (confirmPass) confirmPass.value = "";
  };
  wipe();
  setTimeout(wipe, 300);
}

// Signed out in ANOTHER tab → leave the portal in this tab too
window.addEventListener("storage", (e) => {
  if (e.key === TOKEN_KEY && !e.newValue && !IS_AUTH_PAGE) goTo(PAGES.login);
});

// Page brought back with the browser's Back/Forward buttons: re-check the login
window.addEventListener("pageshow", (e) => {
  if (!e.persisted) return;
  if (IS_AUTH_PAGE) clearLoginFields();
  else if (!getToken()) goTo(PAGES.login);
});

function updateUserUI() {
  if (!activeUser) return;
  const nameStr = activeUser.name || activeUser.email.split('@')[0];
  const initials = nameStr.split(/\s+/).filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const adminAccount = isAdmin();

  document.getElementById("userAvatar").innerText = initials;
  document.getElementById("userNameLabel").innerText = nameStr;
  document.getElementById("userAccountTypeLabel").innerText = adminAccount ? 'Admin Account' : 'Student Account';
  document.getElementById("sidebarRoleTag").innerText = adminAccount ? 'Admin Portal' : 'Student Portal';
  if (adminAccount) return;
  document.getElementById("overviewDeptTag").innerText = activeUser.dept || "Smart Computing";
  document.getElementById("overviewWelcomeHeading").innerText = `Welcome back, ${nameStr.split(' ')[0]}.`;
  renderUserLists();
}

// Show / hide the password in the field next to the eye button
function togglePassword(btn) {
  const input = btn.parentElement.querySelector("input");
  if (!input) return;
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  const label = show ? "Hide password" : "Show password";
  btn.setAttribute("aria-label", label);
  btn.title = label;
  btn.innerHTML = `<i data-lucide="${show ? "eye-off" : "eye"}"></i>`;
  refreshIcons();
}
