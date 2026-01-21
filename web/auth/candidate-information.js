
/* /web/auth/candidate-information.js
   A.3 IDENTIDAD — Lee public.profiles y pinta en inputs readonly
   ✅ Bulletproof contra “supabase aún no está listo”
   ✅ No toca tabs/sidebar/otros módulos
   ✅ No cambia HTML
*/
/* =========================================================
carga IDENTIDAD DEL CANDIDADO desde public.profiles
=============================================================*/
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    // Guard: evita doble init si el script se carga 2 veces
    if (window.__thsIdentityInitDone) return;
    window.__thsIdentityInitDone = true;

    // Hook: si cambia sesión/token, refresca identidad
    if (!window.__thsIdentityAuthHooked) {
      window.__thsIdentityAuthHooked = true;

      const hookAuth = () => {
        const sb = window.supabase;
        if (sb?.auth?.onAuthStateChange) {
          sb.auth.onAuthStateChange(() => {
            initIdentity().catch(() => {});
          });
        }
      };

      // Si supabase no está listo aún, lo enganchamos cuando esté
      waitForSupabaseClient(5000)
        .then(hookAuth)
        .catch(() => {});
    }

    initIdentity().catch(() => {});
  });

  /* =========================================================
     A) initIdentity()
  ========================================================= */
  async function initIdentity() {
    setIdentityStatus("Cargando identidad…", "info");

    // ✅ Espera a que window.supabase sea CLIENTE real (no namespace / undefined)
    const supabase = await waitForSupabaseClient(5000).catch(() => null);

    if (!supabase || !supabase.auth) {
      setIdentityStatus(
        "Error: Supabase no está listo. Verifica que /web/supabaseClient.js cargue antes y no tenga errores en consola.",
        "error"
      );
      return;
    }

    const authUser = await getAuthUserBulletproof(supabase);

    if (!authUser || !authUser.id) {
      // No hay sesión real → login
      window.location.replace("/web/auth/login-candidate.html");
      return;
    }

    // ✅ Trae la fila del perfil (public.profiles)
    const profile = await loadIdentityFromProfiles(supabase, authUser.id);

    // ✅ Pinta UI SIEMPRE (aunque profile venga null)
    paintIdentity(profile, authUser);

    if (!profile) {
      setIdentityStatus(
        "No existe fila en public.profiles para este usuario. Causas típicas: trigger handle_new_user no corrió, usuario creado fuera del flujo esperado, o RLS bloqueando SELECT.",
        "error"
      );
      return;
    }

    setIdentityStatus("Identidad cargada correctamente.", "success");
  }

  /* =========================================================
     B) loadIdentityFromProfiles()
  ========================================================= */
  async function loadIdentityFromProfiles(supabase, userId) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("email, first_name, middle_name, last_name, second_last_name")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        setIdentityStatus(
          `Error leyendo public.profiles: ${error.message || String(error)}`,
          "error"
        );
        return null;
      }

      return data || null;
    } catch (e) {
      setIdentityStatus(
        `Error inesperado en SELECT profiles: ${String(e?.message || e)}`,
        "error"
      );
      return null;
    }
  }

  /* =========================================================
     C) paintIdentity(profile, authUser)
  ========================================================= */
  function paintIdentity(profile, authUser) {
    const safe = (x) => (x === null || x === undefined ? "" : String(x));

    const elFirst = document.getElementById("p_first_name");
    const elMiddle = document.getElementById("p_middle_name");
    const elLast = document.getElementById("p_last_name");
    const elSecondLast = document.getElementById("p_second_last_name");
    const elEmail = document.getElementById("p_email");

    if (elFirst) elFirst.value = safe(profile?.first_name);
    if (elMiddle) elMiddle.value = safe(profile?.middle_name);
    if (elLast) elLast.value = safe(profile?.last_name);
    if (elSecondLast) elSecondLast.value = safe(profile?.second_last_name);

    const email = profile?.email || authUser?.email || "";
    if (elEmail) elEmail.value = safe(email);
  }

  /* =========================================================
     D) setIdentityStatus(msg, type)
     type: info|success|error
  ========================================================= */
  function setIdentityStatus(msg, type) {
    const el = document.getElementById("identity_status");
    if (!el) return;
    el.textContent = msg || "";
    el.dataset.type = type || "info";
  }

  /* =========================================================
     E) waitForSupabaseClient()
     - Espera a que window.supabase tenga auth.getUser (cliente real)
     - Evita bug de timing con carga async del UMD
  ========================================================= */
  function waitForSupabaseClient(timeoutMs = 5000) {
    const start = Date.now();

    return new Promise((resolve, reject) => {
      const tick = () => {
        const sb = window.supabase;

        // Cliente real
        if (sb && sb.auth && typeof sb.auth.getUser === "function") {
          return resolve(sb);
        }

        // Sigue esperando
        if (Date.now() - start >= timeoutMs) {
          return reject(
            new Error("Timeout esperando Supabase client real (auth.getUser).")
          );
        }

        setTimeout(tick, 50);
      };

      tick();
    });
  }

  /* =========================================================
     F) getAuthUserBulletproof()
     - Máx 2 intentos
     - getUser preferido, fallback getSession
  ========================================================= */
  async function getAuthUserBulletproof(supabase) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!error && data?.user?.id) return data.user;
      } catch (_) {}

      try {
        const { data, error } = await supabase.auth.getSession();
        if (!error && data?.session?.user?.id) return data.session.user;
      } catch (_) {}

      if (attempt < 2) await sleep(150);
    }
    return null;
  }
})();

/*==============================
FIN CARGA IDENTIDAD DEL CANDIDADO desde public.profiles
  =============================*/
  /*=========================================================
    TABS
  =========================================================*/
  /* ============================================================
   A.1 TABS (BULLETPROOF) — candidate-information.html
   - NO cambia HTML
   - Click + keyboard nav
   - Guarda tab activo en localStorage
   - 1 solo panel visible (hidden + is-active)
   - Actualiza #header_title
============================================================ */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    // Guard: evita doble init si el script se carga 2 veces
    if (window.__thsTabsInitDone) return;
    window.__thsTabsInitDone = true;

    initTabs();
  });

  const LS_KEY = "ths_candidate_active_tab";

  function initTabs() {
    const tabsBar = document.querySelector(".tabs-bar[role='tablist']");
    if (!tabsBar) return;

    const tabs = Array.from(tabsBar.querySelectorAll(".tab-pill[role='tab']"));
    if (!tabs.length) return;

    // bind click + keyboard
    tabs.forEach((tab, idx) => {
      if (tab.dataset.boundTabs === "1") return;
      tab.dataset.boundTabs = "1";

      tab.addEventListener("click", () => activateTab(tab, { focus: false }));

      tab.addEventListener("keydown", (e) => {
        const key = e.key;

        if (key === "ArrowRight" || key === "Right") {
          e.preventDefault();
          focusTab(tabs, idx + 1);
          return;
        }
        if (key === "ArrowLeft" || key === "Left") {
          e.preventDefault();
          focusTab(tabs, idx - 1);
          return;
        }
        if (key === "Home") {
          e.preventDefault();
          focusTab(tabs, 0);
          return;
        }
        if (key === "End") {
          e.preventDefault();
          focusTab(tabs, tabs.length - 1);
          return;
        }
        if (key === "Enter" || key === " " || key === "Spacebar") {
          e.preventDefault();
          activateTab(tab, { focus: true });
          return;
        }
      });
    });

    // Restore tab desde localStorage si existe y es válido
    const saved = (localStorage.getItem(LS_KEY) || "").trim();
    const savedTab = saved
      ? tabs.find((t) => (t.dataset.tab || "").toLowerCase() === saved.toLowerCase())
      : null;

    // Si no hay saved, busca el que ya viene marcado en HTML
    const initialTab =
      savedTab ||
      tabs.find((t) => t.classList.contains("is-active")) ||
      tabs[0];

    activateTab(initialTab, { focus: false, skipSave: true });
  }

  function focusTab(tabs, index) {
    const total = tabs.length;
    const i = ((index % total) + total) % total; // wrap
    tabs[i].focus();
  }

  function activateTab(tabEl, opts = {}) {
    const { focus = false, skipSave = false } = opts;

    const tabsBar = tabEl.closest(".tabs-bar[role='tablist']");
    if (!tabsBar) return;

    const tabs = Array.from(tabsBar.querySelectorAll(".tab-pill[role='tab']"));

    // panel target por aria-controls
    const panelId = tabEl.getAttribute("aria-controls");
    const panel = panelId ? document.getElementById(panelId) : null;

    // fallback por data-tab -> data-panel
    const key = (tabEl.dataset.tab || "").trim();
    const fallbackPanel = key
      ? document.querySelector(`.panel[data-panel="${cssEscape(key)}"]`)
      : null;

    const targetPanel = panel || fallbackPanel;

    // Apaga todos tabs + panels
    tabs.forEach((t) => {
      t.classList.remove("is-active");
      t.setAttribute("aria-selected", "false");
      t.tabIndex = -1;
    });

    const allPanels = Array.from(document.querySelectorAll(".panel[role='tabpanel']"));
    allPanels.forEach((p) => {
      p.classList.remove("is-active");
      p.hidden = true;
    });

    // Enciende el seleccionado
    tabEl.classList.add("is-active");
    tabEl.setAttribute("aria-selected", "true");
    tabEl.tabIndex = 0;

    if (targetPanel) {
      targetPanel.classList.add("is-active");
      targetPanel.hidden = false;
    }

    // Persist
    if (!skipSave && key) {
      try {
        localStorage.setItem(LS_KEY, key);
      } catch (_) {}
    }

    // Header title
    setHeaderTitleFromTab(tabEl);

    if (focus) tabEl.focus();
  }

  function setHeaderTitleFromTab(tabEl) {
    const header = document.getElementById("header_title");
    if (!header) return;

    const label = (tabEl.textContent || "").trim();
    if (!label) return;

    // Mantén tu estilo corporativo
    header.textContent = `Talenorix Hiring Solutions · Perfil · ${label}`;
  }

  function cssEscape(s) {
    // Compatibilidad: CSS.escape no existe en algunos browsers viejos
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9\-_]/g, "\\$&");
  }
})();
/*==============================
FIN TABS
  =============================*/
  /*==============================
FOTO DEL PERFIL
  =============================*/
