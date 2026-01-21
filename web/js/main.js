
document.addEventListener("DOMContentLoaded", () => {
  // ============== FOOTER ==============
  const footerPlaceholder = document.getElementById("footer-placeholder");
  if (footerPlaceholder) {
    fetch("footer.html")
      .then(res => res.text())
      .then(html => {
        footerPlaceholder.innerHTML = html;
      })
      .catch(err => {
        console.error("Error cargando footer:", err);
      });
  }

  // ============== FAQ ==============
  const faqItems = document.querySelectorAll(".faq-item");
  faqItems.forEach(item => {
    const btn = item.querySelector(".faq-question");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const isActive = item.classList.contains("active");
      faqItems.forEach(i => i.classList.remove("active"));
      if (!isActive) item.classList.add("active");
    });
  });

  // ============== COMUNIDAD (CARDS DEMO) ==============
  const communityFeed = document.getElementById("communityFeed");
  if (communityFeed) {
    const posts = [
      {
        initials: "TG",
        name: "Tatiana González",
        role: "Reclutadora LATAM",
        text: "Hoy cerramos 5 posiciones operativas en menos de una semana. El problema nunca fue la falta de gente, sino la falta de filtro.",
        meta: "Reclutamiento · LATAM"
      },
      {
        initials: "AM",
        name: "Ana Morán",
        role: "Marketing Specialist",
        text: "Pasé de no recibir llamadas a tener 3 entrevistas en una semana luego de ajustar mi perfil con la IA de Talenora.",
        meta: "Candidata · Marketing"
      },
      {
        initials: "HR",
        name: "Carlos Rivera",
        role: "HR Manager · Hotel",
        text: "Por primera vez sentí que la plataforma entendía los turnos rotativos y la realidad operativa de hotelería.",
        meta: "Empresa · Hotelería"
      }
    ];

    posts.forEach(p => {
      const card = document.createElement("article");
      card.className = "feed-card";

      card.innerHTML = `
        <div class="feed-top">
          <div class="avatar-sm">${p.initials}</div>
          <div>
            <div class="feed-name">${p.name}</div>
            <div class="feed-role">${p.role}</div>
          </div>
        </div>
        <div class="feed-text">${p.text}</div>
        <div class="feed-meta">
          <span>${p.meta}</span>
        </div>
      `;
      communityFeed.appendChild(card);
    });
  }

  // ============== TESTIMONIOS SLIDER ==============
  const slider = document.getElementById("tpSlider");
  const dotsContainer = document.getElementById("tpDots");
  const prevBtn = document.querySelector(".tp-arrow.left");
  const nextBtn = document.querySelector(".tp-arrow.right");

  if (slider) {
    const slides = Array.from(slider.querySelectorAll(".tp-slide"));
    let currentIndex = 0;

    // Crear dots
    if (dotsContainer) {
      slides.forEach((_, idx) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "tp-dot" + (idx === 0 ? " active" : "");
        dot.addEventListener("click", () => goToSlide(idx));
        dotsContainer.appendChild(dot);
      });
    }

    function updateDots() {
      if (!dotsContainer) return;
      const dots = dotsContainer.querySelectorAll(".tp-dot");
      dots.forEach((d, i) => {
        d.classList.toggle("active", i === currentIndex);
      });
    }

    function goToSlide(index) {
      if (!slides.length) return;
      currentIndex = (index + slides.length) % slides.length;
      const offset = -currentIndex * 100;
      slider.style.transform = `translateX(${offset}%)`;
      updateDots();
    }

    if (prevBtn) {
      prevBtn.addEventListener("click", () => {
        goToSlide(currentIndex - 1);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        goToSlide(currentIndex + 1);
      });
    }

    // Auto-play suave
    setInterval(() => {
      goToSlide(currentIndex + 1);
    }, 8000);
  }

  // ============== RATING TESTIMONIOS ==============
  const ratingWrapper = document.querySelector(".tp-rating");
  const ratingInput = document.getElementById("tpRatingValue");
  if (ratingWrapper && ratingInput) {
    const stars = Array.from(ratingWrapper.querySelectorAll(".rstar"));
    stars.forEach((star, idx) => {
      star.addEventListener("click", () => {
        const value = idx + 1;
        ratingInput.value = String(value);
        ratingWrapper.setAttribute("data-rating", value);
        stars.forEach((s, i) => {
          if (i < value) {
            s.classList.add("active");
          } else {
            s.classList.remove("active");
          }
        });
      });
    });
  }

  // ============== FORM TESTIMONIOS (MVP FRONT) ==============
  const tpForm = document.getElementById("tpForm");
  const tpFormNote = document.getElementById("tpFormNote");

  if (tpForm && tpFormNote) {
    tpForm.addEventListener("submit", (e) => {
      e.preventDefault();
      tpFormNote.textContent = "Gracias por tu testimonio. En la siguiente versión lo podrás ver publicado en la comunidad.";
      tpForm.reset();
      if (ratingInput) ratingInput.value = "0";
      const ratingStars = tpForm.querySelectorAll(".rstar");
      ratingStars.forEach(s => s.classList.remove("active"));
    });
  }

  // ============== TATIANA WIDGET ==============
  const tatianaFab = document.getElementById("tatianaFab");
  const tatianaPanel = document.getElementById("tatianaPanel");
  const tatianaClose = document.getElementById("tatianaClose");
  const tatianaForm = document.getElementById("tatianaForm");
  const tatianaInput = document.getElementById("tatianaInput");
  const tatianaMessages = document.getElementById("tatianaMessages");

  function toggleTatiana(open) {
    if (!tatianaPanel) return;
    const isOpen = tatianaPanel.classList.contains("open");
    if (open === true || (!isOpen && open === undefined)) {
      tatianaPanel.classList.add("open");
      tatianaPanel.setAttribute("aria-hidden", "false");
      if (tatianaInput) tatianaInput.focus();
    } else {
      tatianaPanel.classList.remove("open");
      tatianaPanel.setAttribute("aria-hidden", "true");
    }
  }

  if (tatianaFab) {
    tatianaFab.addEventListener("click", () => toggleTatiana());
  }

  if (tatianaClose) {
    tatianaClose.addEventListener("click", () => toggleTatiana(false));
  }

  if (tatianaForm && tatianaInput && tatianaMessages) {
    tatianaForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = tatianaInput.value.trim();
      if (!text) return;

      // Mensaje usuario
      const userMsg = document.createElement("div");
      userMsg.className = "msg user";
      userMsg.textContent = text;
      tatianaMessages.appendChild(userMsg);

      tatianaInput.value = "";

      // Respuesta bot simple (placeholder)
      const botMsg = document.createElement("div");
      botMsg.className = "msg bot";
      botMsg.textContent =
        "Gracias por tu mensaje. En esta primera versión, este asistente es solo una guía visual dentro de la landing. En el CRM real, aquí se conectará tu motor de IA para candidatos y empresas.";
      tatianaMessages.appendChild(botMsg);

      tatianaMessages.scrollTop = tatianaMessages.scrollHeight;
    });
  }
});
