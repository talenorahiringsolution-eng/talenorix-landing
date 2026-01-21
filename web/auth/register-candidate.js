
/* /web/auth/register-candidate.js
   REGISTER CANDIDATO — FULL BULLETPROOF (sin romper nada)
   - Usa IDs reales del HTML actual
   - Muestra mensajes claros (confirm email, email ya existe, etc.)
   - Valida password rules + match
   - No intenta escribir en public.profiles (lo hace el trigger handle_new_user)
*/

(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("registerCandidateForm");
    if (!form) return;

    const btn = document.getElementById("btn");
    const msg = document.getElementById("msg");

    const first_name = document.getElementById("first_name");
    const middle_name = document.getElementById("middle_name");
    const last_name = document.getElementById("last_name");
    const second_last_name = document.getElementById("second_last_name");
    const email = document.getElementById("email");
    const pass1 = document.getElementById("password");
    const pass2 = document.getElementById("password2");

    // Password rules UI (si existen)
    const rLen = document.getElementById("rLen");
    const rUp = document.getElementById("rUp");
    const rNum = document.getElementById("rNum");
    const rSp = document.getElementById("rSp");
    const rEq = document.getElementById("rEq");
    const pwdError = document.getElementById("pwdError");

    let submitting = false;

    // Reglas live
    const bindLiveRules = () => {
      const handler = () => {
        const p1 = (pass1?.value || "");
        const p2 = (pass2?.value || "");
        const rules = evaluatePasswordRules(p1, p2);

        paintRule(rLen, rules.lenOk);
        paintRule(rUp, rules.upperOk);
        paintRule(rNum, rules.numOk);
        paintRule(rSp, rules.specialOk);
        paintRule(rEq, rules.matchOk);

        if (pwdError) pwdError.style.display = rules.matchOk ? "none" : "block";
      };

      if (pass1) pass1.addEventListener("input", handler);
      if (pass2) pass2.addEventListener("input", handler);
      handler();
    };

    bindLiveRules();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (submitting) return;
      submitting = true;

      if (btn) btn.disabled = true;
      setMsg("Creando cuenta…", "info");

      try {
        const supabase = window.supabase;
        if (!supabase?.auth) {
          setMsg(
            "Error crítico: Supabase no está inicializado. Verifica que /web/supabaseClient.js esté cargando correctamente.",
            "error"
          );
          return;
        }

        const emailVal = clean(email?.value);
        const p1 = pass1?.value || "";
        const p2 = pass2?.value || "";

        const f1 = clean(first_name?.value);
        const m1 = clean(middle_name?.value);
        const l1 = clean(last_name?.value);
        const l2 = clean(second_last_name?.value);

        if (!f1 || !l1) {
          setMsg("Primer nombre y primer apellido son obligatorios.", "error");
          return;
        }

        if (!emailVal) {
          setMsg("Debes colocar un correo electrónico válido.", "error");
          return;
        }

        const rules = evaluatePasswordRules(p1, p2);
        if (!rules.allOk) {
          setMsg(
            "Tu contraseña no cumple los requisitos. Corrige las reglas marcadas y asegúrate que coincidan.",
            "error"
          );
          return;
        }

        // ✅ Redirect permitido por Supabase Auth URL Configuration
        const redirectTo = `${window.location.origin}/web/auth/login-candidate.html`;

        // ✅ SignUp con metadata (para trigger handle_new_user)
        const { data, error } = await supabase.auth.signUp({
          email: emailVal,
          password: p1,
          options: {
            data: {
              role: "candidate",
              first_name: f1,
              middle_name: m1,
              last_name: l1,
              second_last_name: l2,
            },
            emailRedirectTo: redirectTo,
          },
        });

        if (error) {
          const nice = humanAuthError(error);
          setMsg(nice, "error");
          return;
        }

        // ✅ Confirm email ON → data.session usualmente null, PERO data.user existe
        if (!data?.user?.id) {
          setMsg(
            "Registro incompleto: Supabase no devolvió el usuario. Revisa Auth Logs (puede ser rate limit o bloqueo).",
            "error"
          );
          return;
        }

        // Mensaje final claro y sin confusión
        setMsg(
          "✅ Cuenta creada. Ve a tu correo y confirma el registro (Confirm email). Luego regresa e inicia sesión.",
          "success"
        );

        form.reset();
        bindLiveRules();
      } catch (err) {
        setMsg(`Error inesperado: ${String(err?.message || err)}`, "error");
      } finally {
        submitting = false;
        if (btn) btn.disabled = false;
      }
    });

    // ---------------- HELPERS ----------------

    function setMsg(text, type) {
      if (!msg) return;
      msg.textContent = text || "";
      msg.dataset.type = type || "info";
    }

    function clean(v) {
      return (v || "").toString().trim();
    }

    function paintRule(el, ok) {
      if (!el) return;
      el.classList.remove("good", "bad");
      el.classList.add(ok ? "good" : "bad");
    }

    function evaluatePasswordRules(p1, p2) {
      const lenOk = p1.length >= 8;
      const upperOk = /[A-Z]/.test(p1);
      const numCount = (p1.match(/[0-9]/g) || []).length;
      const numOk = numCount >= 4;
      const specialOk = /[!@#$%^&*()_\-+=\[\]{};:'",.<>/?\\|`~]/.test(p1);
      const matchOk = p1.length > 0 && p1 === p2;

      return {
        lenOk,
        upperOk,
        numOk,
        specialOk,
        matchOk,
        allOk: lenOk && upperOk && numOk && specialOk && matchOk,
      };
    }

    function humanAuthError(error) {
      const raw = (error?.message || "").toLowerCase();

      // EMAIL YA EXISTE
      if (
        raw.includes("user already registered") ||
        raw.includes("already registered") ||
        raw.includes("already exists")
      ) {
        return "Ese correo ya existe. Ve a Inicia sesión o usa 'Forgot password' para recuperar acceso.";
      }

      // PASSWORD WEAK
      if (raw.includes("password") && raw.includes("weak")) {
        return "Contraseña débil. Cumple los requisitos: 8+ caracteres, 1 mayúscula, 4 números y 1 especial.";
      }

      // RATE LIMIT
      if (raw.includes("rate limit") || raw.includes("too many requests")) {
        return "Rate limit: estás intentando demasiado rápido. Espera 60 segundos e intenta de nuevo.";
      }

      // EMAIL CONFIRM / SMTP
      if (raw.includes("email") && raw.includes("smtp")) {
        return "Error de envío de correo (SMTP). Revisa Auth > Email / SMTP Settings y Auth Logs.";
      }

      return error?.message || "Error desconocido";
    }
  });
})();