/*==============================
A.2 FOTO — Upload / Preview / Remove (CERO BUGS)
Bucket: candidate-photos (privado)
Tabla: public.candidate_profiles.photo_path
UI IDs:
  #photo_preview, #photo_file, #btn_upload_photo, #btn_remove_photo, #photo_status

Reglas:
- JPG / PNG / WEBP
- Máx 2.5MB
- Storage path SIEMPRE: "<uid>/profile.<ext>"
- DB photo_path SIEMPRE: "<uid>/profile.<ext>"  (SIN prefijo del bucket)
==============================*/
(function () {
  "use strict";

  const BUCKET = "candidate-photos";
  const MAX_BYTES = 2.5 * 1024 * 1024; // 2.5MB
  const SIGNED_URL_TTL = 60 * 60; // 1 hora

  let busy = false;

  document.addEventListener("DOMContentLoaded", () => {
    // Guard para evitar doble init si el script se carga 2 veces
    if (window.__thsPhotoInitDone) return;
    window.__thsPhotoInitDone = true;

    initPhoto().catch((e) => console.error("[PHOTO] init error:", e));
  });

  async function initPhoto() {
    const img = document.getElementById("photo_preview");
    const input = document.getElementById("photo_file");
    const btnUpload = document.getElementById("btn_upload_photo");
    const btnRemove = document.getElementById("btn_remove_photo");
    const status = document.getElementById("photo_status");

    // Si falta UI, no crashea
    if (!img || !input || !btnUpload || !btnRemove || !status) return;

    setStatus(status, "Listo para subir tu foto.", "info");

    const supabase = await waitForSupabaseClient(5000).catch(() => null);
    if (!supabase?.auth || !supabase?.storage) {
      setStatus(
        status,
        "Error: Supabase no está disponible. Revisa que /web/supabaseClient.js cargue ANTES (sin errores en consola).",
        "error"
      );
      return;
    }

    const authUser = await getAuthUserBulletproof(supabase);
    if (!authUser?.id) {
      window.location.replace("/web/auth/login-candidate.html");
      return;
    }

    // 1) Cargar foto existente (si hay photo_path en DB)
    await loadExistingPhoto({ supabase, userId: authUser.id, img, status });

    // 2) Preview local al seleccionar archivo
    input.addEventListener("change", () => {
      try {
        const file = input.files?.[0];
        if (!file) return;

        const v = validateFile(file);
        if (!v.ok) {
          input.value = "";
          setStatus(status, v.msg, "error");
          return;
        }

        // Preview local
        const objUrl = URL.createObjectURL(file);
        img.src = objUrl;
        img.onload = () => {
          try { URL.revokeObjectURL(objUrl); } catch (_) {}
        };

        setStatus(status, "Archivo seleccionado. Presiona “Subir foto”.", "info");
      } catch (e) {
        console.error("[PHOTO] preview error:", e);
      }
    });

    // 3) UPLOAD
    btnUpload.addEventListener("click", async () => {
      if (busy) return;
      busy = true;

      lockUI(btnUpload, btnRemove, true, "Subiendo…");

      try {
        const file = input.files?.[0];
        if (!file) {
          setStatus(status, "Selecciona un archivo primero.", "error");
          return;
        }

        const v = validateFile(file);
        if (!v.ok) {
          setStatus(status, v.msg, "error");
          return;
        }

        setStatus(status, "Subiendo foto…", "info");

        // ext seguro por MIME
        const ext = extFromMime(file.type);
        const storagePath = `${authUser.id}/profile.${ext}`; // ✅ path REAL en storage

        // Si existía una foto anterior (cualquier extensión), la borramos
        await removeAnyOldProfilePhotos(supabase, authUser.id);

        // Upload (upsert true para sobrescribir)
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, file, {
            cacheControl: "3600",
            upsert: true,
            contentType: file.type,
          });

        if (upErr) {
          setStatus(status, `Error subiendo foto: ${upErr.message}`, "error");
          return;
        }

        // Guardar photo_path en DB (SIEMPRE "<uid>/profile.ext")
        const saved = await savePhotoPathDb(supabase, authUser.id, storagePath, status);
        if (!saved) {
          // si DB falló, elimina archivo para no dejar basura
          try { await supabase.storage.from(BUCKET).remove([storagePath]); } catch (_) {}
          return;
        }

        // Crear Signed URL y pintar preview real
        const signedUrl = await createSignedUrlSafe(supabase, storagePath);
        if (signedUrl) img.src = signedUrl;

        setStatus(status, "Foto subida correctamente ✅", "success");
        input.value = "";
      } catch (err) {
        console.error("[PHOTO] upload error:", err);
        setStatus(status, `Error inesperado: ${stringifyErr(err)}`, "error");
      } finally {
        lockUI(btnUpload, btnRemove, false, "Subir foto");
        busy = false;
      }
    });

    // 4) REMOVE
    btnRemove.addEventListener("click", async () => {
      if (busy) return;
      busy = true;

      lockUI(btnUpload, btnRemove, true, "Quitando…");

      try {
        setStatus(status, "Quitando foto…", "info");

        // Buscar path actual en DB
        const dbPath = await getCurrentPhotoPathDb(supabase, authUser.id);
        const storagePath = normalizeDbPathToStoragePath(dbPath);

        // Borrar del bucket (si existe en DB)
        if (storagePath) {
          try {
            await supabase.storage.from(BUCKET).remove([storagePath]);
          } catch (_) {}
        } else {
          // Si DB no tenía, igual intenta borrar restos por seguridad
          await removeAnyOldProfilePhotos(supabase, authUser.id);
        }

        // photo_path = NULL en DB
        const { error: dbErr } = await supabase
          .from("candidate_profiles")
          .upsert({ user_id: authUser.id, photo_path: null }, { onConflict: "user_id" });

        if (dbErr) {
          setStatus(status, `Error actualizando DB: ${dbErr.message}`, "error");
          return;
        }

        // Limpia UI
        img.removeAttribute("src");
        input.value = "";
        setStatus(status, "Foto eliminada ✅", "success");
      } catch (err) {
        console.error("[PHOTO] remove error:", err);
        setStatus(status, `Error removiendo foto: ${stringifyErr(err)}`, "error");
      } finally {
        lockUI(btnUpload, btnRemove, false, "Subir foto");
        busy = false;
      }
    });
  }

  // =========================================================
  // DB helpers
  // =========================================================
  async function savePhotoPathDb(supabase, userId, storagePath, statusEl) {
    try {
      const uid = String(userId || "").trim();

      // Forzar SIEMPRE "<uid>/profile.ext" (sin prefijo bucket)
      const fixed = String(storagePath || "")
        .trim()
        .replace(/^\/+/, "")
        .replace(/^candidate-photos\//, "");

      const finalPath = fixed.startsWith(uid + "/") ? fixed : `${uid}/${fixed.split("/").pop() || "profile.jpg"}`;

      const { error } = await supabase
        .from("candidate_profiles")
        .upsert({ user_id: uid, photo_path: finalPath }, { onConflict: "user_id" });

      if (!error) return true;

      setStatus(statusEl, `Subida OK, pero DB falló: ${error.message}`, "error");
      return false;
    } catch (e) {
      setStatus(statusEl, `Error guardando en DB: ${stringifyErr(e)}`, "error");
      return false;
    }
  }

  async function getCurrentPhotoPathDb(supabase, userId) {
    try {
      const { data, error } = await supabase
        .from("candidate_profiles")
        .select("photo_path")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) return null;
      return data?.photo_path || null;
    } catch (_) {
      return null;
    }
  }

  async function loadExistingPhoto({ supabase, userId, img, status }) {
    try {
      setStatus(status, "Cargando foto…", "info");

      const dbPath = await getCurrentPhotoPathDb(supabase, userId);
      if (!dbPath) {
        setStatus(status, "Aún no has subido una foto.", "info");
        return;
      }

      const storagePath = normalizeDbPathToStoragePath(dbPath);
      if (!storagePath) {
        setStatus(status, "Foto existe pero el path está vacío/dañado.", "error");
        return;
      }

      const signedUrl = await createSignedUrlSafe(supabase, storagePath);
      if (!signedUrl) {
        setStatus(status, "Foto existe pero no se pudo generar URL firmada.", "error");
        return;
      }

      img.src = signedUrl;
      setStatus(status, "Foto cargada ✅", "success");
    } catch (err) {
      console.error("[PHOTO] loadExistingPhoto error:", err);
      setStatus(status, `Error cargando foto: ${stringifyErr(err)}`, "error");
    }
  }

  async function createSignedUrlSafe(supabase, storagePath) {
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(storagePath, SIGNED_URL_TTL);

      if (error) return null;
      return data?.signedUrl || null;
    } catch (_) {
      return null;
    }
  }

  // =========================================================
  // Storage helpers
  // =========================================================
  async function removeAnyOldProfilePhotos(supabase, userId) {
    // Limpieza agresiva: borra cualquier extensión común
    const uid = String(userId || "").trim();
    const candidates = [
      `${uid}/profile.jpg`,
      `${uid}/profile.jpeg`,
      `${uid}/profile.png`,
      `${uid}/profile.webp`,
    ];

    try {
      await supabase.storage.from(BUCKET).remove(candidates);
    } catch (_) {}
  }

  // Acepta dbPath con o sin prefijo "candidate-photos/"
  function normalizeDbPathToStoragePath(dbPath) {
    if (!dbPath) return null;
    const p = String(dbPath).trim().replace(/^\/+/, "");
    if (!p) return null;

    const prefix = `${BUCKET}/`;
    return p.startsWith(prefix) ? p.slice(prefix.length) : p;
  }

  // =========================================================
  // UI helpers
  // =========================================================
  function setStatus(el, msg, type) {
    if (!el) return;
    el.textContent = msg || "";
    el.dataset.type = type || "info";
  }

  function lockUI(btnUpload, btnRemove, locked, uploadLabel) {
    try {
      btnUpload.disabled = !!locked;
      btnRemove.disabled = !!locked;

      if (locked) {
        btnUpload.dataset.prevText = btnUpload.textContent || "Subir foto";
        btnUpload.textContent = uploadLabel || "Procesando…";
        btnUpload.setAttribute("aria-busy", "true");
      } else {
        btnUpload.textContent = btnUpload.dataset.prevText || "Subir foto";
        btnUpload.removeAttribute("aria-busy");
      }
    } catch (_) {}
  }

  function validateFile(file) {
    if (!file) return { ok: false, msg: "Archivo inválido." };
    if (file.size > MAX_BYTES) return { ok: false, msg: "Archivo demasiado grande. Máximo 2.5MB." };

    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) return { ok: false, msg: "Tipo no permitido. Solo JPG, PNG o WEBP." };

    return { ok: true, msg: "OK" };
  }

  function extFromMime(mime) {
    switch (mime) {
      case "image/jpeg": return "jpg";  // normalizamos jpeg -> jpg
      case "image/png": return "png";
      case "image/webp": return "webp";
      default: return "jpg";
    }
  }

  function stringifyErr(err) {
    try {
      if (!err) return "desconocido";
      if (typeof err === "string") return err;
      if (err.message) return err.message;
      return JSON.stringify(err);
    } catch (_) {
      return "desconocido";
    }
  }

  // =========================================================
  // Auth + Supabase bulletproof (AISLADO)
  // =========================================================
  function waitForSupabaseClient(timeoutMs = 5000) {
    const start = Date.now();

    return new Promise((resolve, reject) => {
      const tick = () => {
        const sb = window.supabase;

        // cliente real
        if (sb && sb.auth && typeof sb.auth.getUser === "function") return resolve(sb);

        if (Date.now() - start >= timeoutMs) {
          return reject(new Error("Timeout esperando Supabase client real (auth.getUser)."));
        }
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  async function getAuthUserBulletproof(supabase) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!error && data?.user?.id) return data.user;
      } catch (_) {}

      try {
        const { data, error } = await supabase.auth.getSession();
        if (!error && data?.session?.user?.id) return data.session.user;
      } catch (_) {}

      if (attempt < 2) await sleep(150);
    }
    return null;
  }
})();


  /*==============================
FIN FOTO DE PERFIL
  =============================*/
  /*==============================
TITULAR Y OBJETIVO PROFESIONAL
  =============================*/
