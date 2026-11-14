// =============================================================================
// js/config.js — WHERE THE WEBSITE FINDS THE SERVER (loaded on every page first)
// -----------------------------------------------------------------------------
// Sets window.KDU_API_BASE, which every other script uses to call the server:
//   • On your computer (Live Server / opening the file): http://localhost:5050/api
//     → start the server with "npm start" in the project folder
//   • On the live site kduevents.co.kr (GitHub Pages): the server on Render
// =============================================================================
(function () {
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';
  window.KDU_API_BASE = isLocal
    ? 'http://localhost:5050/api'
    : 'https://kduevents.onrender.com/api';
})();
