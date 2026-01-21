// /web/auth/login-candidate.js
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginCandidateForm");
  const msg = document.getElementById("msg");
  const btn = document.getElementById("btn");

  if (!form) return;

  const show = (t, ok = false) => {
    msg.textContent = t || "";
    msg.style.color = ok ? "green" : "crimson";
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    show("");

    if (!window.supabase) {
      show("ERROR: Supabase no está cargado.");
      return;
    }

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!email || !password) {
      show("Correo y contraseña son obligatorios.");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Ingresando...";

    try {
      const { data, error } = await window.supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      show("Inicio de sesión correcto.", true);

      // Redirige al dashboard del candidato
      setTimeout(() => {
        window.location.href = "candidate-information.html";
      }, 800);

    } catch (err) {
      show(err.message || "No se pudo iniciar sesión.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Iniciar sesión";
    }
  });
});