/*==============================
A.4 TITULAR Y CONTACTO — Load / Save (CERO BUGS)
Tabla: public.candidate_profiles
Campos: headline, summary, phone, whatsapp
UI IDs:
  #cp_headline, #cp_summary, #cp_phone, #cp_whatsapp
  #btn_save_profile, #profile_status
Extra:
  #btn_finish_profile (opcional)
==============================*/
(function () {
  "use strict";

  let saving = false;

  document.addEventListener("DOMContentLoaded", () => {
    // Guard: evita doble init si el script se carga 2 veces
    if (window.__thsA4ProfileBasicsInitDone) return;
    window.__thsA4ProfileBasicsInitDone = true;

    initA4ProfileBasics().catch((e) => console.error("[A4] init error:", e));
  });

  async function initA4ProfileBasics() {
    const elHeadline = document.getElementById("cp_headline");
    const elSummary = document.getElementById("cp_summary");
    const elPhone = document.getElementById("cp_phone");
    const elWhatsapp = document.getElementById("cp_whatsapp");
    const btnSave = document.getElementById("btn_save_profile");
    const status = document.getElementById("profile_status");
    const btnFinish = document.getElementById("btn_finish_profile"); // opcional

    // Si falta UI, no crashea
    if (!elHeadline || !elSummary || !elPhone || !elWhatsapp || !btnSave || !status) return;

    // Bind guard por botón (evita doble addEventListener)
    if (btnSave.dataset.boundA4 === "1") return;
    btnSave.dataset.boundA4 = "1";

    // Supabase bulletproof
    const supabase = await waitForSupabaseClient(5000).catch(() => null);
    if (!supabase?.auth) {
      setStatus(
        status,
        "Error: Supabase no está listo. Verifica que /web/supabaseClient.js cargue ANTES (sin errores en consola).",
        "error"
      );
      return;
    }

    const authUser = await getAuthUserBulletproof(supabase);
    if (!authUser?.id) {
      window.location.replace("/web/auth/login-candidate.html");
      return;
    }

    // 1) Cargar datos existentes
    await loadProfileBasics(supabase, authUser.id, {
      elHeadline,
      elSummary,
      elPhone,
      elWhatsapp,
      status,
    });

    // 2) Guardar
    btnSave.addEventListener("click", async () => {
      if (saving) return;
      saving = true;

      lockButton(btnSave, true, "Guardando…");
      setStatus(status, "Guardando…", "info");

      try {
        await nextPaint();

        const payload = readUI({
          elHeadline,
          elSummary,
          elPhone,
          elWhatsapp,
        });

        const v = validate(payload);
        if (!v.ok) {
          setStatus(status, v.msg, "error");
          return;
        }

        const ok = await upsertCandidateProfiles(supabase, authUser.id, payload, status);
        if (!ok) return;

        setStatus(status, "Cambios guardados ✅", "success");
      } catch (err) {
        console.error("[A4] save error:", err);
        setStatus(status, `Error inesperado: ${stringifyErr(err)}`, "error");
      } finally {
        lockButton(btnSave, false, "Guardar cambios");
        saving = false;
      }
    });

    // 3) Finalizar perfil (opcional)
    if (btnFinish && btnFinish.dataset.boundA4Finish !== "1") {
      btnFinish.dataset.boundA4Finish = "1";
      btnFinish.addEventListener("click", async () => {
        // Guardar primero silenciosamente, luego redirigir donde tú quieras
        if (saving) return;
        saving = true;

        lockButton(btnFinish, true, "Finalizando…");
        try {
          const payload = readUI({ elHeadline, elSummary, elPhone, elWhatsapp });
          const v = validate(payload);
          if (!v.ok) {
            setStatus(status, v.msg, "error");
            return;
          }

          const ok = await upsertCandidateProfiles(supabase, authUser.id, payload, status);
          if (!ok) return;

          setStatus(status, "Perfil actualizado ✅", "success");

          // ✅ Aquí NO te invento ruta.
          // Si ya tienes un flujo, déjalo como está.
          // Puedes cambiarlo por tu dashboard real cuando quieras:
          // window.location.replace("/web/auth/candidate-dashboard.html");
        } catch (err) {
          console.error("[A4] finish error:", err);
          setStatus(status, `Error inesperado: ${stringifyErr(err)}`, "error");
        } finally {
          lockButton(btnFinish, false, "Finalizar perfil");
          saving = false;
        }
      });
    }
  }

  // =========================================================
  // LOAD
  // =========================================================
  async function loadProfileBasics(supabase, userId, ui) {
    const { elHeadline, elSummary, elPhone, elWhatsapp, status } = ui;

    setStatus(status, "Cargando…", "info");

    try {
      const { data, error } = await supabase
        .from("candidate_profiles")
        .select("headline, summary, phone, whatsapp")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        // RLS o query error
        if (isRlsBlocked(error)) {
          setStatus(
            status,
            "Acceso denegado por políticas (RLS). Verifica policies en candidate_profiles para SELECT/UPDATE por user_id.",
            "error"
          );
          return;
        }
        setStatus(status, `Error cargando datos: ${error.message}`, "error");
        return;
      }

      // Si no existe fila, no es error: el usuario aún no ha guardado nada
      paintProfileBasics(data || null, { elHeadline, elSummary, elPhone, elWhatsapp });

      setStatus(status, data ? "Datos cargados ✅" : "Listo. Completa tu información y guarda.", "success");
    } catch (e) {
      setStatus(status, `Error inesperado cargando: ${stringifyErr(e)}`, "error");
    }
  }

  function paintProfileBasics(row, ui) {
    const safe = (x) => (x === null || x === undefined ? "" : String(x));

    ui.elHeadline.value = safe(row?.headline);
    ui.elSummary.value = safe(row?.summary);
    ui.elPhone.value = safe(row?.phone);
    ui.elWhatsapp.value = safe(row?.whatsapp);
  }

  // =========================================================
  // SAVE
  // =========================================================
  function readUI(ui) {
    return {
      headline: (ui.elHeadline.value || "").trim(),
      summary: (ui.elSummary.value || "").trim(),
      phone: (ui.elPhone.value || "").trim(),
      whatsapp: (ui.elWhatsapp.value || "").trim(),
    };
  }

  function validate(p) {
    // límites (ajustables)
    if (p.headline.length > 160) return { ok: false, msg: "Titular demasiado largo (máx 160 caracteres)." };
    if (p.summary.length > 4000) return { ok: false, msg: "Resumen demasiado largo (máx 4000 caracteres)." };
    if (p.phone.length > 40) return { ok: false, msg: "Teléfono demasiado largo (máx 40 caracteres)." };
    if (p.whatsapp.length > 40) return { ok: false, msg: "WhatsApp demasiado largo (máx 40 caracteres)." };
    return { ok: true, msg: "OK" };
  }

  async function upsertCandidateProfiles(supabase, userId, payload, statusEl) {
    try {
      const uid = String(userId || "").trim();

      const { data, error } = await supabase
        .from("candidate_profiles")
        .upsert(
          {
            user_id: uid,
            headline: payload.headline || null,
            summary: payload.summary || null,
            phone: payload.phone || null,
            whatsapp: payload.whatsapp || null,
          },
          { onConflict: "user_id" }
        )
        .select("user_id")
        .maybeSingle();

      if (error) {
        if (isRlsBlocked(error)) {
          setStatus(
            statusEl,
            "RLS bloqueó el guardado. Policy requerida: user_id = auth.uid() para INSERT/UPDATE.",
            "error"
          );
          return false;
        }
        setStatus(statusEl, `Error guardando: ${error.message}`, "error");
        return false;
      }

      if (!data?.user_id) {
        setStatus(statusEl, "Guardado incompleto: no se devolvió confirmación.", "error");
        return false;
      }

      return true;
    } catch (e) {
      setStatus(statusEl, `Error inesperado guardando: ${stringifyErr(e)}`, "error");
      return false;
    }
  }

  // =========================================================
  // UI helpers
  // =========================================================
  function setStatus(el, msg, type) {
    if (!el) return;
    el.textContent = msg || "";
    el.dataset.type = type || "info";
  }

  function lockButton(btn, locked, label) {
    try {
      btn.disabled = !!locked;
      if (locked) {
        btn.dataset.prevText = btn.textContent || "";
        btn.textContent = label || "Procesando…";
        btn.setAttribute("aria-busy", "true");
      } else {
        btn.textContent = btn.dataset.prevText || btn.textContent || "Guardar";
        btn.removeAttribute("aria-busy");
      }
    } catch (_) {}
  }

  function nextPaint() {
    return new Promise((r) => requestAnimationFrame(() => r()));
  }

  // =========================================================
  // Security / RLS detection
  // =========================================================
  function isRlsBlocked(err) {
    const code = String(err?.code || "");
    const msg = String(err?.message || "").toLowerCase();

    // PostgREST codes comunes:
    // 42501 insufficient_privilege
    // PGRST116 etc varía según contexto
    if (code === "42501") return true;

    // fallback por mensaje
    return (
      msg.includes("permission denied") ||
      msg.includes("violates row-level security") ||
      msg.includes("rls") ||
      msg.includes("policy")
    );
  }

  // =========================================================
  // Supabase bulletproof
  // =========================================================
  function waitForSupabaseClient(timeoutMs = 5000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const tick = () => {
        const sb = window.supabase;
        if (sb && sb.auth && typeof sb.auth.getUser === "function") return resolve(sb);

        if (Date.now() - start >= timeoutMs) {
          return reject(new Error("Timeout esperando Supabase client real (auth.getUser)."));
        }
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  async function getAuthUserBulletproof(supabase) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!error && data?.user?.id) return data.user;
      } catch (_) {}

      try {
        const { data, error } = await supabase.auth.getSession();
        if (!error && data?.session?.user?.id) return data.session.user;
      } catch (_) {}

      if (attempt < 2) await sleep(150);
    }
    return null;
  }

  function stringifyErr(err) {
    try {
      if (!err) return "desconocido";
      if (typeof err === "string") return err;
      if (err.message) return err.message;
      return JSON.stringify(err);
    } catch (_) {
      return "desconocido";
    }
  }
})();
/*==============================
FIN TITULAR Y OBJETIVO PROFESIONAL
  =============================*/
  /* =========================================================
   A.5 UBICACIÓN — País → Estado + Address (CERO BUGS)
   Tablas: public.places (countries), public.states, public.candidate_profiles
   UI IDs (NO CAMBIAR HTML):
     #cp_country_place_id, #cp_state_id, #cp_address
     #btn_save_location, #location_status

   Garantías:
   - No rompe si faltan elementos
   - Multiusuario: SIEMPRE filtra por authUser.id
   - RLS-aware: detecta RLS/401/403 y lo reporta claro
   - Race-safe: si cambias país rápido, solo pinta el último request
   - No cities / no city_id
========================================================= */
(function () {
  "use strict";

  let saving = false;
  let statesReqId = 0;
  let countriesLoaded = false;

  const MAX_ADDRESS = 240;

  document.addEventListener("DOMContentLoaded", () => {
    initA5Location().catch((e) => setLocationStatus(`A.5 init falló: ${errMsg(e)}`, "error"));
  });

  async function initA5Location() {
    const selCountry = document.getElementById("cp_country_place_id");
    const selState = document.getElementById("cp_state_id");
    const addr = document.getElementById("cp_address");
    const btn = document.getElementById("btn_save_location");
    const status = document.getElementById("location_status");

    if (!selCountry || !selState || !addr || !btn || !status) return;

    // Evita doble bind
    bindCountryChangeOnce(selCountry, selState);
    bindSaveLocationOnce(btn);

    // Estado base UI
    if (!countriesLoaded) {
      resetSelect(selCountry, "Selecciona un país");
      countriesLoaded = true;
    }

    resetSelect(selState, "Selecciona un estado");
    selState.disabled = true;

    setLocationStatus("Cargando países…", "info");

    // Supabase listo o falla claro
    const supabase = await waitForSupabaseClient(5000).catch(() => null);
    if (!supabase?.auth) {
      setLocationStatus(
        "Error: Supabase no está disponible. Verifica que /web/supabaseClient.js cargue ANTES.",
        "error"
      );
      return;
    }

    const authUser = await getAuthUserBulletproofA5(supabase);
    if (!authUser?.id) {
      window.location.replace("/web/auth/login-candidate.html");
      return;
    }

    // 1) Cargar catálogo de países
    await loadCountries(supabase, selCountry);

    // 2) Cargar ubicación guardada (para preseleccionar)
    const row = await loadLocationFromCandidateProfiles(supabase, authUser.id);

    const countryId = row?.country_place_id ? String(row.country_place_id) : "";
    const stateId = row?.state_id ? String(row.state_id) : "";
    const address = row?.address ? String(row.address) : "";

    addr.value = address;

    if (countryId) {
      selCountry.value = countryId;
      await loadStates(supabase, countryId, stateId || null, selState);
    } else {
      resetSelect(selState, "Selecciona un estado");
      selState.disabled = true;
      setLocationStatus("Selecciona tu país y estado/provincia y guarda.", "info");
    }
  }

  /* ==========================
     BIND: País → Estados
  ========================== */
  function bindCountryChangeOnce(selCountry, selState) {
    if (selCountry.dataset.boundA5Country === "1") return;
    selCountry.dataset.boundA5Country = "1";

    selCountry.addEventListener("change", async () => {
      const countryVal = String(selCountry.value || "").trim();

      resetSelect(selState, "Selecciona un estado");
      selState.disabled = true;

      if (!countryVal) {
        setLocationStatus("Selecciona un país para habilitar estados.", "info");
        return;
      }

      try {
        const supabase = await waitForSupabaseClient(5000).catch(() => null);
        if (!supabase?.auth) {
          setLocationStatus("Error: Supabase no está listo.", "error");
          return;
        }

        await loadStates(supabase, countryVal, null, selState);
      } catch (e) {
        setLocationStatus(`Error al cambiar país: ${errMsg(e)}`, "error");
      }
    });
  }

  /* ==========================
     BIND: Guardar Ubicación
  ========================== */
  function bindSaveLocationOnce(btn) {
    if (btn.dataset.boundA5Save === "1") return;
    btn.dataset.boundA5Save = "1";

    btn.addEventListener("click", async () => {
      await saveLocationFromUI();
    });
  }

  /* ==========================
     LOAD COUNTRIES
  ========================== */
  async function loadCountries(supabase, selCountry) {
    try {
      // No recargues si ya tiene más de 1 opción real
      if (selCountry.options && selCountry.options.length > 1) {
        setLocationStatus("Países listos ✅", "success");
        return;
      }

      // places tiene type default 'country' (tu esquema)
      const { data, error } = await supabase
        .from("places")
        .select("id, name, type")
        .eq("type", "country")
        .order("name", { ascending: true });

      if (error) {
        if (isRlsBlocked(error)) {
          setLocationStatus(
            `RLS bloquea SELECT places. Policy requerida: lectura pública para países. Detalle: ${errMsg(error)}`,
            "error"
          );
          return;
        }
        setLocationStatus(`Error cargando países: ${errMsg(error)}`, "error");
        return;
      }

      const rows = Array.isArray(data) ? data : [];

      resetSelect(selCountry, "Selecciona un país");

      if (rows.length === 0) {
        setLocationStatus(
          "No hay países para mostrar. Revisa si public.places está poblada y type='country'.",
          "error"
        );
        return;
      }

      for (const r of rows) {
        selCountry.appendChild(makeOption(String(r.id), r.name));
      }

      setLocationStatus(`Países cargados ✅ (${rows.length})`, "success");
    } catch (e) {
      setLocationStatus(`Error loadCountries: ${errMsg(e)}`, "error");
    }
  }

  /* ==========================
     LOAD STATES (Race-safe)
  ========================== */
  async function loadStates(supabase, countryIdStr, preselectStateIdStr, selState) {
    const localReqId = ++statesReqId;

    try {
      resetSelect(selState, "Cargando estados…");
      selState.disabled = true;

      const countryId = parseIdOrNull(countryIdStr);
      if (!countryId) {
        resetSelect(selState, "Selecciona un estado");
        selState.disabled = true;
        setLocationStatus("País inválido. Selecciona de nuevo.", "error");
        return;
      }

      const { data, error } = await supabase
        .from("states")
        .select("id, name, country_place_id")
        .eq("country_place_id", countryId)
        .order("name", { ascending: true });

      // Race-safe: ignora respuestas viejas
      if (localReqId !== statesReqId) return;

      if (error) {
        if (isRlsBlocked(error)) {
          setLocationStatus(
            `RLS bloquea SELECT states. Policy requerida: lectura pública para estados. Detalle: ${errMsg(error)}`,
            "error"
          );
          resetSelect(selState, "Selecciona un estado");
          selState.disabled = true;
          return;
        }
        setLocationStatus(`Error cargando estados: ${errMsg(error)}`, "error");
        resetSelect(selState, "Selecciona un estado");
        selState.disabled = true;
        return;
      }

      const rows = Array.isArray(data) ? data : [];
      resetSelect(selState, "Selecciona un estado");

      // habilita incluso si no hay estados (UX claro)
      selState.disabled = false;

      for (const r of rows) {
        selState.appendChild(makeOption(String(r.id), r.name));
      }

      if (preselectStateIdStr) {
        selState.value = String(preselectStateIdStr);
      }

      setLocationStatus(`Estados listos ✅ (${rows.length}). Guarda por sección.`, "info");
    } catch (e) {
      if (localReqId !== statesReqId) return;
      setLocationStatus(`Error loadStates: ${errMsg(e)}`, "error");
      resetSelect(selState, "Selecciona un estado");
      selState.disabled = true;
    }
  }

  /* ==========================
     LOAD FROM candidate_profiles
  ========================== */
  async function loadLocationFromCandidateProfiles(supabase, userId) {
    try {
      setLocationStatus("Cargando ubicación guardada…", "info");

      const { data, error } = await supabase
        .from("candidate_profiles")
        .select("country_place_id, state_id, address")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        if (isRlsBlocked(error)) {
          setLocationStatus(
            `RLS bloquea SELECT candidate_profiles. Policy requerida: user_id = auth.uid(). Detalle: ${errMsg(error)}`,
            "error"
          );
          return null;
        }
        setLocationStatus(`Error cargando ubicación: ${errMsg(error)}`, "error");
        return null;
      }

      if (!data) {
        setLocationStatus("No hay ubicación guardada aún. Se creará al guardar.", "info");
        return null;
      }

      setLocationStatus("Ubicación cargada ✅", "success");
      return data;
    } catch (e) {
      setLocationStatus(`Error loadLocationFromCandidateProfiles: ${errMsg(e)}`, "error");
      return null;
    }
  }

  /* ==========================
     SAVE
  ========================== */
  async function saveLocationFromUI() {
    const btn = document.getElementById("btn_save_location");
    const selCountry = document.getElementById("cp_country_place_id");
    const selState = document.getElementById("cp_state_id");
    const addr = document.getElementById("cp_address");

    if (!selCountry || !selState || !addr) {
      setLocationStatus("Error UI: faltan campos de Ubicación en el DOM.", "error");
      return;
    }

    if (saving) return;
    saving = true;

    try {
      const supabase = await waitForSupabaseClient(5000).catch(() => null);
      if (!supabase?.auth) {
        setLocationStatus("Error: Supabase no está listo.", "error");
        return;
      }

      setLocationStatus("Guardando ubicación…", "info");
      await nextPaint();

      if (btn) btn.disabled = true;

      const authUser = await getAuthUserBulletproofA5(supabase);
      if (!authUser?.id) {
        window.location.replace("/web/auth/login-candidate.html");
        return;
      }

      const countryId = parseIdOrNull(String(selCountry.value || ""));
      if (!countryId) {
        setLocationStatus("País es requerido. Selecciona un país.", "error");
        return;
      }

      const stateId = parseIdOrNull(String(selState.value || "")); // opcional
      const address = String(addr.value || "").trim();

      if (address.length > MAX_ADDRESS) {
        setLocationStatus(`Dirección supera ${MAX_ADDRESS} caracteres.`, "error");
        return;
      }

      const payload = {
        user_id: authUser.id,
        country_place_id: countryId,
        state_id: stateId, // puede ser null
        address: address || null,
      };

      const { data, error } = await supabase
        .from("candidate_profiles")
        .upsert(payload, { onConflict: "user_id" })
        .select("country_place_id, state_id, address")
        .maybeSingle();

      if (error) {
        if (isRlsBlocked(error)) {
          setLocationStatus(
            `RLS bloquea UPSERT candidate_profiles. Policy requerida: INSERT/UPDATE where user_id = auth.uid(). Detalle: ${errMsg(error)}`,
            "error"
          );
          return;
        }
        setLocationStatus(`Error guardando ubicación: ${errMsg(error)}`, "error");
        return;
      }

      const stamp = new Date();
      const hh = String(stamp.getHours()).padStart(2, "0");
      const mm = String(stamp.getMinutes()).padStart(2, "0");

      addr.value = String(data?.address ?? address ?? "");
      setLocationStatus(`Ubicación guardada ✅ (${hh}:${mm}).`, "success");
    } catch (e) {
      setLocationStatus(`Error al guardar ubicación: ${errMsg(e)}`, "error");
    } finally {
      saving = false;
      const btn2 = document.getElementById("btn_save_location");
      if (btn2) btn2.disabled = false;
    }
  }

  /* ==========================
     STATUS
  ========================== */
  function setLocationStatus(msg, type) {
    const el = document.getElementById("location_status");
    if (!el) return;
    el.textContent = String(msg ?? "");
    el.dataset.type = type || "info";
  }

  /* ==========================
     Helpers
  ========================== */
  function makeOption(value, label) {
    const opt = document.createElement("option");
    opt.value = String(value ?? "");
    opt.textContent = String(label ?? "");
    return opt;
  }

  function resetSelect(selectEl, placeholderText) {
    if (!selectEl) return;
    selectEl.innerHTML = "";
    selectEl.appendChild(makeOption("", placeholderText || "Selecciona"));
  }

  function parseIdOrNull(valueStr) {
    const s = String(valueStr || "").trim();
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n) || Number.isNaN(n)) return null;
    return n;
  }

  function isRlsBlocked(error) {
    const status = error?.status;
    const msg = errMsg(error).toLowerCase();
    if (status === 401 || status === 403) return true;
    return (
      msg.includes("permission denied") ||
      msg.includes("violates row-level security") ||
      msg.includes("insufficient_privilege") ||
      msg.includes("jwt") ||
      msg.includes("rls") ||
      msg.includes("policy")
    );
  }

  function errMsg(e) {
    if (!e) return "Error desconocido";
    if (typeof e === "string") return e;
    if (e.message) return String(e.message);
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }

  function nextPaint() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  function waitForSupabaseClient(timeoutMs = 5000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const tick = () => {
        const sb = window.supabase;
        if (sb && sb.auth && typeof sb.auth.getUser === "function") return resolve(sb);
        if (Date.now() - start >= timeoutMs) return reject(new Error("Timeout esperando window.supabase"));
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  async function getAuthUserBulletproofA5(supabase) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!error && data?.user?.id) return data.user;
      } catch (_) {}

      try {
        const { data, error } = await supabase.auth.getSession();
        if (!error && data?.session?.user?.id) return data.session.user;
      } catch (_) {}

      if (attempt < 2) await sleep(150);
    }
    return null;
  }
})();

