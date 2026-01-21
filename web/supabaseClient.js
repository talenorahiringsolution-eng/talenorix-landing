/* /web/supabaseClient.js
   ✅ SUPABASE CLIENT ÚNICO (UMD)
   ✅ Sin imports, sin modules
   ✅ NO redirige, NO toca DOM, NO ejecuta lógica de páginas
   ✅ window.supabase = cliente listo para usar (auth, db, storage)
*/

(function () {
  "use strict";

  const SUPABASE_URL = "https://xslklaltpclmheapfmwi.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzbGtsYWx0cGNsbWhlYXBmbXdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxOTQzODcsImV4cCI6MjA4Mjc3MDM4N30.jLp63CfqGsQCbNO91QpQjHlWU00i95qhVZ7Mc_K1FJM";

  const STORAGE_KEY = "ths-auth";
  const CDN_UMD =
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";

  // ---------- Utils ----------
  function isClientReady(obj) {
    return !!(obj && obj.auth && typeof obj.auth.getUser === "function");
  }

  function isNamespaceReady(obj) {
    return !!(obj && typeof obj.createClient === "function");
  }

  function loadScript(src, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
      // si ya existe en el DOM, no lo vuelvas a meter
      const already = Array.from(document.scripts).some((s) => s.src === src);
      if (already) return resolve();

      const s = document.createElement("script");
      s.src = src;
      s.async = true;

      const t = setTimeout(() => {
        reject(new Error("Timeout cargando Supabase UMD: " + src));
      }, timeoutMs);

      s.onload = () => {
        clearTimeout(t);
        resolve();
      };

      s.onerror = () => {
        clearTimeout(t);
        reject(new Error("Error cargando Supabase UMD: " + src));
      };

      document.head.appendChild(s);
    });
  }

  function createClientFromNamespace(ns) {
    const client = ns.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storageKey: STORAGE_KEY,
      },
    });

    // estándar del proyecto: window.supabase ES EL CLIENTE
    window.supabase = client;
    window.__supabase = client; // debug
    window.__supabaseNamespace = ns; // debug
    return client;
  }

  async function initSupabaseClient() {
    // 1) Si ya existe cliente -> no hagas nada
    if (isClientReady(window.supabase)) return window.supabase;

    // 2) Si existe namespace UMD -> crear cliente
    if (isNamespaceReady(window.supabase)) {
      return createClientFromNamespace(window.supabase);
    }

    // 3) Si no existe nada -> cargar CDN y crear
    await loadScript(CDN_UMD);

    if (!isNamespaceReady(window.supabase)) {
      throw new Error(
        "Supabase UMD cargó pero window.supabase no es namespace. Algo lo está pisando."
      );
    }

    return createClientFromNamespace(window.supabase);
  }

  // Inicializa sin tocar UI ni redirigir
  initSupabaseClient()
    .then(() => console.log("✅ Supabase listo:", SUPABASE_URL))
    .catch((e) => console.error("❌ Supabase init error:", e));
})();