// =============================================================================
// js/portal/admin.js — THE ADMIN PORTAL
// -----------------------------------------------------------------------------
//   1. Loading the admin data (dashboard, students, activity, updates)
//   2. Drawing each admin tab
//   3. Creating and deleting events
//   4. Event banner upload (resize, preview, drag & drop)
//   5. PARTICIPANT LIST + CSV download
//   6. Sending updates to students
// =============================================================================

// =============================================================================
// 1. LOADING THE ADMIN DATA (one request per admin tab, all at once)
// =============================================================================
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

// =============================================================================
// 2. DRAWING EACH ADMIN TAB (Dashboard, Manage events, Students, Activity, Updates)
// =============================================================================
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
        <div class="admin-event-img"><img src="${escapeHtml(imageUrl(evt.image))}" alt="${escapeHtml(evt.title)}" loading="lazy"></div>
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

// =============================================================================
// 3. CREATING AND DELETING EVENTS (the "Create a new event" form)
// =============================================================================

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
  const btnLabel = btn.querySelector("span");
  btn.disabled = true;
  try {
    // 1) Upload the banner (if one was chosen), 2) create the event with it
    if (pendingBanner) {
      if (btnLabel) btnLabel.textContent = "Uploading banner…";
      const up = await apiFetch('/admin/images', { method: 'POST', body: JSON.stringify({ image: pendingBanner.dataUrl }) });
      if (!up.ok) {
        errEl.textContent = up.data.message || "Couldn't upload the banner image.";
        errEl.classList.remove("hidden");
        return;
      }
      body.image = up.data.url;
    }
    if (btnLabel) btnLabel.textContent = "Publishing…";
    const { ok, data } = await apiFetch('/admin/events', { method: 'POST', body: JSON.stringify(body) });
    if (!ok) {
      errEl.textContent = data.message || "Couldn't create the event.";
      errEl.classList.remove("hidden");
      return;
    }
    document.getElementById("adminEventForm").reset();
    clearBanner();
    showToast(`"${data.title}" is now live for students.`);
    await loadAdminData();
  } catch (err) {
    errEl.textContent = "Couldn't reach the server. Please try again.";
    errEl.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    if (btnLabel) btnLabel.textContent = "Publish event";
  }
}

// =============================================================================
// 4. EVENT BANNER UPLOAD (resize in the browser, preview, drag & drop)
// =============================================================================

let pendingBanner = null; // { dataUrl, info }
const MAX_BANNER_SOURCE_BYTES = 10 * 1024 * 1024;
const BANNER_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Couldn't read the file."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file doesn't look like a valid image."));
    img.src = src;
  });
}