/*******************************************************
 *  FIN UBICACION
 **************************************************** */
/*=============================
EXPERIENCIA LABORAL
==============================*/
/*******************************************************
 * ******************************************************
 *  TAB EXPERIENCIA  (CERO BUGS)
 *  - NO cambia HTML
 *  - Funciona aunque el <script> NO tenga defer
 *  - ADD / LOAD / SAVE / DELETE
 *  - RLS-aware + multiusuario (user_id = auth.uid())
 * ******************************************************
 *******************************************************/

/* =========================================================
   C — EXPERIENCIA (#panel_experience)
   Tabla: public.candidate_experiences
   UI IDs (NO CAMBIAR HTML):
   - #btn_exp_add
   - #btn_exp_save
   - #exp_list
   - #exp_status
   - template: #tpl_experience_item
   Campos por data-field dentro del template:
   - id (hidden)
   - company_name
   - job_title
   - employment_type
   - start_date
   - end_date
   - is_current (checkbox)
   - location_text
   - description
   Acciones:
   - button[data-action="delete"]
========================================================= */
(function ExperienceModule_THSCandidate() {
  "use strict";

  // Locks
  let saving = false;
  let loading = false;

  // Boot (seguro sin defer)
  document.addEventListener("DOMContentLoaded", () => {
    boot().catch((e) => setStatus(`Experiencia: init falló: ${errMsg(e)}`, "error"));
  });

  async function boot() {
    const panel = document.getElementById("panel_experience");
    if (!panel) return; // no existe panel => no hacemos nada

    const list = document.getElementById("exp_list");
    const btnAdd = document.getElementById("btn_exp_add");
    const btnSave = document.getElementById("btn_exp_save");
    const status = document.getElementById("exp_status");
    const tpl = document.getElementById("tpl_experience_item");

    if (!list || !btnAdd || !btnSave || !status || !tpl) return;

    // Bind una sola vez
    bindAddOnce(btnAdd);
    bindSaveOnce(btnSave);
    bindDeleteDelegationOnce(panel);

    // Carga inicial
    await loadExperiences();
  }

  /* =========================
     ADD
  ========================= */
  function bindAddOnce(btn) {
    if (btn.dataset.boundExpAdd === "1") return;
    btn.dataset.boundExpAdd = "1";

    btn.addEventListener("click", () => {
      const list = document.getElementById("exp_list");
      if (!list) return setStatus("Error: falta #exp_list.", "error");

      const item = cloneTemplate();
      if (!item) return;

      // Defaults
      setVal(item, "id", "");
      setVal(item, "company_name", "");
      setVal(item, "job_title", "");
      setVal(item, "employment_type", "");
      setVal(item, "start_date", "");
      setVal(item, "end_date", "");
      setChecked(item, "is_current", false);
      setVal(item, "location_text", "");
      setVal(item, "description", "");

      bindIsCurrent(item);

      list.appendChild(item);
      setStatus("Experiencia agregada. Completa y presiona Guardar.", "info");

      const company = findField(item, "company_name");
      if (company?.focus) company.focus();
    });
  }

  /* =========================
     SAVE
  ========================= */
  function bindSaveOnce(btn) {
    if (btn.dataset.boundExpSave === "1") return;
    btn.dataset.boundExpSave = "1";

    btn.addEventListener("click", async () => {
      await saveExperiences();
    });
  }

  /* =========================
     DELETE (delegación)
  ========================= */
  function bindDeleteDelegationOnce(panel) {
    if (panel.dataset.boundExpDelete === "1") return;
    panel.dataset.boundExpDelete = "1";

    panel.addEventListener(
      "click",
      async (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;

        const btn = t.closest('button[data-action="delete"]');
        if (!btn) return;

        const item = btn.closest('[data-item="experience"]');
        if (!item) return;

        e.preventDefault();

        const company = getVal(item, "company_name") || "esta experiencia";
        const ok = window.confirm(`¿Eliminar "${company}"?`);
        if (!ok) return;

        const rowId = (getVal(item, "id") || "").trim();

        // UI first (sin drama)
        item.remove();
        setStatus("Experiencia eliminada (UI).", "info");

        // Si no había id => nunca estuvo guardada
        if (!rowId) {
          setStatus("Experiencia eliminada ✅ (no estaba guardada).", "success");
          return;
        }

        const supabase = await waitForSupabaseClient(5000).catch(() => null);
        if (!supabase?.auth) {
          setStatus("Eliminada en UI, pero Supabase no está listo para borrar en DB.", "error");
          return;
        }

        const user = await getAuthUserBulletproof(supabase);
        if (!user?.id) {
          window.location.replace("/web/auth/login-candidate.html");
          return;
        }

        const { error } = await supabase
          .from("candidate_experiences")
          .delete()
          .eq("id", rowId)
          .eq("user_id", user.id);

        if (error) {
          if (isRlsBlocked(error)) {
            setStatus(
              `RLS bloqueó DELETE. Policy requerida: delete own rows (user_id = auth.uid()). Detalle: ${errMsg(error)}`,
              "error"
            );
            return;
          }
          setStatus(`Error DELETE candidate_experiences: ${errMsg(error)}`, "error");
          return;
        }

        setStatus("Experiencia eliminada ✅ (DB).", "success");
      },
      true
    );
  }

  /* =========================
     LOAD
  ========================= */
  async function loadExperiences() {
    if (loading) return;
    loading = true;

    const list = document.getElementById("exp_list");
    if (!list) {
      loading = false;
      return setStatus("Error: falta #exp_list.", "error");
    }

    try {
      setStatus("Cargando experiencia…", "info");
      await nextPaint();

      const supabase = await waitForSupabaseClient(5000).catch(() => null);
      if (!supabase?.auth) {
        setStatus("Error: Supabase no está disponible.", "error");
        return;
      }

      const user = await getAuthUserBulletproof(supabase);
      if (!user?.id) {
        window.location.replace("/web/auth/login-candidate.html");
        return;
      }

      const { data, error } = await supabase
        .from("candidate_experiences")
        .select(
          "id, user_id, company_name, job_title, employment_type, start_date, end_date, is_current, location_text, description, created_at"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (error) {
        if (isRlsBlocked(error)) {
          setStatus(
            `RLS bloqueó SELECT candidate_experiences. Policy requerida: select own rows (user_id = auth.uid()). Detalle: ${errMsg(error)}`,
            "error"
          );
          return;
        }
        setStatus(`Error SELECT candidate_experiences: ${errMsg(error)}`, "error");
        return;
      }

      list.innerHTML = "";

      const rows = Array.isArray(data) ? data : [];
      if (rows.length === 0) {
        setStatus("Sin experiencia todavía. Agrega una y guarda.", "info");
        return;
      }

      for (const row of rows) {
        const item = cloneTemplate();
        if (!item) return;

        setVal(item, "id", row.id || "");
        setVal(item, "company_name", row.company_name || "");
        setVal(item, "job_title", row.job_title || "");
        setVal(item, "employment_type", row.employment_type || "");
        setVal(item, "start_date", row.start_date || "");
        setVal(item, "end_date", row.end_date || "");
        setChecked(item, "is_current", !!row.is_current);
        setVal(item, "location_text", row.location_text || "");
        setVal(item, "description", row.description || "");

        bindIsCurrent(item);

        list.appendChild(item);
      }

      setStatus(`Experiencia cargada ✅ (${rows.length}).`, "success");
    } catch (e) {
      setStatus(`Error cargando experiencia: ${errMsg(e)}`, "error");
    } finally {
      loading = false;
    }
  }

  /* =========================
     SAVE (INSERT + UPSERT)
  ========================= */
  async function saveExperiences() {
    const list = document.getElementById("exp_list");
    const btnSave = document.getElementById("btn_exp_save");

    if (!list) return setStatus("Error: falta #exp_list.", "error");

    const items = Array.from(list.querySelectorAll('[data-item="experience"]'));
    if (items.length === 0) return setStatus("No hay experiencia para guardar.", "error");

    if (saving) return;
    saving = true;

    try {
      setStatus("Guardando experiencia…", "info");
      await nextPaint();
      if (btnSave) btnSave.disabled = true;

      const supabase = await waitForSupabaseClient(5000).catch(() => null);
      if (!supabase?.auth) {
        setStatus("Error: Supabase no está disponible.", "error");
        return;
      }

      const user = await getAuthUserBulletproof(supabase);
      if (!user?.id) {
        window.location.replace("/web/auth/login-candidate.html");
        return;
      }

      const rows = [];

      for (const item of items) {
        const id = (getVal(item, "id") || "").trim();

        const company = getVal(item, "company_name");
        const title = getVal(item, "job_title");
        const empType = getVal(item, "employment_type");
        const start = getVal(item, "start_date");
        const end = getVal(item, "end_date");
        const isCurrent = getChecked(item, "is_current");
        const loc = getVal(item, "location_text");
        const desc = getVal(item, "description");

        // NOT NULL reales
        if (!company) return setStatus("Error: Empresa es obligatoria.", "error");
        if (!title) return setStatus("Error: Cargo es obligatorio.", "error");
        if (!start) return setStatus("Error: Fecha inicio es obligatoria.", "error");

        // Si NO es current, end_date puede ser null (tu tabla permite NULL),
        // pero si el usuario puso end_date vacío no lo forzamos.
        const payload = {
          user_id: user.id,
          company_name: company,
          job_title: title,
          employment_type: empType || null,
          start_date: start,
          end_date: isCurrent ? null : (end || null),
          is_current: !!isCurrent,
          location_text: loc || null,
          description: desc || null,
        };

        if (looksLikeUuid(id)) payload.id = id;
        rows.push(payload);
      }

      const toInsert = rows.filter((r) => !r.id);
      const toUpsert = rows.filter((r) => !!r.id);

      if (toInsert.length > 0) {
        const { error } = await supabase.from("candidate_experiences").insert(toInsert);
        if (error) {
          if (isRlsBlocked(error)) {
            setStatus(
              `RLS bloqueó INSERT. Policy requerida: insert own rows (user_id = auth.uid()). Detalle: ${errMsg(error)}`,
              "error"
            );
            return;
          }
          setStatus(`Error INSERT candidate_experiences: ${errMsg(error)}`, "error");
          return;
        }
      }

      if (toUpsert.length > 0) {
        const { error } = await supabase
          .from("candidate_experiences")
          .upsert(toUpsert, { onConflict: "id" });

        if (error) {
          if (isRlsBlocked(error)) {
            setStatus(
              `RLS bloqueó UPSERT. Policy requerida: update own rows (user_id = auth.uid()). Detalle: ${errMsg(error)}`,
              "error"
            );
            return;
          }
          setStatus(`Error UPSERT candidate_experiences: ${errMsg(error)}`, "error");
          return;
        }
      }

      setStatus("Experiencia guardada ✅", "success");
      await loadExperiences();
    } catch (e) {
      setStatus(`Error al guardar experiencia: ${errMsg(e)}`, "error");
    } finally {
      saving = false;
      const btnSave2 = document.getElementById("btn_exp_save");
      if (btnSave2) btnSave2.disabled = false;
    }
  }

  /* =========================
     is_current -> end_date disable
  ========================= */
  function bindIsCurrent(item) {
    const cb = findField(item, "is_current");
    const end = findField(item, "end_date");
    if (!cb || !end) return;

    if (cb.dataset.boundCurrent === "1") {
      applyCurrent(cb, end);
      return;
    }

    cb.dataset.boundCurrent = "1";
    applyCurrent(cb, end);
    cb.addEventListener("change", () => applyCurrent(cb, end));
  }

  function applyCurrent(cb, endEl) {
    const isCurr = !!cb.checked;
    if (isCurr) {
      endEl.value = "";
      endEl.disabled = true;
    } else {
      endEl.disabled = false;
    }
  }

  /* =========================
     TEMPLATE CLONE
  ========================= */
  function cloneTemplate() {
    const tpl = document.getElementById("tpl_experience_item");
    if (!tpl?.content) {
      setStatus("Error: falta template #tpl_experience_item.", "error");
      return null;
    }

    const frag = tpl.content.cloneNode(true);

    // Busca el primer elemento real dentro del fragmento
    const wrap = document.createElement("div");
    wrap.appendChild(frag);

    const item = wrap.firstElementChild;
    if (!item) {
      setStatus("Error: template de experiencia está vacío.", "error");
      return null;
    }

    item.setAttribute("data-item", "experience");
    return item;
  }

  /* =========================
     STATUS
  ========================= */
  function setStatus(msg, type) {
    const el = document.getElementById("exp_status");
    if (!el) return;
    el.textContent = msg || "";
    el.dataset.type = type || "info";
  }

  /* =========================
     FIELD HELPERS
  ========================= */
  function findField(item, field) {
    if (!item) return null;
    return item.querySelector(`[data-field="${cssEscape(field)}"]`);
  }

  function getVal(item, field) {
    const el = findField(item, field);
    return el && "value" in el ? String(el.value || "").trim() : "";
  }

  function setVal(item, field, val) {
    const el = findField(item, field);
    if (el && "value" in el) el.value = val ?? "";
  }

  function getChecked(item, field) {
    const el = findField(item, field);
    return !!(el && el.type === "checkbox" && el.checked);
  }

  function setChecked(item, field, checked) {
    const el = findField(item, field);
    if (el && el.type === "checkbox") el.checked = !!checked;
  }

  /* =========================
     Auth bulletproof
  ========================= */
  async function getAuthUserBulletproof(supabase) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    for (let i = 0; i < 2; i++) {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!error && data?.user?.id) return data.user;
      } catch (_) {}

      try {
        const { data, error } = await supabase.auth.getSession();
        if (!error && data?.session?.user?.id) return data.session.user;
      } catch (_) {}

      if (i === 0) await sleep(150);
    }
    return null;
  }

  /* =========================
     Wait Supabase (sin defer)
  ========================= */
  function waitForSupabaseClient(timeoutMs = 5000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const tick = () => {
        const sb = window.supabase;
        if (sb && sb.auth && typeof sb.auth.getUser === "function") return resolve(sb);
        if (Date.now() - start >= timeoutMs) return reject(new Error("Timeout esperando window.supabase"));
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  /* =========================
     RLS detector
  ========================= */
  function isRlsBlocked(error) {
    const status = error?.status;
    const msg = errMsg(error).toLowerCase();

    if (status === 401 || status === 403) return true;

    return (
      msg.includes("permission denied") ||
      msg.includes("violates row-level security") ||
      msg.includes("rls") ||
      msg.includes("row level security") ||
      msg.includes("policy") ||
      msg.includes("insufficient_privilege") ||
      msg.includes("jwt")
    );
  }

  /* =========================
     misc
  ========================= */
  function looksLikeUuid(s) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      String(s || "").trim()
    );
  }

  function errMsg(e) {
    if (!e) return "Error desconocido";
    if (typeof e === "string") return e;
    if (e.message) return String(e.message);
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }

  function nextPaint() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  function cssEscape(v) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(v);
    return String(v).replace(/["\\]/g, "\\$&");
  }
})();
/*******************************************************
 *  FIN EXPERIENCIA
 **************************************************** */
