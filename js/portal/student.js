// =============================================================================
// js/portal/student.js — THE STUDENT PORTAL
// -----------------------------------------------------------------------------
//   1. Event cards and lists (Overview, Discover, My events, Passes, Saved)
//   2. Event details pop-up + Register / Cancel / Save buttons
//   3. EVENT REGISTRATION FORM
//   4. QR event pass
//   5. Notifications (updates from the admin + the bell badge)
// =============================================================================

// =============================================================================
// 1. EVENT CARDS AND LISTS
// =============================================================================
// EVENT CARD (used by every list)
function eventCardHtml(evt, extraButton) {
  return `
    <div class="stat-card" style="text-align: left;">
      <div style="height: 140px; border-radius: 12px; overflow: hidden; margin-bottom: 12px;">
        <img src="${escapeHtml(imageUrl(evt.image))}" style="width: 100%; height: 100%; object-fit: cover;" alt="${escapeHtml(evt.title)}" loading="lazy">
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

// =============================================================================
// 2. EVENT DETAILS POP-UP
// =============================================================================
// EVENT DETAIL MODAL
function openEventDetailModal(id) {
  const evt = findEvent(id);
  if (!evt) return;
  activeSelectedEventId = eventId(evt);

  document.getElementById("modalEventTitle").innerText = evt.title;
  document.getElementById("modalEventImg").src = imageUrl(evt.image);
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

async function handleModalRegisterAction() {
  if (!activeUser || !activeSelectedEventId || isAdmin()) return;
  const evt = findEvent(activeSelectedEventId);
  if (!evt) return;

  // Already registered -> cancel
  if (userState.registered.includes(activeSelectedEventId)) {
    if (!confirm(`Cancel your registration for "${evt.title}"?`)) return;
    try {
      const { ok, data } = await apiFetch(`/events/${encodeURIComponent(activeSelectedEventId)}/register`, { method: 'DELETE' });
      if (!ok) return showToast(data.message || "Couldn't cancel your registration.", true);
      userState.registered = (data.registered || []).map(String);
      showToast("Registration cancelled.");
    } catch (e) {
      return showToast("Couldn't reach the server. Please try again.", true);
    }
    await fetchEvents();
    updateModalButtons();
    renderUserLists();
    return;
  }

  if (seatsLeft(evt) <= 0) return;
  openRegisterForm(evt);
}

// =============================================================================
// 3. EVENT REGISTRATION FORM
// =============================================================================
function openRegisterForm(evt) {
  const form = document.getElementById("eventRegisterForm");
  form.reset();
  document.getElementById("regFormError").classList.add("hidden");
  document.getElementById("regFormEventTitle").textContent = evt.title;
  document.getElementById("regFormEventMeta").textContent = `${evt.date} • ${evt.venue} • ${seatsLeft(evt)} seat${seatsLeft(evt) === 1 ? '' : 's'} left`;
  document.getElementById("erName").value = activeUser.name || '';
  document.getElementById("erStudentId").value = activeUser.studentId || '';
  document.getElementById("erDept").value = activeUser.dept || '';
  document.getElementById("erEmail").value = activeUser.email || '';
  document.getElementById("erPhone").value = activeUser.phone || '';
  document.getElementById("eventDetailModal").classList.add("hidden");
  document.getElementById("registerFormModal").classList.remove("hidden");
  refreshIcons();
  const firstEmpty = ["erName", "erStudentId", "erDept", "erPhone"].map(id => document.getElementById(id)).find(el => !el.value);
  (firstEmpty || document.getElementById("erPhone")).focus();
}

function closeRegisterForm() {
  document.getElementById("registerFormModal").classList.add("hidden");
}

async function handleEventRegistration(e) {
  e.preventDefault();
  const errEl = document.getElementById("regFormError");
  const showErr = (msg) => { errEl.textContent = msg; errEl.classList.remove("hidden"); };
  errEl.classList.add("hidden");

  const body = {
    name: document.getElementById("erName").value.trim(),
    studentId: document.getElementById("erStudentId").value.trim(),
    dept: document.getElementById("erDept").value,
    phone: document.getElementById("erPhone").value.trim(),
    note: document.getElementById("erNote").value.trim(),
    agree: document.getElementById("erAgree").checked
  };
  if (!body.name) return showErr("Please enter your full name.");
  if (!body.studentId) return showErr("Please enter your student ID.");
  if (!body.dept) return showErr("Please choose your department.");
  if (!/^[+()\d][\d\s()+-]{6,19}$/.test(body.phone)) return showErr("Please enter a valid phone number.");
  if (!body.agree) return showErr("Please confirm that you will attend.");

  const id = activeSelectedEventId;
  const btn = document.getElementById("regFormSubmit");
  btn.disabled = true;
  try {
    const { ok, data } = await apiFetch(`/events/${encodeURIComponent(id)}/register`, { method: 'POST', body: JSON.stringify(body) });
    if (!ok) return showErr(data.message || "Couldn't complete your registration.");
    userState.registered = (data.registered || []).map(String);
    if (data.user) activeUser = { ...activeUser, ...data.user };
    closeRegisterForm();
    showToast("You're registered! Your QR pass is in Event passes.");
    await fetchEvents();
    renderUserLists();
    openEventDetailModal(id);
  } catch (err) {
    showErr("Couldn't reach the server. Please try again.");
  } finally {
    btn.disabled = false;
  }
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

// =============================================================================
// 4. QR EVENT PASS
// =============================================================================
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

// =============================================================================
// 5. NOTIFICATIONS (updates from the admin + bell badge)
// =============================================================================
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
