// Where the frontend finds the Node.js backend.
// Local development (Live Server): server.js running on this machine (npm start).
// Live site (kduevents.co.kr on GitHub Pages): server.js hosted on Render.
(function () {
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';
  window.KDU_API_BASE = isLocal
    ? 'http://localhost:5050/api'
    : 'https://kduevents.onrender.com/api';
})();