/*=============================
EDUCACIÓN
==============================*/
/*******************************************************
 * ******************************************************
 *  TAB EDUCACION  (CERO BUGS)
 *  - NO cambia HTML
 *  - Funciona aunque el <script> NO tenga defer
 *  - ADD / LOAD / SAVE / DELETE
 *  - RLS-aware + multiusuario (user_id = auth.uid())
 * ******************************************************
 *******************************************************/

/* =========================================================
   G — EDUCACIÓN (#panel_education)
   Tabla: public.candidate_education
   UI IDs (NO CAMBIAR HTML):
   - #btn_edu_add
   - #btn_edu_save
   - #edu_list
   - #edu_status
   - template: #tpl_education_item
   Campos por data-field dentro del template:
   - id (hidden)
   - institution
   - degree
   - field_of_study
   - start_date
   - end_date
   - is_current (checkbox)
   - description
   Acciones:
   - button[data-action="delete"]
========================================================= */
(function EducationModule_THSCandidate() {
  "use strict";

  let saving = false;
  let loading = false;

  document.addEventListener("DOMContentLoaded", () => {
    boot().catch((e) => setStatus(`Educación: init falló: ${errMsg(e)}`, "error"));
  });

  async function boot() {
    const panel = document.getElementById("panel_education");
    if (!panel) return;

    const list = document.getElementById("edu_list");
    const btnAdd = document.getElementById("btn_edu_add");
    const btnSave = document.getElementById("btn_edu_save");
    const status = document.getElementById("edu_status");
    const tpl = document.getElementById("tpl_education_item");

    if (!list || !btnAdd || !btnSave || !status || !tpl) return;

    bindAddOnce(btnAdd);
    bindSaveOnce(btnSave);
    bindDeleteDelegationOnce(panel);

    await loadEducation();
  }

  /* =========================
     ADD
  ========================= */
  function bindAddOnce(btn) {
    if (btn.dataset.boundEduAdd === "1") return;
    btn.dataset.boundEduAdd = "1";

    btn.addEventListener("click", () => {
      const list = document.getElementById("edu_list");
      if (!list) return setStatus("Error: falta #edu_list.", "error");

      const item = cloneTemplate();
      if (!item) return;

      setVal(item, "id", "");
      setVal(item, "institution", "");
      setVal(item, "degree", "");
      setVal(item, "field_of_study", "");
      setVal(item, "start_date", "");
      setVal(item, "end_date", "");
      setChecked(item, "is_current", false);
      setVal(item, "description", "");

      bindIsCurrent(item);

      list.appendChild(item);
      setStatus("Educación agregada. Completa y presiona Guardar.", "info");

      const inst = findField(item, "institution");
      if (inst?.focus) inst.focus();
    });
  }

  /* =========================
     SAVE
  ========================= */
  function bindSaveOnce(btn) {
    if (btn.dataset.boundEduSave === "1") return;
    btn.dataset.boundEduSave = "1";

    btn.addEventListener("click", async () => {
      await saveEducation();
    });
  }

  /* =========================
     DELETE (delegación)
  ========================= */
  function bindDeleteDelegationOnce(panel) {
    if (panel.dataset.boundEduDelete === "1") return;
    panel.dataset.boundEduDelete = "1";

    panel.addEventListener(
      "click",
      async (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;

        const btn = t.closest('button[data-action="delete"]');
        if (!btn) return;

        const item = btn.closest('[data-item="education"]');
        if (!item) return;

        e.preventDefault();

        const label = getVal(item, "institution") || "esta educación";
        const ok = window.confirm(`¿Eliminar "${label}"?`);
        if (!ok) return;

        const rowId = (getVal(item, "id") || "").trim();

        item.remove();
        setStatus("Educación eliminada (UI).", "info");

        if (!rowId) {
          setStatus("Educación eliminada ✅ (no estaba guardada).", "success");
          return;
        }

        const supabase = await waitForSupabaseClient(5000).catch(() => null);
        if (!supabase?.auth) {
          setStatus("Eliminada en UI, pero Supabase no está listo para borrar en DB.", "error");
          return;
        }

        const user = await getAuthUserBulletproof(supabase);
        if (!user?.id) {
          window.location.replace("/web/auth/login-candidate.html");
          return;
        }

        const { error } = await supabase
          .from("candidate_education")
          .delete()
          .eq("id", rowId)
          .eq("user_id", user.id);

        if (error) {
          if (isRlsBlocked(error)) {
            setStatus(
              `RLS bloqueó DELETE. Policy requerida: delete own rows (user_id = auth.uid()). Detalle: ${errMsg(error)}`,
              "error"
            );
            return;
          }
          setStatus(`Error DELETE candidate_education: ${errMsg(error)}`, "error");
          return;
        }

        setStatus("Educación eliminada ✅ (DB).", "success");
      },
      true
    );
  }

  /* =========================
     LOAD
  ========================= */
  async function loadEducation() {
    if (loading) return;
    loading = true;

    const list = document.getElementById("edu_list");
    if (!list) {
      loading = false;
      return setStatus("Error: falta #edu_list.", "error");
    }

    try {
      setStatus("Cargando educación…", "info");
      await nextPaint();

      const supabase = await waitForSupabaseClient(5000).catch(() => null);
      if (!supabase?.auth) {
        setStatus("Error: Supabase no está disponible.", "error");
        return;
      }

      const user = await getAuthUserBulletproof(supabase);
      if (!user?.id) {
        window.location.replace("/web/auth/login-candidate.html");
        return;
      }

      const { data, error } = await supabase
        .from("candidate_education")
        .select("id, institution, degree, field_of_study, start_date, end_date, is_current, description, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (error) {
        if (isRlsBlocked(error)) {
          setStatus(
            `RLS bloqueó SELECT candidate_education. Policy requerida: select own rows (user_id = auth.uid()). Detalle: ${errMsg(error)}`,
            "error"
          );
          return;
        }
        setStatus(`Error SELECT candidate_education: ${errMsg(error)}`, "error");
        return;
      }

      list.innerHTML = "";

      const rows = Array.isArray(data) ? data : [];
      if (rows.length === 0) {
        setStatus("Sin educación todavía. Agrega una y guarda.", "info");
        return;
      }

      for (const row of rows) {
        const item = cloneTemplate();
        if (!item) return;

        setVal(item, "id", row.id || "");
        setVal(item, "institution", row.institution || "");
        setVal(item, "degree", row.degree || "");
        setVal(item, "field_of_study", row.field_of_study || "");
        setVal(item, "start_date", row.start_date || "");
        setVal(item, "end_date", row.end_date || "");
        setChecked(item, "is_current", !!row.is_current);
        setVal(item, "description", row.description || "");

        bindIsCurrent(item);

        list.appendChild(item);
      }

      setStatus(`Educación cargada ✅ (${rows.length}).`, "success");
    } catch (e) {
      setStatus(`Error cargando educación: ${errMsg(e)}`, "error");
    } finally {
      loading = false;
    }
  }

  /* =========================
     SAVE (INSERT + UPSERT)
  ========================= */
  async function saveEducation() {
    const list = document.getElementById("edu_list");
    const btnSave = document.getElementById("btn_edu_save");

    if (!list) return setStatus("Error: falta #edu_list.", "error");

    const items = Array.from(list.querySelectorAll('[data-item="education"]'));
    if (items.length === 0) return setStatus("No hay educación para guardar.", "error");

    if (saving) return;
    saving = true;

    try {
      setStatus("Guardando educación…", "info");
      await nextPaint();
      if (btnSave) btnSave.disabled = true;

      const supabase = await waitForSupabaseClient(5000).catch(() => null);
      if (!supabase?.auth) {
        setStatus("Error: Supabase no está disponible.", "error");
        return;
      }

      const user = await getAuthUserBulletproof(supabase);
      if (!user?.id) {
        window.location.replace("/web/auth/login-candidate.html");
        return;
      }

      const rows = [];

      for (const item of items) {
        const id = (getVal(item, "id") || "").trim();
        const institution = getVal(item, "institution");
        const degree = getVal(item, "degree");
        const field = getVal(item, "field_of_study");
        const start = getVal(item, "start_date");
        const end = getVal(item, "end_date");
        const isCurrent = getChecked(item, "is_current");
        const desc = getVal(item, "description");

        // mínimo realista (institución)
        if (!institution) return setStatus("Error: Institución es obligatoria.", "error");
        if (institution.length > 160) return setStatus("Error: Institución supera 160 caracteres.", "error");
        if (degree.length > 80) return setStatus("Error: Título/Grado supera 80 caracteres.", "error");
        if (field.length > 160) return setStatus("Error: Área de estudio supera 160 caracteres.", "error");

        const payload = {
          user_id: user.id,
          institution: institution,
          degree: degree || null,
          field_of_study: field || null,
          start_date: start || null,
          end_date: isCurrent ? null : (end || null),
          is_current: !!isCurrent,
          description: desc || null,
        };

        if (looksLikeUuid(id)) payload.id = id;
        rows.push(payload);
      }

      const toInsert = rows.filter((r) => !r.id);
      const toUpsert = rows.filter((r) => !!r.id);

      if (toInsert.length > 0) {
        const { error } = await supabase.from("candidate_education").insert(toInsert);
        if (error) {
          if (isRlsBlocked(error)) {
            setStatus(
              `RLS bloqueó INSERT. Policy requerida: insert own rows (user_id = auth.uid()). Detalle: ${errMsg(error)}`,
              "error"
            );
            return;
          }
          setStatus(`Error INSERT candidate_education: ${errMsg(error)}`, "error");
          return;
        }
      }

      if (toUpsert.length > 0) {
        const { error } = await supabase
          .from("candidate_education")
          .upsert(toUpsert, { onConflict: "id" });

        if (error) {
          if (isRlsBlocked(error)) {
            setStatus(
              `RLS bloqueó UPSERT. Policy requerida: update own rows (user_id = auth.uid()). Detalle: ${errMsg(error)}`,
              "error"
            );
            return;
          }
          setStatus(`Error UPSERT candidate_education: ${errMsg(error)}`, "error");
          return;
        }
      }

      const t = new Date();
      setStatus(
        `Educación guardada ✅ (${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}).`,
        "success"
      );

      await loadEducation();
    } catch (e) {
      setStatus(`Error guardando educación: ${errMsg(e)}`, "error");
    } finally {
      saving = false;
      const btnSave2 = document.getElementById("btn_edu_save");
      if (btnSave2) btnSave2.disabled = false;
    }
  }

  /* =========================
     is_current -> end_date disable
  ========================= */
  function bindIsCurrent(item) {
    const cb = findField(item, "is_current");
    const end = findField(item, "end_date");
    if (!cb || !end) return;

    if (cb.dataset.boundEduCurrent === "1") {
      applyCurrent(cb, end);
      return;
    }

    cb.dataset.boundEduCurrent = "1";
    applyCurrent(cb, end);
    cb.addEventListener("change", () => applyCurrent(cb, end));
  }

  function applyCurrent(cb, endEl) {
    const isCurr = !!cb.checked;
    if (isCurr) {
      endEl.value = "";
      endEl.disabled = true;
      endEl.setAttribute("aria-disabled", "true");
    } else {
      endEl.disabled = false;
      endEl.removeAttribute("aria-disabled");
    }
  }

  /* =========================
     TEMPLATE CLONE (robusto)
  ========================= */
  function cloneTemplate() {
    const tpl = document.getElementById("tpl_education_item");
    if (!tpl?.content) {
      setStatus("Error: falta template #tpl_education_item.", "error");
      return null;
    }

    const frag = tpl.content.cloneNode(true);

    const wrap = document.createElement("div");
    wrap.appendChild(frag);

    const item = wrap.firstElementChild;
    if (!item) {
      setStatus("Error: template de educación está vacío.", "error");
      return null;
    }

    item.setAttribute("data-item", "education");
    return item;
  }

  /* =========================
     STATUS
  ========================= */
  function setStatus(msg, type) {
    const el = document.getElementById("edu_status");
    if (!el) return;
    el.textContent = msg || "";
    el.dataset.type = type || "info";
  }

  /* =========================
     FIELD HELPERS
  ========================= */
  function findField(item, field) {
    if (!item) return null;
    return item.querySelector(`[data-field="${cssEscape(field)}"]`);
  }

  function getVal(item, field) {
    const el = findField(item, field);
    return el && "value" in el ? String(el.value || "").trim() : "";
  }

  function setVal(item, field, val) {
    const el = findField(item, field);
    if (el && "value" in el) el.value = val ?? "";
  }

  function getChecked(item, field) {
    const el = findField(item, field);
    return !!(el && el.type === "checkbox" && el.checked);
  }

  function setChecked(item, field, checked) {
    const el = findField(item, field);
    if (el && el.type === "checkbox") el.checked = !!checked;
  }

  /* =========================
     Auth bulletproof
  ========================= */
  async function getAuthUserBulletproof(supabase) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    for (let i = 0; i < 2; i++) {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!error && data?.user?.id) return data.user;
      } catch (_) {}

      try {
        const { data, error } = await supabase.auth.getSession();
        if (!error && data?.session?.user?.id) return data.session.user;
      } catch (_) {}

      if (i === 0) await sleep(150);
    }
    return null;
  }

  /* =========================
     Wait Supabase (sin defer)
  ========================= */
  function waitForSupabaseClient(timeoutMs = 5000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const tick = () => {
        const sb = window.supabase;
        if (sb && sb.auth && typeof sb.auth.getUser === "function") return resolve(sb);
        if (Date.now() - start >= timeoutMs) return reject(new Error("Timeout esperando window.supabase"));
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  /* =========================
     RLS detector
  ========================= */
  function isRlsBlocked(error) {
    const status = error?.status;
    const msg = errMsg(error).toLowerCase();

    if (status === 401 || status === 403) return true;

    return (
      msg.includes("permission denied") ||
      msg.includes("violates row-level security") ||
      msg.includes("rls") ||
      msg.includes("row level security") ||
      msg.includes("policy") ||
      msg.includes("insufficient_privilege") ||
      msg.includes("jwt")
    );
  }

  function looksLikeUuid(s) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      String(s || "").trim()
    );
  }

  function errMsg(e) {
    if (!e) return "Error desconocido";
    if (typeof e === "string") return e;
    if (e.message) return String(e.message);
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }

  function nextPaint() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  function cssEscape(v) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(v);
    return String(v).replace(/["\\]/g, "\\$&");
  }
})();
/****************************
 *  FIN EDUCACIÓN
 ********************************/
