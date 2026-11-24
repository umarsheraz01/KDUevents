// =============================================================================
// js/portal/reset.js — FORGOT PASSWORD (reset-password.html only)
// -----------------------------------------------------------------------------
//   • no ?token= in the address → "Send reset link" form  (POST /auth/forgot-password)
//   • ?token=… (the link from the email) → "New password" form (POST /auth/reset-password)
// After a successful reset the student is sent to login.html to sign in again.
// =============================================================================
let resetToken = '';

function initResetPage() {
  const params = new URLSearchParams(window.location.search);
  resetToken = params.get('token') || '';
  if (!resetToken) return;

  // Hide the code from the address bar (and browser history) once it's been read
  try { history.replaceState(null, '', window.location.pathname); } catch (e) {}
  document.getElementById("forgotForm").classList.add("hidden");
  document.getElementById("resetForm").classList.remove("hidden");
  document.getElementById("resetTitle").innerText = "Choose a new password.";
  document.getElementById("resetSubtitle").innerText = "Pick a password you haven't used here before. You'll sign in with it next.";
}

function showResetSuccess(message) {
  const el = document.getElementById("resetSuccess");
  el.textContent = message;
  el.classList.remove("hidden");
}

async function postAuth(path, body) {
  const res = await fetch(`${API_BASE}/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

// Step 1: send the reset email
async function handleForgotSubmit(e) {
  e.preventDefault();
  clearAuthError();
  document.getElementById("resetSuccess").classList.add("hidden");
  const email = document.getElementById("forgotEmailInput").value.trim();
  if (!email) return showAuthError("Please enter your email address.");

  const btn = document.getElementById("forgotSubmitBtn");
  btn.disabled = true;
  try {
    const { ok, data } = await postAuth('forgot-password', { email });
    if (ok) {
      showResetSuccess(data.message || "If a student account uses that email, a reset link is on its way.");
      document.getElementById("forgotForm").classList.add("hidden");
      return;
    }
    showAuthError(data.message || "Couldn't send the reset link. Please try again.");
  } catch (err) {
    showAuthError("Can't reach the KDU Events server right now. Please check your connection and try again.");
  }
  btn.disabled = false;
}

// Step 2: save the new password
async function handleResetSubmit(e) {
  e.preventDefault();
  clearAuthError();
  const password = document.getElementById("resetPassInput").value;
  const confirmPass = document.getElementById("resetPassConfirm").value;
  if (password.length < 6) return showAuthError("Password must be at least 6 characters.");
  if (password !== confirmPass) return showAuthError("The two passwords don't match. Please type the same password in both boxes.");

  const btn = document.getElementById("resetSubmitBtn");
  btn.disabled = true;
  try {
    const { ok, data } = await postAuth('reset-password', { token: resetToken, password });
    if (ok) {
      setToken(null);   // any old login in this browser no longer works
      document.getElementById("resetForm").classList.add("hidden");
      showResetSuccess((data.message || "Your password has been changed.") + " Taking you to sign in…");
      setTimeout(() => goTo(PAGES.login), 2500);
      return;
    }
    showAuthError(data.message || "Couldn't change the password. Please try again.");
    // Expired or used link → offer to send a new one
    if (/expired|not valid|already used/i.test(data.message || '')) {
      document.getElementById("resetForm").classList.add("hidden");
      document.getElementById("forgotForm").classList.remove("hidden");
      document.getElementById("resetTitle").innerText = "Forgot your password?";
      document.getElementById("resetSubtitle").innerText = "Enter your email to get a new reset link.";
    }
  } catch (err) {
    showAuthError("Can't reach the KDU Events server right now. Please check your connection and try again.");
  }
  btn.disabled = false;
}
