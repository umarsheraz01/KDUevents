// =============================================================================
// js/portal/navigation.js — MOVING AROUND THE PORTAL
// -----------------------------------------------------------------------------
//   • the sidebar menu (slides in on phones and tablets)
//   • navigateTo(tab): shows one tab (Overview, Discover, Dashboard…)
//   • one click handler for every card button (details, pass, delete…)
// =============================================================================

// =============================================================================
// 1. SIDEBAR AND TABS
// =============================================================================
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

// =============================================================================
// 2. CARD BUTTONS (one click handler for the whole page)
// =============================================================================
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
