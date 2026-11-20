// =============================================================================
// js/requests.js — SENDS THE "HOST AN EVENT" AND "BOOK A VENUE" FORMS
// -----------------------------------------------------------------------------
// Used by host-event.html and venue.html. Any <form data-endpoint="..."> is
// posted as JSON to  KDU_API_BASE + /requests/<endpoint>  (routes/requests.js),
// which emails the details to admin@kduevents.co.kr.
// Checkboxes that share a name (e.g. "logistics") are sent as a list.
// =============================================================================
(function () {
  function formToJson(form) {
    const data = {};
    form.querySelectorAll('input[name], select[name], textarea[name]').forEach(el => {
      if (el.type === 'checkbox') {
        if (!Array.isArray(data[el.name])) data[el.name] = [];
        if (el.checked) data[el.name].push(el.value);
      } else {
        data[el.name] = el.value.trim();
      }
    });
    return data;
  }

  function setStatus(form, text, kind) {
    const el = form.querySelector('.form-status');
    if (!el) return;
    el.textContent = text;
    el.className = 'form-status' + (kind ? ' is-' + kind : '');
    if (text) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  document.querySelectorAll('form[data-endpoint]').forEach(form => {
    const button = form.querySelector('button[type="submit"]');
    const buttonHtml = button ? button.innerHTML : '';

    form.addEventListener('submit', async e => {
      e.preventDefault();
      // Use the browser's own "please fill in this field" messages
      if (!form.checkValidity()) { form.reportValidity(); return; }

      if (button) { button.disabled = true; button.textContent = 'Sending…'; }
      setStatus(form, 'Sending your request…', 'pending');
      // The free server sleeps when idle and can take up to a minute to wake up
      const slowNote = setTimeout(() => setStatus(form, 'Still sending… the server is waking up, this can take up to a minute. Please keep this page open.', 'pending'), 5000);
      const controller = new AbortController();
      const giveUp = setTimeout(() => controller.abort(), 90000);
      try {
        const res = await fetch(`${window.KDU_API_BASE}/requests/${form.dataset.endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formToJson(form)),
          signal: controller.signal
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(out.message || 'Could not send your request. Please try again.');
        form.reset();
        setStatus(form, out.message || 'Your request was sent.', 'success');
      } catch (err) {
        const msg = err.name === 'AbortError'
          ? 'The server took too long to answer. Please try again, or email admin@kduevents.co.kr.'
          : err instanceof TypeError
            ? 'Could not reach the server. Please try again in a minute (it may be waking up).'
            : err.message;
        setStatus(form, msg, 'error');
      } finally {
        clearTimeout(slowNote);
        clearTimeout(giveUp);
        if (button) { button.disabled = false; button.innerHTML = buttonHtml; }
      }
    });
  });
})();