/*=========================
CERTIFICACIONES
==========================*/
/*******************************************************
 * ******************************************************
 *  TAB CERTIFICACIONES (CERO BUGS)
 *  - NO cambia HTML
 *  - ADD / LOAD / SAVE / DELETE
 *  - RLS-aware + multiusuario (user_id = auth.uid())
 *  - Funciona aunque el <script> NO tenga defer
 * ******************************************************
 *******************************************************/

/* =========================================================
   D — CERTIFICACIONES (#panel_certifications) — UI + DB
   UI IDs (NO CAMBIAR HTML):
   - #btn_cert_add / #btn_cert_save
   - #cert_list
   - #cert_status
   - template#tpl_cert_item
   data-field dentro del template:
     id, name, issuer, issue_date, expiry_date, credential_url, attachment_path
   Tabla: public.candidate_certifications
========================================================= */
(function CertificationsModule_THSCandidate() {
  "use strict";

  let saving = false;
  let loading = false;

  document.addEventListener("DOMContentLoaded", () => {
    boot().catch((e) => setStatus(`Certificaciones: init falló: ${errMsg(e)}`, "error"));
  });

  async function boot() {
    const panel = document.getElementById("panel_certifications");
    if (!panel) return;

    const list = document.getElementById("cert_list");
    const btnAdd = document.getElementById("btn_cert_add");
    const btnSave = document.getElementById("btn_cert_save");
    const status = document.getElementById("cert_status");
    const tpl = document.getElementById("tpl_cert_item");

    if (!list || !btnAdd || !btnSave || !status || !tpl) return;

    bindAddOnce(btnAdd);
    bindSaveOnce(btnSave);
    bindDeleteDelegationOnce(panel);

    await loadCertifications();
  }

  /* =========================
     ADD
  ========================= */
  function bindAddOnce(btn) {
    if (btn.dataset.boundCertAdd === "1") return;
    btn.dataset.boundCertAdd = "1";

    btn.addEventListener("click", () => {
      const list = document.getElementById("cert_list");
      if (!list) return setStatus("Error: falta #cert_list.", "error");

      const item = cloneTemplate();
      if (!item) return;

      setVal(item, "id", "");
      setVal(item, "name", "");
      setVal(item, "issuer", "");
      setVal(item, "issue_date", "");
      setVal(item, "expiry_date", "");
      setVal(item, "credential_url", "");
      setVal(item, "attachment_path", "");

      list.appendChild(item);
      setStatus("Certificación agregada. Completa y presiona Guardar.", "info");

      const nameEl = findField(item, "name");
      if (nameEl?.focus) nameEl.focus();
    });
  }

  /* =========================
     SAVE
  ========================= */
  function bindSaveOnce(btn) {
    if (btn.dataset.boundCertSave === "1") return;
    btn.dataset.boundCertSave = "1";

    btn.addEventListener("click", async () => {
      await saveCertifications();
    });
  }

  /* =========================
     DELETE (delegación)
  ========================= */
  function bindDeleteDelegationOnce(panel) {
    if (panel.dataset.boundCertDelete === "1") return;
    panel.dataset.boundCertDelete = "1";

    panel.addEventListener(
      "click",
      async (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;

        const btn = t.closest('button[data-action="delete"]');
        if (!btn) return;

        const item = btn.closest('[data-item="certifications"]');
        if (!item) return;

        e.preventDefault();

        const label = getVal(item, "name") || "esta certificación";
        const ok = window.confirm(`¿Eliminar "${label}"?`);
        if (!ok) return;

        const rowId = (getVal(item, "id") || "").trim();

        // UI first
        item.remove();
        setStatus("Certificación eliminada (UI).", "info");

        // Si no tenía id, no existía en DB
        if (!rowId) {
          setStatus("Certificación eliminada ✅ (no estaba guardada).", "success");
          return;
        }

        const supabase = await waitForSupabaseClient(5000).catch(() => null);
        if (!supabase?.auth) {
          setStatus("Eliminada en UI, pero Supabase no está listo para borrar en DB.", "error");
          return;
        }

        const user = await getAuthUserBulletproof(supabase);
        if (!user?.id) {
          window.location.replace("/web/auth/login-candidate.html");
          return;
        }

        const { error } = await supabase
          .from("candidate_certifications")
          .delete()
          .eq("id", rowId)
          .eq("user_id", user.id);

        if (error) {
          if (isRlsBlocked(error)) {
            setStatus(
              `RLS bloqueó DELETE. Policy requerida: delete own rows (user_id = auth.uid()). Detalle: ${errMsg(error)}`,
              "error"
            );
            return;
          }
          setStatus(`Error DELETE candidate_certifications: ${errMsg(error)}`, "error");
          return;
        }

        setStatus("Certificación eliminada ✅ (DB).", "success");
      },
      true
    );
  }

  /* =========================
     LOAD
  ========================= */
  async function loadCertifications() {
    if (loading) return;
    loading = true;

    const list = document.getElementById("cert_list");
    if (!list) {
      loading = false;
      return setStatus("Error: falta #cert_list.", "error");
    }

    try {
      setStatus("Cargando certificaciones…", "info");
      await nextPaint();

      const supabase = await waitForSupabaseClient(5000).catch(() => null);
      if (!supabase?.auth) {
        setStatus("Error: Supabase no está disponible.", "error");
        return;
      }

      const user = await getAuthUserBulletproof(supabase);
      if (!user?.id) {
        window.location.replace("/web/auth/login-candidate.html");
        return;
      }

      const { data, error } = await supabase
        .from("candidate_certifications")
        .select("id, name, issuer, issue_date, expiry_date, credential_url, attachment_path, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (error) {
        if (isRlsBlocked(error)) {
          setStatus(
            `RLS bloqueó SELECT candidate_certifications. Policy requerida: select own rows (user_id = auth.uid()). Detalle: ${errMsg(error)}`,
            "error"
          );
          return;
        }
        setStatus(`Error SELECT candidate_certifications: ${errMsg(error)}`, "error");
        return;
      }

      list.innerHTML = "";

      const rows = Array.isArray(data) ? data : [];
      if (rows.length === 0) {
        setStatus("Sin certificaciones todavía. Agrega una y guarda.", "info");
        return;
      }

      for (const row of rows) {
        const item = cloneTemplate();
        if (!item) return;

        setVal(item, "id", row.id || "");
        setVal(item, "name", row.name || "");
        setVal(item, "issuer", row.issuer || "");
        setVal(item, "issue_date", row.issue_date || "");
        setVal(item, "expiry_date", row.expiry_date || "");
        setVal(item, "credential_url", row.credential_url || "");
        setVal(item, "attachment_path", row.attachment_path || "");

        list.appendChild(item);
      }

      setStatus(`Certificaciones cargadas ✅ (${rows.length}).`, "success");
    } catch (e) {
      setStatus(`Error cargando certificaciones: ${errMsg(e)}`, "error");
    } finally {
      loading = false;
    }
  }

  /* =========================
     SAVE (INSERT + UPSERT)
  ========================= */
  async function saveCertifications() {
    const list = document.getElementById("cert_list");
    const btnSave = document.getElementById("btn_cert_save");

    if (!list) return setStatus("Error: falta #cert_list.", "error");

    const items = Array.from(list.querySelectorAll('[data-item="certifications"]'));
    if (items.length === 0) return setStatus("No hay certificaciones para guardar.", "error");

    if (saving) return;
    saving = true;

    try {
      setStatus("Guardando certificaciones…", "info");
      await nextPaint();
      if (btnSave) btnSave.disabled = true;

      const supabase = await waitForSupabaseClient(5000).catch(() => null);
      if (!supabase?.auth) {
        setStatus("Error: Supabase no está disponible.", "error");
        return;
      }

      const user = await getAuthUserBulletproof(supabase);
      if (!user?.id) {
        window.location.replace("/web/auth/login-candidate.html");
        return;
      }

      const rows = [];

      for (const item of items) {
        const id = (getVal(item, "id") || "").trim();
        const name = getVal(item, "name");
        const issuer = getVal(item, "issuer");
        const issue_date = getVal(item, "issue_date");
        const expiry_date = getVal(item, "expiry_date");
        const credential_url = getVal(item, "credential_url");
        const attachment_path = getVal(item, "attachment_path");

        // VALIDACIONES sólidas
        if (!name) return setStatus("Error: Nombre de certificación es obligatorio.", "error");
        if (name.length > 160) return setStatus("Error: Nombre supera 160 caracteres.", "error");
        if (issuer.length > 160) return setStatus("Error: Emisor supera 160 caracteres.", "error");
        if (credential_url.length > 500) return setStatus("Error: URL supera 500 caracteres.", "error");
        if (attachment_path.length > 500) return setStatus("Error: Ruta adjunto supera 500 caracteres.", "error");

        const payload = {
          user_id: user.id,
          name: name,
          issuer: issuer || null,
          issue_date: issue_date || null,
          expiry_date: expiry_date || null,
          credential_url: credential_url || null,
          attachment_path: attachment_path || null,
        };

        if (looksLikeUuid(id)) payload.id = id;
        rows.push(payload);
      }

      const toInsert = rows.filter((r) => !r.id);
      const toUpsert = rows.filter((r) => !!r.id);

      if (toInsert.length > 0) {
        const { error } = await supabase.from("candidate_certifications").insert(toInsert);
        if (error) {
          if (isRlsBlocked(error)) {
            setStatus(
              `RLS bloqueó INSERT. Policy requerida: insert own rows (user_id = auth.uid()). Detalle: ${errMsg(error)}`,
              "error"
            );
            return;
          }
          setStatus(`Error INSERT candidate_certifications: ${errMsg(error)}`, "error");
          return;
        }
      }

      if (toUpsert.length > 0) {
        const { error } = await supabase
          .from("candidate_certifications")
          .upsert(toUpsert, { onConflict: "id" });

        if (error) {
          if (isRlsBlocked(error)) {
            setStatus(
              `RLS bloqueó UPSERT. Policy requerida: update own rows (user_id = auth.uid()). Detalle: ${errMsg(error)}`,
              "error"
            );
            return;
          }
          setStatus(`Error UPSERT candidate_certifications: ${errMsg(error)}`, "error");
          return;
        }
      }

      const t = new Date();
      setStatus(
        `Certificaciones guardadas ✅ (${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(
          2,
          "0"
        )}).`,
        "success"
      );

      await loadCertifications();
    } catch (e) {
      setStatus(`Error guardando certificaciones: ${errMsg(e)}`, "error");
    } finally {
      saving = false;
      const btnSave2 = document.getElementById("btn_cert_save");
      if (btnSave2) btnSave2.disabled = false;
    }
  }

  /* =========================
     TEMPLATE CLONE (robusto)
  ========================= */
  function cloneTemplate() {
    const tpl = document.getElementById("tpl_cert_item");
    if (!tpl?.content) {
      setStatus("Error: falta template #tpl_cert_item.", "error");
      return null;
    }

    const frag = tpl.content.cloneNode(true);

    const wrap = document.createElement("div");
    wrap.appendChild(frag);

    const item = wrap.firstElementChild;
    if (!item) {
      setStatus("Error: template de certificación está vacío.", "error");
      return null;
    }

    item.setAttribute("data-item", "certifications");
    return item;
  }

  /* =========================
     STATUS
  ========================= */
  function setStatus(msg, type) {
    const el = document.getElementById("cert_status");
    if (!el) return;
    el.textContent = msg || "";
    el.dataset.type = type || "info";
  }

  /* =========================
     FIELD HELPERS
  ========================= */
  function findField(item, field) {
    if (!item) return null;
    return item.querySelector(`[data-field="${cssEscape(field)}"]`);
  }

  function getVal(item, field) {
    const el = findField(item, field);
    return el && "value" in el ? String(el.value || "").trim() : "";
  }

  function setVal(item, field, val) {
    const el = findField(item, field);
    if (el && "value" in el) el.value = val ?? "";
  }

  /* =========================
     Auth bulletproof
  ========================= */
  async function getAuthUserBulletproof(supabase) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    for (let i = 0; i < 2; i++) {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!error && data?.user?.id) return data.user;
      } catch (_) {}

      try {
        const { data, error } = await supabase.auth.getSession();
        if (!error && data?.session?.user?.id) return data.session.user;
      } catch (_) {}

      if (i === 0) await sleep(150);
    }
    return null;
  }

  /* =========================
     Wait Supabase (sin defer)
  ========================= */
  function waitForSupabaseClient(timeoutMs = 5000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const tick = () => {
        const sb = window.supabase;
        if (sb && sb.auth && typeof sb.auth.getUser === "function") return resolve(sb);
        if (Date.now() - start >= timeoutMs) return reject(new Error("Timeout esperando window.supabase"));
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  /* =========================
     RLS detector
  ========================= */
  function isRlsBlocked(error) {
    const status = error?.status;
    const msg = errMsg(error).toLowerCase();

    if (status === 401 || status === 403) return true;

    return (
      msg.includes("permission denied") ||
      msg.includes("violates row-level security") ||
      msg.includes("rls") ||
      msg.includes("row level security") ||
      msg.includes("policy") ||
      msg.includes("insufficient_privilege") ||
      msg.includes("jwt")
    );
  }

  function looksLikeUuid(s) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      String(s || "").trim()
    );
  }

  function errMsg(e) {
    if (!e) return "Error desconocido";
    if (typeof e === "string") return e;
    if (e.message) return String(e.message);
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }

  function nextPaint() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  function cssEscape(v) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(v);
    return String(v).replace(/["\\]/g, "\\$&");
  }
})();