// Shrinks big photos to banner size (max 1600px wide) so uploads are quick
async function prepareBanner(file) {
  const original = await readFileAsDataUrl(file);
  const img = await loadImage(original);
  const maxW = 1600, maxH = 1200;
  const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
  // Small enough already (and keep GIF animations): upload as-is
  if (scale === 1 && file.size <= 1.5 * 1024 * 1024) {
    return { dataUrl: original, width: img.naturalWidth, height: img.naturalHeight, bytes: file.size };
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // transparent PNGs get a white background in JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  const bytes = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
  return { dataUrl, width: canvas.width, height: canvas.height, bytes };
}

function formatBytes(n) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

async function handleBannerFile(file) {
  const errEl = document.getElementById("adminEventError");
  errEl.classList.add("hidden");
  if (!file) return;
  const showErr = (msg) => { errEl.textContent = msg; errEl.classList.remove("hidden"); };
  if (!BANNER_TYPES.includes(file.type)) return showErr("Please choose a JPG, PNG, WebP or GIF image.");
  if (file.size > MAX_BANNER_SOURCE_BYTES) return showErr("That image is larger than 10 MB. Please choose a smaller one.");

  try {
    const prepared = await prepareBanner(file);
    if (prepared.bytes > 2.5 * 1024 * 1024) return showErr("That image is still too large after resizing. Please choose a smaller one.");
    pendingBanner = prepared;
    document.getElementById("bannerPreviewImg").src = prepared.dataUrl;
    document.getElementById("bannerFileInfo").textContent = `${file.name} • ${prepared.width}×${prepared.height} • ${formatBytes(prepared.bytes)}`;
    document.getElementById("bannerEmpty").classList.add("hidden");
    document.getElementById("bannerPreview").classList.remove("hidden");
    document.getElementById("evImage").value = ''; // the upload replaces any pasted link
    refreshIcons();
  } catch (e) {
    showErr(e.message || "Couldn't read that image.");
  } finally {
    document.getElementById("evBannerFile").value = ''; // allow choosing the same file again
  }
}

function clearBanner() {
  pendingBanner = null;
  const img = document.getElementById("bannerPreviewImg");
  if (img) img.src = '';
  document.getElementById("bannerPreview")?.classList.add("hidden");
  document.getElementById("bannerEmpty")?.classList.remove("hidden");
}

// Pasting a link removes a chosen upload (only one banner per event)
function handleImageLinkInput() {
  if (pendingBanner && document.getElementById("evImage").value.trim()) clearBanner();
}

// Drag & drop onto the banner area
document.addEventListener('DOMContentLoaded', () => {
  const zone = document.getElementById("bannerDropZone");
  if (!zone) return;
  ['dragenter', 'dragover'].forEach(t => zone.addEventListener(t, (e) => {
    e.preventDefault();
    zone.classList.add("dragging");
  }));
  ['dragleave', 'drop'].forEach(t => zone.addEventListener(t, (e) => {
    e.preventDefault();
    zone.classList.remove("dragging");
  }));
  zone.addEventListener('drop', (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleBannerFile(file);
  });
});

// ---- Delete an event (the red "Delete" button on each admin event card) ----
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

// =============================================================================
// 5. PARTICIPANT LIST + CSV DOWNLOAD (the "Attendees" button)
// =============================================================================

let attendeesCache = { event: null, list: [] };

async function openAttendeesModal(id) {
  const evt = findEvent(id);
  if (!evt) return;
  attendeesCache = { event: evt, list: [] };
  document.getElementById("attendeesTitle").textContent = evt.title;
  document.getElementById("attendeesSub").textContent = `${evt.date} • ${evt.venue}`;
  document.getElementById("attendeesCount").textContent = '';
  document.getElementById("attendeesCsvBtn").disabled = true;
  const list = document.getElementById("attendeesList");
  list.innerHTML = emptyState("Loading…");
  document.getElementById("attendeesModal").classList.remove("hidden");
  refreshIcons();
  try {
    const { ok, data } = await apiFetch(`/admin/events/${encodeURIComponent(id)}/attendees`);
    if (!ok) { list.innerHTML = emptyState(data.message || "Couldn't load the participant list."); return; }
    attendeesCache.list = data;
    const total = Number(evt.seats) || 0;
    document.getElementById("attendeesCount").textContent = `${data.length} of ${total} seats taken`;
    document.getElementById("attendeesCsvBtn").disabled = !data.length;
    list.innerHTML = data.length ? data.map((st, i) => `
      <div class="attendee-row">
        <span class="attendee-num">${i + 1}</span>
        <div class="attendee-main">
          <strong>${escapeHtml(st.name || st.email)}</strong>
          <span>${escapeHtml(st.email)}${st.studentId ? ' • ' + escapeHtml(st.studentId) : ''}</span>
          ${st.note ? `<em class="attendee-note">“${escapeHtml(st.note)}”</em>` : ''}
        </div>
        <div class="attendee-side">
          <span class="attendee-dept">${escapeHtml(st.dept || '')}</span>
          ${st.phone ? `<span class="attendee-phone">${escapeHtml(st.phone)}</span>` : ''}
          ${st.registeredAt ? `<span class="attendee-time">${escapeHtml(formatDateTime(st.registeredAt))}</span>` : ''}
        </div>
      </div>`).join('') : emptyState("No students have registered yet.");
    refreshIcons();
  } catch (e) {
    list.innerHTML = emptyState("Couldn't reach the server.");
  }
}

// Download the participant list as a CSV file (opens in Excel / Google Sheets)
function downloadAttendeesCsv() {
  const { event, list } = attendeesCache;
  if (!event || !list.length) return;
  const cell = (v) => {
    let t = String(v == null ? '' : v);
    if (/^[=+\-@]/.test(t)) t = "'" + t; // stop spreadsheet formulas
    return '"' + t.replace(/"/g, '""') + '"';
  };
  const rows = [["#", "Name", "Email", "Student ID", "Department", "Phone", "Note", "Registered at"]];
  list.forEach((st, i) => rows.push([i + 1, st.name, st.email, st.studentId, st.dept, st.phone, st.note, st.registeredAt ? formatDateTime(st.registeredAt) : '']));
  const csv = '\ufeff' + rows.map(r => r.map(cell).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${event.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'event'}-participants.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function closeAttendeesModal() {
  document.getElementById("attendeesModal").classList.add("hidden");
}

// =============================================================================
// 6. SENDING UPDATES TO STUDENTS (announcements)
// =============================================================================

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
  if (e.key === 'Escape') { closeAttendeesModal(); closeRegisterForm(); }
});
