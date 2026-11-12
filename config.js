// Where the frontend finds the Node.js backend.
// GitHub Pages only hosts static files, so on the live site this must point to
// wherever server.js is deployed (e.g. Render, Railway). Replace the URL below
// once the backend is hosted. Until then the live site runs in offline demo mode.
(function () {
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';
  window.KDU_API_BASE = isLocal
    ? 'http://localhost:5050/api'
    : 'https://YOUR-BACKEND-URL.onrender.com/api';
})();