/**************************
 fin CERTIFICACIONES
 ****************************** */

 /*=============================
 habilidades
 =============================*/
/*******************************************************
 * ******************************************************
 *  TAB HABILIDADES (SKILLS) — ADD / EDIT / SAVE / LOAD
 *  - NO toca HTML
 *  - Chip/Pill UX para skill_name
 *  - Supabase bulletproof (espera cliente)
 *  - RLS-aware (user_id = auth.uid())
 *  - SIN DELETE (tal como pediste)
 * ******************************************************
 *******************************************************/
/* =========================================================
   E — HABILIDADES (#panel_skills) — Skills v4 (FIX skill_key)
   ✅ NO cambia HTML
   ✅ UI: #skill_input + chips (template#tpl_skill_item)
   ✅ ADD (Enter) + EDIT (click label) + SAVE + LOAD + DELETE
   ✅ FIX: NUNCA manda skill_key / level / years_experience a DB
========================================================= */
(function SkillsModule_V4() {
  "use strict";

  // HARD-GUARD para evitar que corran módulos viejos si pegaste esto reemplazando
  window.__thsSkillsModuleInit_V2 = true;
  window.__thsSkillsModuleInit_V3 = true;

  if (window.__thsSkillsModuleInit_V4) return;
  window.__thsSkillsModuleInit_V4 = true;

  document.addEventListener("DOMContentLoaded", () => {
    init().catch((e) => console.error("[skills-v4] init error:", e));
  });

  async function init() {
    const panel = document.getElementById("panel_skills");
    if (!panel) return;

    const list = document.getElementById("skills_list");
    const tpl = document.getElementById("tpl_skill_item");
    const btnAdd = document.getElementById("btn_skill_add");
    const btnSave = document.getElementById("btn_skill_save");
    const status = document.getElementById("skills_status");
    const input = document.getElementById("skill_input");

    if (!list || !tpl || !btnAdd || !btnSave || !status) return;

    // evita doble-bind
    if (panel.dataset.boundSkillsV4 === "1") return;
    panel.dataset.boundSkillsV4 = "1";

    list.dataset.editingId = "";
    list.dataset.editingMode = "0";

    // cargar
    await loadSkills(list, tpl, status);

    // Agregar (botón) => focus input
    btnAdd.addEventListener("click", () => {
      if (input) input.focus();
      setStatus(status, "Escribe una habilidad y presiona Enter…", "info");
    });

    // Enter => agrega o edita
    if (input) {
      input.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter") return;
        ev.preventDefault();

        const name = normalize(input.value);
        if (!name) return;

        const editingId = String(list.dataset.editingId || "").trim();
        const isEditing = editingId.length > 0 && list.dataset.editingMode === "1";

        if (isEditing) {
          const chip = list.querySelector(`[data-item="skills"][data-id="${cssEscape(editingId)}"]`);
          if (!chip) {
            list.dataset.editingId = "";
            list.dataset.editingMode = "0";
            addChip(list, tpl, { id: "", skill_name: name });
            input.value = "";
            setStatus(status, `Agregada: ${name}`, "success");
            return;
          }

          // update UI
          setHidden(chip, "skill_name", name);
          setLabel(chip, name);

          // salir modo edición
          list.dataset.editingId = "";
          list.dataset.editingMode = "0";
          input.value = "";
          input.placeholder = "Escribe una habilidad y presiona Enter…";
          setStatus(status, `Editada: ${name}`, "success");
          return;
        }

        // add new
        addChip(list, tpl, { id: "", skill_name: name });
        input.value = "";
        setStatus(status, `Agregada: ${name}`, "success");
      });
    }

    // Click en label => entra a modo edición
    list.addEventListener("click", (ev) => {
      const target = ev.target;
      if (!(target instanceof Element)) return;

      const label = target.closest('[data-role="label"], .skill-chip__label');
      if (!label) return;

      const chip = label.closest('[data-item="skills"]');
      if (!chip) return;

      const id = String(chip.getAttribute("data-id") || "").trim();
      const name = normalize(readHidden(chip, "skill_name"));

      if (!input) {
        // fallback minimal: prompt si no hay input
        const next = normalize(window.prompt("Editar habilidad:", name || "") || "");
        if (!next) return;
        setHidden(chip, "skill_name", next);
        setLabel(chip, next);
        setStatus(status, `Editada: ${next}`, "success");
        return;
      }

      // modo edición
      list.dataset.editingId = id || "__new__";
      list.dataset.editingMode = "1";

      input.value = name || "";
      input.placeholder = "Editando… presiona Enter para guardar cambio";
      input.focus();

      setStatus(status, "Modo edición activo. Enter para confirmar.", "info");
    });

    // Delete (delegación) => DB + UI
    list.addEventListener(
      "click",
      async (ev) => {
        const btnDel = ev.target.closest('button[data-action="delete"]');
        if (!btnDel) return;

        const chip = btnDel.closest('[data-item="skills"]');
        if (!chip) return;

        ev.preventDefault();

        const skillName = normalize(readHidden(chip, "skill_name")) || "esta habilidad";
        const ok = window.confirm(`Vas a eliminar "${skillName}". ¿Aceptar?`);
        if (!ok) return;

        // si estamos editando este chip => salir de edición
        const idAttr = String(chip.getAttribute("data-id") || "").trim();
        const editingId = String(list.dataset.editingId || "").trim();
        if (editingId && (editingId === idAttr || editingId === "__new__")) {
          list.dataset.editingId = "";
          list.dataset.editingMode = "0";
          const input = document.getElementById("skill_input");
          if (input) {
            input.value = "";
            input.placeholder = "Escribe una habilidad y presiona Enter…";
          }
        }

        // UI primero
        chip.remove();
        setStatus(status, `Eliminada: ${skillName}`, "info");

        // si no tiene id => era nuevo no guardado
        const rowId = normalize(idAttr);
        if (!rowId) {
          setStatus(status, "Eliminada ✅ (no estaba guardada).", "success");
          return;
        }

        const supabase = await waitForSupabaseClient(5000).catch(() => null);
        if (!supabase?.auth) {
          setStatus(status, "Eliminada en UI. Supabase no disponible para borrar en DB.", "error");
          return;
        }

        const user = await getAuthUserBulletproof(supabase);
        if (!user?.id) return (window.location.href = "/web/auth/login-candidate.html");

        const { error } = await supabase
          .from("candidate_skills")
          .delete()
          .eq("id", rowId)
          .eq("user_id", user.id);

        if (error) {
          if (isRlsBlocked(error)) {
            setStatus(status, `RLS bloquea DELETE candidate_skills. Detalle: ${errMsg(error)}`, "error");
            return;
          }
          setStatus(status, `Error DELETE candidate_skills: ${errMsg(error)}`, "error");
          return;
        }

        setStatus(status, "Eliminada ✅ (DB).", "success");
      },
      true
    );

    // Guardar
    btnSave.addEventListener("click", async () => {
      await saveSkills(list, status, btnSave);
    });
  }

  /* =========================
     LOAD
  ========================= */
  async function loadSkills(list, tpl, status) {
    try {
      setStatus(status, "Cargando habilidades…", "info");
      await nextPaint();

      const supabase = await waitForSupabaseClient(5000).catch(() => null);
      if (!supabase?.auth) return setStatus(status, "Error: Supabase no disponible.", "error");

      const user = await getAuthUserBulletproof(supabase);
      if (!user?.id) return (window.location.href = "/web/auth/login-candidate.html");

      const { data, error } = await supabase
        .from("candidate_skills")
        .select("id, skill_name, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (error) {
        if (isRlsBlocked(error)) {
          setStatus(status, `RLS bloquea SELECT candidate_skills. Detalle: ${errMsg(error)}`, "error");
          return;
        }
        setStatus(status, `Error SELECT candidate_skills: ${errMsg(error)}`, "error");
        return;
      }

      list.innerHTML = "";

      if (!data || data.length === 0) {
        setStatus(status, "Sin habilidades guardadas todavía. Agrega una y presiona Guardar.", "info");
        return;
      }

      for (const row of data) {
        addChip(list, tpl, { id: row.id || "", skill_name: row.skill_name || "" });
      }

      setStatus(status, `Habilidades cargadas ✅ (${data.length}).`, "success");
    } catch (e) {
      setStatus(status, `Error al cargar habilidades: ${errMsg(e)}`, "error");
    }
  }

  /* =========================
     SAVE (FIX skill_key)
     - INSERT: { user_id, skill_name }
     - UPSERT: { id, user_id, skill_name }
     - NO manda skill_key/level/years_experience
  ========================= */
  async function saveSkills(list, status, btnSave) {
    if (btnSave.dataset.saving === "1") return;
    btnSave.dataset.saving = "1";

    try {
      const chips = Array.from(list.querySelectorAll('[data-item="skills"]'));
      if (chips.length === 0) {
        setStatus(status, "No hay habilidades para guardar. Agrega al menos una.", "error");
        return;
      }

      setStatus(status, "Guardando habilidades…", "info");
      await nextPaint();
      btnSave.disabled = true;

      const supabase = await waitForSupabaseClient(5000).catch(() => null);
      if (!supabase?.auth) {
        setStatus(status, "Error: Supabase no disponible.", "error");
        return;
      }

      const user = await getAuthUserBulletproof(supabase);
      if (!user?.id) return (window.location.href = "/web/auth/login-candidate.html");

      // validación + payloads
      const toInsert = [];
      const toUpsert = [];

      for (const chip of chips) {
        const id = normalize(chip.getAttribute("data-id") || "");
        const name = normalize(readHidden(chip, "skill_name"));

        if (!name) {
          setStatus(status, "Error: cada habilidad requiere nombre (ej: MS Office).", "error");
          return;
        }
        if (name.length > 80) {
          setStatus(status, "Error: Skill supera 80 caracteres.", "error");
          return;
        }

        // FIX CRÍTICO: NO ENVIAR skill_key (tu DB lo tiene GENERATED ALWAYS o similar)
        const payloadBase = { user_id: user.id, skill_name: name };

        if (looksLikeUuid(id)) {
          toUpsert.push({ id, ...payloadBase });
        } else {
          toInsert.push(payloadBase);
        }
      }

      if (toInsert.length) {
        const { error } = await supabase.from("candidate_skills").insert(toInsert);
        if (error) {
          if (isRlsBlocked(error)) {
            setStatus(status, `RLS bloquea INSERT candidate_skills. Detalle: ${errMsg(error)}`, "error");
            return;
          }
          setStatus(status, `Error INSERT candidate_skills: ${errMsg(error)}`, "error");
          return;
        }
      }

      if (toUpsert.length) {
        const { error } = await supabase.from("candidate_skills").upsert(toUpsert, { onConflict: "id" });
        if (error) {
          if (isRlsBlocked(error)) {
            setStatus(status, `RLS bloquea UPSERT candidate_skills. Detalle: ${errMsg(error)}`, "error");
            return;
          }
          setStatus(status, `Error UPSERT candidate_skills: ${errMsg(error)}`, "error");
          return;
        }
      }

      // reload para traer ids nuevos
      await loadSkills(list, document.getElementById("tpl_skill_item"), status);

      const t = new Date();
      setStatus(
        status,
        `Guardado ✅ (${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}).`,
        "success"
      );
    } catch (e) {
      setStatus(status, `Error al guardar habilidades: ${errMsg(e)}`, "error");
    } finally {
      btnSave.dataset.saving = "0";
      btnSave.disabled = false;
    }
  }

  /* =========================
     CHIP HELPERS (NO HTML changes)
  ========================= */
  function addChip(list, tpl, row) {
    const id = normalize(row.id);
    const name = normalize(row.skill_name);

    // evita duplicados por nombre (case-insensitive)
    const exists = Array.from(list.querySelectorAll('[data-item="skills"]')).some((c) => {
      const n = normalize(readHidden(c, "skill_name"));
      return n.toLowerCase() === name.toLowerCase() && n.length > 0;
    });
    if (exists) return;

    const chip = cloneTemplate(tpl);
    if (!chip) return;

    chip.setAttribute("data-item", "skills");
    chip.setAttribute("data-id", id || "");

    setHidden(chip, "id", id || "");
    setHidden(chip, "skill_name", name || "");
    setHidden(chip, "level", "");
    setHidden(chip, "years_experience", "");
    setHidden(chip, "skill_key", ""); // SOLO UI hidden (NO se manda a DB)

    setLabel(chip, name || "Nueva habilidad");

    list.appendChild(chip);
  }

  function cloneTemplate(tpl) {
    if (!tpl?.content) return null;
    const frag = tpl.content.cloneNode(true);
    const wrap = document.createElement("div");
    wrap.appendChild(frag);
    return wrap.firstElementChild || null;
  }

  function setLabel(chip, text) {
    const label = chip.querySelector('[data-role="label"], .skill-chip__label');
    if (label) label.textContent = String(text || "");
  }

  function setHidden(chip, field, value) {
    const el = chip.querySelector(`[data-field="${cssEscape(field)}"]`);
    if (!el) return;
    el.value = String(value ?? "");
  }

  function readHidden(chip, field) {
    const el = chip.querySelector(`[data-field="${cssEscape(field)}"]`);
    if (!el) return "";
    return String(el.value ?? "").trim();
  }

  function setStatus(el, msg, type) {
    if (!el) return;
    el.textContent = String(msg ?? "");
    el.dataset.type = type || "info";
  }

  function normalize(v) {
    return String(v ?? "").trim().replace(/\s+/g, " ");
  }

  /* =========================
     SUPABASE + AUTH + UTILS
  ========================= */
  function waitForSupabaseClient(timeoutMs = 5000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const tick = () => {
        const sb = window.supabase;
        if (sb && sb.auth && typeof sb.auth.getUser === "function") return resolve(sb);
        if (Date.now() - start >= timeoutMs) return reject(new Error("Timeout esperando window.supabase"));
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  async function getAuthUserBulletproof(supabase) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!error && data?.user?.id) return data.user;
      } catch (_) {}

      try {
        const { data, error } = await supabase.auth.getSession();
        if (!error && data?.session?.user?.id) return data.session.user;
      } catch (_) {}

      if (attempt < 2) await sleep(150);
    }
    return null;
  }

  function isRlsBlocked(error) {
    const status = error?.status;
    const msg = errMsg(error).toLowerCase();

    if (status === 401 || status === 403) return true;

    return (
      msg.includes("permission denied") ||
      msg.includes("violates row-level security") ||
      msg.includes("rls") ||
      msg.includes("row level security") ||
      msg.includes("policy") ||
      msg.includes("insufficient_privilege") ||
      msg.includes("jwt")
    );
  }

  function looksLikeUuid(s) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      String(s || "").trim()
    );
  }

  function errMsg(e) {
    if (!e) return "Error desconocido";
    if (typeof e === "string") return e;
    if (e.message) return String(e.message);
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }

  function nextPaint() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
    return String(value).replace(/["\\]/g, "\\$&");
  }
})();
 /*********************************
  * fin habilidades
  * **********************/
 /*==========================
 IDIOMAS
 =============================*/
