document.addEventListener('DOMContentLoaded', () => {

  // --- 1. Mobile Menu Drawer Toggle ---
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

  if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
    });

    mobileNavLinks.forEach((link) => {
      link.addEventListener('click', () => {
        mobileMenu.classList.add('hidden');
      });
    });
  }

  // --- 2. Event Schedule Accordions ---
  const scheduleItems = document.querySelectorAll('.schedule-item');

  scheduleItems.forEach((item) => {
    item.addEventListener('click', () => {
      item.classList.toggle('active');
      const targetId = item.getAttribute('data-target');
      const targetEl = document.getElementById(targetId);

      if (targetEl) {
        targetEl.classList.toggle('hidden');
      }
    });
  });

  // --- 3. Share Event Handler ---
  const shareBtn = document.getElementById('shareBtn');

  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      if (navigator.share) {
        navigator.share({
          title: 'Future Forward: Research Summit',
          url: window.location.href,
        }).catch(() => {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(window.location.href)
          .then(() => showToast('Event link copied to clipboard!'))
          .catch(() => showToast('Could not copy the link.'));
      } else {
        showToast('Copy this page\'s address to share it.');
      }
    });
  }

  // --- 4. Get Directions Toast Handler ---
  const directionsBtn = document.getElementById('directionsBtn');

  if (directionsBtn) {
    directionsBtn.addEventListener('click', () => {
      showToast('Opening directions in Google Maps...');
      window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Kyungdong University Global Campus'), '_blank', 'noopener');
    });
  }

  // --- 5. Newsletter Subscription Form Handler ---
  const subscribeForm = document.getElementById('subscribeForm');

  if (subscribeForm) {
    subscribeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = subscribeForm.querySelector('input[type="email"]').value.trim();
      try {
        const res = await fetch(`${window.KDU_API_BASE}/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          subscribeForm.reset();
          showToast('Subscribed! Check your inbox for a welcome email.');
        } else {
          showToast(data.message || 'Could not subscribe. Please try again.');
        }
      } catch (err) {
        showToast('Subscriptions are unavailable right now. Please try again later.');
      }
    });
  }

});

// --- Toast Notification Helper Function ---
function showToast(message) {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');

  if (toast && toastMessage) {
    toastMessage.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }
}