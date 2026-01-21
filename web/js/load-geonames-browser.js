// web/js/load-geonames-browser.js
// Maneja los selects de país / estado / ciudad + código telefónico

document.addEventListener("DOMContentLoaded", async () => {
  const countrySelect   = document.getElementById("countrySelect");
  const stateSelect     = document.getElementById("stateSelect");
  const citySelect      = document.getElementById("citySelect");
  const phoneCodeEl     = document.getElementById("phoneCode");
  const phoneHiddenEl   = document.getElementById("phoneCountryCode");

  // Si el formulario no está en esta página, no hacemos nada
  if (!countrySelect || !stateSelect || !citySelect) {
    console.warn("[geo] No se encontraron selects de ubicación en esta página.");
    return;
  }

  // ======================================
  // CONFIGURAR SUPABASE (FRONTEND)
  // ======================================
  const SUPABASE_URL = "https://rcojfvpucyhtjbyjtdqp.supabase.co";          
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjb2pmdnB1Y3lodGpieWp0ZHFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxMTMxNjMsImV4cCI6MjA4MDY4OTE2M30.uNYjYIix4QTv5fLHmBQlLwWJBHvepTgWYu8ROtxPUNA"; 

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Helper para setear selects rápidamente
  function setSelectOptions(selectEl, placeholder, items, makeOption) {
    selectEl.innerHTML = ""; // limpiamos todo
    const baseOpt = document.createElement("option");
    baseOpt.value = "";
    baseOpt.textContent = placeholder;
    selectEl.appendChild(baseOpt);

    items.forEach(item => {
      const opt = makeOption(item);
      selectEl.appendChild(opt);
    });
  }

  // ======================================
  // 1) CARGAR PAISES (type='country')
  =======================================
  try {
    const { data: countries, error } = await client
      .from("places")
      .select("id, name, phone_code")
      .eq("type", "country")
      .order("name", { ascending: true });

    if (error) {
      console.error("[geo] Error cargando países:", error.message);
      return;
    }

    setSelectOptions(
      countrySelect,
      "Selecciona tu país",
      countries,
      (c) => {
        const opt = document.createElement("option");
        opt.value = c.id;                 // guardamos el ID real
        opt.textContent = c.name;
        opt.dataset.code = c.phone_code || "+---";
        return opt;
      }
    );

    // Dejamos deshabilitados estado/ciudad hasta que se seleccione país
    stateSelect.disabled = true;
    citySelect.disabled = true;
  } catch (err) {
    console.error("[geo] Error inesperado cargando países:", err);
    return;
  }

  // ======================================
  // 2) CUANDO CAMBIA PAÍS → CARGAR ESTADOS
  // ======================================
  countrySelect.addEventListener("change", async () => {
    const countryId = countrySelect.value;

    // Reseteamos selects dependientes
    setSelectOptions(stateSelect, "Selecciona un estado", [], () => document.createElement("option"));
    setSelectOptions(citySelect, "Selecciona una ciudad", [], () => document.createElement("option"));
    stateSelect.disabled = true;
    citySelect.disabled = true;

    if (!countryId) {
      // también reseteamos código telefónico
      if (phoneCodeEl) phoneCodeEl.textContent = "+---";
      if (phoneHiddenEl) phoneHiddenEl.value = "";
      return;
    }

    // Actualizar código telefónico según país
    const selectedOpt = countrySelect.selectedOptions[0];
    const phoneCode = selectedOpt?.dataset?.code || "+---";
    if (phoneCodeEl) phoneCodeEl.textContent = phoneCode;
    if (phoneHiddenEl) phoneHiddenEl.value = phoneCode;

    try {
      const { data: states, error } = await client
        .from("places")
        .select("id, name")
        .eq("type", "admin1")
        .eq("parent_id", countryId)
        .order("name", { ascending: true });

      if (error) {
        console.error("[geo] Error cargando estados:", error.message);
        return;
      }

      setSelectOptions(
        stateSelect,
        "Selecciona un estado",
        states,
        (s) => {
          const opt = document.createElement("option");
          opt.value = s.id;
          opt.textContent = s.name;
          return opt;
        }
      );

      stateSelect.disabled = false;
    } catch (err) {
      console.error("[geo] Error inesperado cargando estados:", err);
    }
  });

  // ======================================
  // 3) CUANDO CAMBIA ESTADO → CARGAR CIUDADES
  // ======================================
  stateSelect.addEventListener("change", async () => {
    const stateId = stateSelect.value;

    setSelectOptions(citySelect, "Selecciona una ciudad", [], () => document.createElement("option"));
    citySelect.disabled = true;

    if (!stateId) return;

    try {
      const { data: cities, error } = await client
        .from("places")
        .select("id, name")
        .eq("type", "city")
        .eq("parent_id", stateId)
        .order("name", { ascending: true })
        .limit(500); // para no matar el navegador

      if (error) {
        console.error("[geo] Error cargando ciudades:", error.message);
        return;
      }

      setSelectOptions(
        citySelect,
        "Selecciona una ciudad",
        cities,
        (ci) => {
          const opt = document.createElement("option");
          opt.value = ci.id;      // O ci.name si prefieres guardar texto
          opt.textContent = ci.name;
          return opt;
        }
      );

      citySelect.disabled = false;
    } catch (err) {
      console.error("[geo] Error inesperado cargando ciudades:", err);
    }
  });
});
