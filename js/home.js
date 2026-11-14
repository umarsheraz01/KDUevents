// =============================================================================
// js/home.js — HOMEPAGE (index.html)
// -----------------------------------------------------------------------------
// 1. Hero video slider           (the full-screen videos at the top)
// 2. Event category filter       (All / Technology / Arts & Culture / …)
// 3. Upcoming events             (cards loaded live from the database)
// 4. Newsletter sign-up          (email box + "subscribed" pop-up)
// 5. "Coming soon" links         (menu links for pages that don't exist yet)
// 6. Mobile menu button          (☰ / ✕ on phones)
//
// Needs js/config.js first (it sets window.KDU_API_BASE = the server address).
// =============================================================================


// =============================================================================
// 1. HERO VIDEO SLIDER
// Each slide shows for 6 seconds, counted from when its video actually starts
// playing (so a slow-loading video is never skipped).
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
  const slides = document.querySelectorAll('.slide');
  const nextBtn = document.getElementById('nextSlide');
  const prevBtn = document.getElementById('prevSlide');
  let currentSlide = 0;

  const SLIDE_TIME = 6000;  // how long each slide stays
  const MAX_WAIT = 12000;   // move on anyway if a video can't load
  let slideTimer = null;

  // Show one slide, play its video and pause the others
  function showSlide(index) {
    if (slides.length === 0) return;
    slides.forEach(slide => slide.classList.remove('active'));

    if (index >= slides.length) currentSlide = 0;
    else if (index < 0) currentSlide = slides.length - 1;
    else currentSlide = index;

    const activeSlide = slides[currentSlide];
    activeSlide.classList.add('active');

    // Pause videos that are no longer visible, play the active one
    slides.forEach((slide, i) => {
      const v = slide.querySelector('video');
      if (v && i !== currentSlide) v.pause();
    });
    const video = activeSlide.querySelector('video');
    if (video) {
      video.play().catch(err => console.log("Video play delayed:", err));
    }

    // Start downloading the next video so it is ready when its turn comes
    const nextVideo = slides[(currentSlide + 1) % slides.length].querySelector('video');
    if (nextVideo && nextVideo.preload !== 'auto') {
      nextVideo.preload = 'auto';
      nextVideo.load();
    }
  }

  // Start the 6-second timer once the current video is playing
  function scheduleNext() {
    clearTimeout(slideTimer);
    const video = slides[currentSlide] && slides[currentSlide].querySelector('video');
    const startTimer = () => {
      clearTimeout(slideTimer);
      slideTimer = setTimeout(() => goTo(currentSlide + 1), SLIDE_TIME);
    };
    if (!video || (!video.paused && video.readyState >= 3)) return startTimer();
    const thisSlide = currentSlide;
    video.addEventListener('playing', () => { if (currentSlide === thisSlide) startTimer(); }, { once: true });
    slideTimer = setTimeout(() => goTo(currentSlide + 1), MAX_WAIT);
  }

  function goTo(index) {
    showSlide(index);
    scheduleNext();
  }

  // ‹ and › arrow buttons
  if (nextBtn) nextBtn.addEventListener('click', () => goTo(currentSlide + 1));
  if (prevBtn) prevBtn.addEventListener('click', () => goTo(currentSlide - 1));

  // Start with the first video right away
  goTo(0);
});


// =============================================================================
// 2. EVENT CATEGORY FILTER (the tabs above "Upcoming events")
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
  const filterTabs = document.querySelectorAll('.filter-tab');

  filterTabs.forEach(tab => {
    tab.addEventListener('click', function () {
      filterTabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');

      const filterValue = this.getAttribute('data-filter');

      // Look up the cards on every click: they are loaded from the server after the page opens
      document.querySelectorAll('#homeEventsGrid .event-card').forEach(card => {
        const cardCategory = card.getAttribute('data-category');
        if (filterValue === 'all' || cardCategory === filterValue) {
          card.classList.remove('hidden');
        } else {
          card.classList.add('hidden');
        }
      });
    });
  });
});


