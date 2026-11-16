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
  }

  document.querySelectorAll('form[data-endpoint]').forEach(form => {
    const button = form.querySelector('button[type="submit"]');
    const buttonHtml = button ? button.innerHTML : '';

    form.addEventListener('submit', async e => {
      e.preventDefault();
      // Use the browser's own "please fill in this field" messages
      if (!form.checkValidity()) { form.reportValidity(); return; }

      if (button) { button.disabled = true; button.textContent = 'Sending…'; }
      setStatus(form, '', '');
      try {
        const res = await fetch(`${window.KDU_API_BASE}/requests/${form.dataset.endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formToJson(form))
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(out.message || 'Could not send your request. Please try again.');
        form.reset();
        setStatus(form, out.message || 'Your request was sent.', 'success');
      } catch (err) {
        const msg = err instanceof TypeError
          ? 'Could not reach the server. Please try again in a minute (it may be waking up).'
          : err.message;
        setStatus(form, msg, 'error');
      } finally {
        if (button) { button.disabled = false; button.innerHTML = buttonHtml; }
      }
    });
  });
})();
