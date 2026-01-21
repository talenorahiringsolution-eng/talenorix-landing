/*(function LogoutCandidatePage() {
  "use strict";

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      const supabase = window.supabase;
      if (supabase?.auth) {
        await supabase.auth.signOut();
      }
    } catch (_) {
      // ignore
    } finally {
      window.location.href = "/web/auth/login-candidate.html";
    }
  });
})();*/
/* =========================================================
   /web/auth/candidate-logout.js
   LOGOUT UNIVERSAL (independiente) — ZERO BUGS

   OBJETIVO:
   - Funciona en cualquier página que tenga el botón #btn_logout
   - No depende de candidate-information.js
   - No rompe nada si Supabase tarda en cargar
   - Anti doble ejecución + watchdog (redirige sí o sí)
   - Limpieza selectiva (sin borrar TODO el localStorage)

   REQUISITOS:
   - En el HTML, cargar:
     <script src="/web/supabaseClient.js"></script>
     <script src="/web/auth/candidate-logout.js"></script>

   CHECKLIST
   - [ ] Click Logout redirige sí o sí (máx 2.5s)
   - [ ] No se queda pegado en “Saliendo…”
   - [ ] Anti doble click / anti doble ejecución
   - [ ] signOut local + global best-effort
   - [ ] Limpia ths-auth + claves sb-* / supabase*
========================================================= */

(function () {
  "use strict";

  // ✅ Redirección final (segura y consistente)
  const REDIRECT_URL = "../auth/login-candidate.html";

  // ✅ Watchdog duro: aunque Supabase se congele, sales igual
  const WATCHDOG_MS = 2500;

  // ✅ Timeouts internos (no bloquean el redirect)
  const TIMEOUT_LOCAL_MS = 900;
  const TIMEOUT_GLOBAL_MS = 900;

  let inProgress = false;
  let redirected = false;

  /* -----------------------------
     UTIL: timeout wrapper
  ----------------------------- */
  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((resolve) => setTimeout(resolve, ms)),
    ]);
  }

  /* -----------------------------
     LIMPIEZA SELECTIVA (segura)
  ----------------------------- */
  function cleanupAuthKeys() {
    // Storage key oficial (de supabaseClient.js)
    try { localStorage.removeItem("ths-auth"); } catch (_) {}
    try { sessionStorage.removeItem("ths-auth"); } catch (_) {}

    // UI state (tabs)
    try { localStorage.removeItem("ths_candidate_active_tab"); } catch (_) {}
    try { sessionStorage.removeItem("ths_candidate_active_tab"); } catch (_) {}

    // Limpieza defensiva de tokens que a veces quedan
    try {
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        const lower = String(k).toLowerCase();
        if (
          k.startsWith("sb-") ||
          lower.includes("supabase") ||
          lower.includes("auth-token") ||
          lower.includes("access_token") ||
          lower.includes("refresh_token")
        ) {
          try { localStorage.removeItem(k); } catch (_) {}
        }
      }
    } catch (_) {}
  }

  /* -----------------------------
     REDIRECT SÍ O SÍ
  ----------------------------- */
  function safeRedirect() {
    if (redirected) return;
    redirected = true;

    try { cleanupAuthKeys(); } catch (_) {}

    try {
      window.location.replace(REDIRECT_URL);
    } catch (_) {
      try { window.location.href = REDIRECT_URL; } catch (__){}
    }
  }

  /* -----------------------------
     Espera Supabase sin colgarse
     - Usa helper si existe
     - Si no existe, intenta directo
  ----------------------------- */
  async function getSupabaseClientBestEffort() {
    try {
      if (typeof window.thsWaitForSupabase === "function") {
        // Espera poco; no puede frenar el logout
        const sb = await window.thsWaitForSupabase(1200);
        return sb || window.supabase || null;
      }
      return window.supabase || null;
    } catch (_) {
      return window.supabase || null;
    }
  }

  /* -----------------------------
     LOGOUT REAL (best-effort)
  ----------------------------- */
  async function doSignOutBestEffort() {
    const sb = await getSupabaseClientBestEffort();
    if (!sb?.auth?.signOut) return;

    // A) LOCAL
    try {
      await withTimeout(sb.auth.signOut({ scope: "local" }), TIMEOUT_LOCAL_MS);
    } catch (_) {}

    // B) GLOBAL
    try {
      await withTimeout(sb.auth.signOut({ scope: "global" }), TIMEOUT_GLOBAL_MS);
    } catch (_) {}
  }

  /* -----------------------------
     MAIN: fuerza logout
  ----------------------------- */
  async function forceLogout(btn) {
    if (inProgress) return;
    inProgress = true;

    // UI estado (no se queda pegado porque hay watchdog)
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Saliendo…";
        btn.setAttribute("aria-busy", "true");
      }
    } catch (_) {}

    const watchdog = setTimeout(safeRedirect, WATCHDOG_MS);

    try {
      await doSignOutBestEffort();
    } finally {
      clearTimeout(watchdog);
      safeRedirect();
    }
  }

  /* -----------------------------
     BIND UNIVERSAL
     - Capture: le gana a handlers viejos
     - No revienta si no existe el botón
  ----------------------------- */
  function bindLogoutButton() {
    const btn = document.getElementById("btn_logout");
    if (!btn) return;

    if (btn.dataset.thsLogoutBound === "1") return;
    btn.dataset.thsLogoutBound = "1";

    btn.addEventListener(
      "click",
      function (ev) {
        try { ev.preventDefault(); } catch (_) {}
        try { ev.stopPropagation(); } catch (_) {}
        try { ev.stopImmediatePropagation(); } catch (_) {}
        forceLogout(btn);
      },
      { capture: true }
    );
  }

  /* -----------------------------
     Anti BFCache (seguridad)
     - Evita volver atrás con sesión zombie
  ----------------------------- */
  window.addEventListener("pageshow", function (ev) {
    try {
      const nav = performance.getEntriesByType?.("navigation")?.[0];
      const isBackForward = nav?.type === "back_forward";
      if (ev?.persisted || isBackForward) window.location.reload();
    } catch (_) {}
  });

  // Init
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindLogoutButton, { once: true });
  } else {
    bindLogoutButton();
  }

  // Extra: expone función global por si otra página quiere forzar logout
  window.thsForceLogout = function () {
    forceLogout(document.getElementById("btn_logout"));
  };
})();