// =============================================================================
// 3. UPCOMING EVENTS FROM THE DATABASE
// The same events the admin manages in the portal. If the server can't be
// reached, the 3 cards written in index.html stay on the page instead.
// =============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  const grid = document.getElementById('homeEventsGrid');
  if (!grid || !window.KDU_API_BASE) return;

  // Small helpers
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const origin = window.KDU_API_BASE.replace(/\/api\/?$/, '');
  // Uploaded banners are stored on the server as "/api/images/<id>"
  const imageUrl = (src) => !src ? 'assets/WhatsApp Image 2026-10-12 at 11.01.35.jpeg' : (String(src).startsWith('/api/images/') ? origin + src : src);
  // Category name -> filter tab key (data-filter="…")
  const categoryKey = (c) => ({ 'Technology': 'technology', 'Arts & Culture': 'arts', 'Entrepreneurship': 'entrepreneurship' }[c] || String(c || 'other').toLowerCase().replace(/[^a-z]+/g, '-'));

  try {
    const res = await fetch(`${window.KDU_API_BASE}/events`);
    if (!res.ok) return;
    let events = await res.json();
    if (!Array.isArray(events) || !events.length) return;

    // Upcoming first (soonest at the top), at most 6 cards
    const now = Date.now();
    const time = (e) => new Date(e.startsAt || e.date).getTime();
    const upcoming = events.filter(e => !(time(e) < now));
    events = (upcoming.length ? upcoming : events).sort((a, b) => (time(a) || 0) - (time(b) || 0)).slice(0, 6);

    // One card per event (same design as the cards written in index.html)
    grid.innerHTML = events.map(e => {
      const d = new Date(e.startsAt || e.date);
      const valid = !isNaN(d.getTime());
      const day = valid ? String(d.getDate()).padStart(2, '0') : '--';
      const month = valid ? d.toLocaleString('en-US', { month: 'short' }) : '';
      const clock = valid ? d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' }) : esc(e.date);
      const left = Math.max(0, (Number(e.seats) || 0) - (Number(e.registeredCount) || 0));
      return `
        <div class="event-card" data-category="${esc(categoryKey(e.category))}">
            <div class="event-card-img-container">
                <img src="${esc(imageUrl(e.image))}" alt="${esc(e.title)}" loading="lazy">
                <div class="date-badge"><span class="day">${day}</span><span class="month">${esc(month)}</span></div>
            </div>
            <div class="event-card-body">
                <span class="card-category">${esc(e.category)}</span>
                <h3 class="card-title">${esc(e.title)}</h3>
                <div class="card-divider"></div>
                <div class="card-info-list">
                    <span><i class="fa-regular fa-clock"></i> ${esc(clock)}</span>
                    <span><i class="fa-solid fa-location-dot"></i> ${esc(e.venue)}</span>
                </div>
                <div class="card-footer-flex">
                    <span class="spots-left">${left > 0 ? left + ' spot' + (left === 1 ? '' : 's') + ' left' : 'Fully booked'}</span>
                    <a href="portal.html?event=${encodeURIComponent(e._id)}" class="view-event-link">${left > 0 ? 'Register' : 'View'} <i class="fa-solid fa-arrow-right"></i></a>
                </div>
            </div>
        </div>`;
    }).join('');

    // Re-apply the selected filter tab to the new cards
    const active = document.querySelector('.filter-tab.active');
    if (active) active.click();
  } catch (err) {
    // Server unreachable: keep the built-in cards
  }
});


// =============================================================================
// 4. NEWSLETTER SIGN-UP
// Sends the email to the server (POST /api/subscribe), which saves it and sends
// the welcome email, then shows the result in a small pop-up.
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
  const subscribeForm = document.getElementById('subscribeForm');
  const emailInput = document.getElementById('subscriberEmail');

  // Pop-up elements
  const modalOverlay = document.getElementById('sub-modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalMessage = document.getElementById('modal-message');
  const modalCloseBtn = document.getElementById('modal-close-btn');

  function showModal(title, text, isError = false) {
    modalTitle.textContent = title;
    modalMessage.textContent = text;
    modalOverlay.classList.add('active');
  }

  function hideModal() {
    modalOverlay.classList.remove('active');
  }

  if (modalCloseBtn) modalCloseBtn.addEventListener('click', hideModal);
  if (modalOverlay) {
    // Clicking the dark background also closes the pop-up
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) hideModal();
    });
  }

  if (subscribeForm) {
    subscribeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = emailInput.value;

      try {
        const response = await fetch(`${window.KDU_API_BASE}/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await response.json();

        if (response.ok) {
          showModal('Subscribed Successfully! 🎉', 'Check your inbox for your official KDU Events welcome email.');
          emailInput.value = ''; // clear the input field
        } else {
          showModal('Notice', data.message || 'This email is already on our list!', true);
        }
      } catch (err) {
        showModal('Connection Error', 'Subscriptions are unavailable right now. Please try again later.', true);
      }
    });
  }
});


// =============================================================================
// 5. "COMING SOON" LINKS (menu items for pages that don't exist yet)
// =============================================================================
document.querySelectorAll('.coming-soon').forEach(link => {
  link.addEventListener('click', e => e.preventDefault());
});


// =============================================================================
// 6. MOBILE MENU BUTTON (☰ opens the menu, ✕ closes it)
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const mainNav = document.getElementById('mainNav');
  const hamburgerIcon = document.getElementById('hamburgerIcon');

  if (hamburgerBtn && mainNav) {
    hamburgerBtn.addEventListener('click', () => {
      mainNav.classList.toggle('active');

      // Switch the icon between bars (fa-bars) and close 'X' (fa-xmark)
      if (mainNav.classList.contains('active')) {
        hamburgerIcon.classList.remove('fa-bars');
        hamburgerIcon.classList.add('fa-xmark');
      } else {
        hamburgerIcon.classList.remove('fa-xmark');
        hamburgerIcon.classList.add('fa-bars');
      }
    });
  }
});
