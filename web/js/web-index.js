// /web/js/main.js
(function () {
  "use strict";

  // Footer injection (only if placeholder exists)
  async function injectFooter() {
    const mount = document.getElementById("footer-placeholder");
    if (!mount) return;

    try {
      const res = await fetch("/web/web-footer.html", { cache: "no-store" });
      if (!res.ok) return;
      mount.innerHTML = await res.text();
    } catch (_) {}
  }

  // Fix video autoplay attempt (non-blocking). Keeps controls visible.
  function initHeroVideo() {
    const v = document.getElementById("twebHeroVideo");
    if (!v) return;

    // Try to start muted autoplay; if browser blocks, no error thrown to console.
    try {
      v.muted = true;
      const p = v.play();
      if (p && typeof p.catch === "function") p.catch(function () {});
    } catch (_) {}
  }

  document.addEventListener("DOMContentLoaded", function () {
    injectFooter();
    initHeroVideo();
  });
})();