/* =========================================================
   F — IDIOMAS (#panel_languages) — UI + DB + DELETE (FIXED)
   ✅ NO cambia HTML
   ✅ ADD / EDIT / SAVE / LOAD / DELETE
   ✅ template#tpl_language_item con data-field: id, language, proficiency
   ✅ DELETE vía button[data-action="delete"] dentro del item
========================================================= */
(function LanguagesModule_V4() {
  "use strict";

  // Mata inits viejos si existen (por copy/paste previo)
  window.__thsLanguagesModuleInit = true;

  if (window.__thsLanguagesModuleInit_V4) return;
  window.__thsLanguagesModuleInit_V4 = true;

  const PROF_LEVELS = [
    { value: "", label: "Selecciona" },
    { value: "basic", label: "Básico" },
    { value: "intermediate", label: "Intermedio" },
    { value: "advanced", label: "Avanzado" },
    { value: "expert", label: "Experto" },
    { value: "native", label: "Nativo" },
  ];

  document.addEventListener("DOMContentLoaded", () => {
    init().catch((e) => console.error("[languages-v4] init error:", e));
  });

  async function init() {
    const panel = document.getElementById("panel_languages");
    if (!panel) return;

    const list = document.getElementById("languages_list");
    const tpl = document.getElementById("tpl_language_item");
    const btnAdd = document.getElementById("btn_lang_add");
    const btnSave = document.getElementById("btn_lang_save");
    const status = document.getElementById("languages_status");

    if (!list || !tpl || !btnAdd || !btnSave || !status) return;

    // Evita doble bind
    if (panel.dataset.boundLanguagesV4 === "1") return;
    panel.dataset.boundLanguagesV4 = "1";

    // ADD
    btnAdd.addEventListener("click", () => {
      try {
        const item = cloneLanguageTemplate(tpl);
        if (!item) return;

        setField(item, "id", "");
        setField(item, "language", "");
        ensureProficiencyDropdown(item, "");

        list.appendChild(item);

        setStatus(status, "Idioma agregado. Completa y presiona Guardar.", "info");
        const langEl = findFieldEl(item, "language");
        if (langEl && typeof langEl.focus === "function") langEl.focus();
      } catch (e) {
        setStatus(status, `Error al agregar idioma: ${errMsg(e)}`, "error");
      }
    });

    // SAVE
    btnSave.addEventListener("click", async () => {
      await saveLanguagesToDB(list, status, btnSave);
    });

    // DELETE (delegación)
    list.addEventListener(
      "click",
      async (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return;

        const btnDel = target.closest('button[data-action="delete"]');
        if (!btnDel) return;

        const item =
          btnDel.closest('.item-card[data-item="languages"]') ||
          btnDel.closest('[data-item="languages"]');
        if (!item) {
          setStatus(status, "Error: no encontré el item del idioma (DOM).", "error");
          return;
        }

        e.preventDefault();

        const langName = (readField(item, "language") || "este idioma").trim();
        const ok = window.confirm(`Vas a eliminar "${langName}". ¿Aceptar?`);
        if (!ok) return;

        // UI first
        const rowId = (readField(item, "id") || "").trim();
        item.remove();
        setStatus(status, `Idioma eliminado (UI): ${langName}`, "info");

        // Si no tenía id => era nuevo no guardado
        if (!rowId) {
          setStatus(status, "Idioma eliminado ✅ (no estaba guardado).", "success");
          return;
        }

        const supabase = await waitForSupabaseClient(5000).catch(() => null);
        if (!supabase?.auth) {
          setStatus(status, "Eliminado en UI. Supabase no disponible para borrar en DB.", "error");
          return;
        }

        const authUser = await getAuthUserBulletproof(supabase);
        if (!authUser?.id) {
          window.location.href = "/web/auth/login-candidate.html";
          return;
        }

        const { error } = await supabase
          .from("candidate_languages")
          .delete()
          .eq("id", rowId)
          .eq("user_id", authUser.id);

        if (error) {
          if (isRlsBlocked(error)) {
            setStatus(
              status,
              `RLS bloquea DELETE candidate_languages. id=${rowId}. Detalle: ${errMsg(error)}`,
              "error"
            );
            return;
          }
          setStatus(status, `Error DELETE candidate_languages: ${errMsg(error)}`, "error");
          return;
        }

        setStatus(status, "Idioma eliminado ✅ (DB).", "success");
      },
      true
    );

    // Auth hook: recarga cuando cambia sesión
    if (window.supabase?.auth?.onAuthStateChange) {
      if (!window.__thsLanguagesAuthHooked_V4) {
        window.__thsLanguagesAuthHooked_V4 = true;
        window.supabase.auth.onAuthStateChange(() => {
          loadLanguagesFromDB(list, tpl, status);
        });
      }
    }

    // LOAD inicial
    await loadLanguagesFromDB(list, tpl, status);
  }

  /* =========================================================
     SAVE — insert/update
  ========================================================= */
  async function saveLanguagesToDB(list, status, btnSave) {
    if (btnSave.dataset.saving === "1") return;
    btnSave.dataset.saving = "1";

    try {
      const items = Array.from(list.querySelectorAll('[data-item="languages"]'));
      if (items.length === 0) {
        setStatus(status, "No hay idiomas para guardar. Agrega al menos uno.", "error");
        return;
      }

      const supabase = await waitForSupabaseClient(5000).catch(() => null);
      if (!supabase?.auth) {
        setStatus(status, "Error: Supabase no disponible.", "error");
        return;
      }

      setStatus(status, "Guardando idiomas…", "info");
      await nextPaint();
      btnSave.disabled = true;

      const authUser = await getAuthUserBulletproof(supabase);
      if (!authUser?.id) {
        window.location.href = "/web/auth/login-candidate.html";
        return;
      }

      const rows = [];
      for (const item of items) {
        // asegura el select siempre
        ensureProficiencyDropdown(item, readField(item, "proficiency"));

        const id = readField(item, "id");
        const language = readField(item, "language");
        const proficiency = readField(item, "proficiency");

        if (!language) {
          setStatus(status, "Error: cada item requiere Idioma.", "error");
          return;
        }
        if (language.length > 80) {
          setStatus(status, "Error: Idioma supera 80 caracteres.", "error");
          return;
        }
        if (proficiency.length > 40) {
          setStatus(status, "Error: Proficiencia supera 40 caracteres.", "error");
          return;
        }

        const payload = {
          user_id: authUser.id,
          language: String(language),
          proficiency: proficiency ? String(proficiency) : null,
        };

        if (looksLikeUuid(id)) payload.id = id;
        rows.push(payload);
      }

      const withId = rows.filter((r) => !!r.id);
      const withoutId = rows.filter((r) => !r.id);

      if (withoutId.length) {
        const { error } = await supabase.from("candidate_languages").insert(withoutId);
        if (error) {
          if (isRlsBlocked(error)) {
            setStatus(status, `RLS bloquea INSERT candidate_languages. Detalle: ${errMsg(error)}`, "error");
            return;
          }
          setStatus(status, `Error INSERT candidate_languages: ${errMsg(error)}`, "error");
          return;
        }
      }

      if (withId.length) {
        const { error } = await supabase.from("candidate_languages").upsert(withId, { onConflict: "id" });
        if (error) {
          if (isRlsBlocked(error)) {
            setStatus(status, `RLS bloquea UPSERT candidate_languages. Detalle: ${errMsg(error)}`, "error");
            return;
          }
          setStatus(status, `Error UPSERT candidate_languages: ${errMsg(error)}`, "error");
          return;
        }
      }

      const t = new Date();
      setStatus(
        status,
        `Guardado ✅ (${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}).`,
        "success"
      );

      // reload para traer ids nuevos
      const tpl = document.getElementById("tpl_language_item");
      if (tpl) await loadLanguagesFromDB(list, tpl, status);
    } catch (e) {
      setStatus(status, `Error al guardar idiomas: ${errMsg(e)}`, "error");
    } finally {
      btnSave.dataset.saving = "0";
      btnSave.disabled = false;
    }
  }

  /* =========================================================
     LOAD — repinta desde DB
  ========================================================= */
  async function loadLanguagesFromDB(list, tpl, status) {
    try {
      const supabase = await waitForSupabaseClient(5000).catch(() => null);
      if (!supabase?.auth) {
        setStatus(status, "Error: Supabase no disponible.", "error");
        return;
      }

      setStatus(status, "Cargando idiomas…", "info");
      await nextPaint();

      const authUser = await getAuthUserBulletproof(supabase);
      if (!authUser?.id) {
        window.location.href = "/web/auth/login-candidate.html";
        return;
      }

      const { data, error } = await supabase
        .from("candidate_languages")
        .select("id, language, proficiency, created_at")
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: true });

      if (error) {
        if (isRlsBlocked(error)) {
          setStatus(status, `RLS bloquea SELECT candidate_languages. Detalle: ${errMsg(error)}`, "error");
          return;
        }
        setStatus(status, `Error SELECT candidate_languages: ${errMsg(error)}`, "error");
        return;
      }

      list.innerHTML = "";

      if (!data || data.length === 0) {
        setStatus(status, "Sin idiomas guardados todavía. Agrega uno y presiona Guardar.", "info");
        return;
      }

      for (const row of data) {
        const item = cloneLanguageTemplate(tpl);
        if (!item) return;

        setField(item, "id", row.id || "");
        setField(item, "language", row.language || "");
        ensureProficiencyDropdown(item, row.proficiency || "");

        list.appendChild(item);
      }

      setStatus(status, `Idiomas cargados ✅ (${data.length}).`, "success");
    } catch (e) {
      setStatus(status, `Error al cargar idiomas: ${errMsg(e)}`, "error");
    }
  }

  /* =========================================================
     TEMPLATE CLONE
  ========================================================= */
  function cloneLanguageTemplate(tpl) {
    if (!tpl) return null;
    if (!tpl.content) return null;

    const frag = tpl.content.cloneNode(true);
    const wrapper = document.createElement("div");
    wrapper.appendChild(frag);

    const item = wrapper.firstElementChild || wrapper;
    item.setAttribute("data-item", "languages");

    return item;
  }

  /* =========================================================
     PROFICIENCY DROPDOWN
  ========================================================= */
  function ensureProficiencyDropdown(item, selectedValue) {
    if (!item) return;

    // Ya existe select
    const existing = item.querySelector('select[data-field="proficiency"]');
    if (existing) {
      existing.value = String(selectedValue ?? "");
      return;
    }

    // Input original (del template)
    const input = item.querySelector('input[data-field="proficiency"]');
    if (!input) return;

    const sel = document.createElement("select");
    sel.className = input.className || "input";
    sel.setAttribute("data-field", "proficiency");

    for (const opt of PROF_LEVELS) {
      const o = document.createElement("option");
      o.value = String(opt.value);
      o.textContent = opt.label;
      sel.appendChild(o);
    }

    sel.value = String(selectedValue ?? "");
    input.replaceWith(sel);
  }

  /* =========================================================
     FIELD HELPERS
  ========================================================= */
  function findFieldEl(item, field) {
    if (!item) return null;
    return item.querySelector(`[data-field="${cssEscape(field)}"]`);
  }

  function readField(item, field) {
    const el = findFieldEl(item, field);
    if (!el) return "";
    if ("value" in el) return String(el.value ?? "").trim();
    return String(el.textContent ?? "").trim();
  }

  function setField(item, field, value) {
    const el = findFieldEl(item, field);
    if (!el) return;
    const v = value === null || value === undefined ? "" : String(value);
    if ("value" in el) el.value = v;
    else el.textContent = v;
  }

  /* =========================================================
     STATUS
  ========================================================= */
  function setStatus(el, msg, type) {
    if (!el) return;
    el.textContent = String(msg ?? "");
    el.dataset.type = type || "info";
  }

  /* =========================================================
     SUPABASE + AUTH + UTILS
  ========================================================= */
  function waitForSupabaseClient(timeoutMs = 5000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const tick = () => {
        const sb = window.supabase;
        if (sb && sb.auth && typeof sb.auth.getUser === "function") return resolve(sb);
        if (Date.now() - start >= timeoutMs) return reject(new Error("Timeout esperando window.supabase"));
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  async function getAuthUserBulletproof(supabase) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!error && data?.user?.id) return data.user;
      } catch (_) {}

      try {
        const { data, error } = await supabase.auth.getSession();
        if (!error && data?.session?.user?.id) return data.session.user;
      } catch (_) {}

      if (attempt < 2) await sleep(150);
    }
    return null;
  }

  function isRlsBlocked(error) {
    const status = error?.status;
    const msg = errMsg(error).toLowerCase();
    if (status === 401 || status === 403) return true;
    return (
      msg.includes("permission denied") ||
      msg.includes("not allowed") ||
      msg.includes("insufficient_privilege") ||
      msg.includes("jwt") ||
      msg.includes("rls") ||
      msg.includes("row level security") ||
      msg.includes("policy")
    );
  }

  function looksLikeUuid(s) {
    const v = String(s || "").trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  }

  function errMsg(e) {
    if (!e) return "Error desconocido";
    if (typeof e === "string") return e;
    if (e.message) return String(e.message);
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }

  function nextPaint() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
    return String(value).replace(/["\\]/g, "\\$&");
  }
})();

  /*********************************
  * fin IDIOMAS
  * **********************/
