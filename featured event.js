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
      } else {
        showToast('Event link copied to clipboard!');
      }
    });
  }

  // --- 4. Get Directions Toast Handler ---
  const directionsBtn = document.getElementById('directionsBtn');

  if (directionsBtn) {
    directionsBtn.addEventListener('click', () => {
      showToast('Opening directions in Google Maps...');
    });
  }

  // --- 5. Newsletter Subscription Form Handler ---
  const subscribeForm = document.getElementById('subscribeForm');

  if (subscribeForm) {
    subscribeForm.addEventListener('submit', (e) => {
      e.preventDefault();
      subscribeForm.reset();
      showToast('Subscribed to KDU Events newsletter!');
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