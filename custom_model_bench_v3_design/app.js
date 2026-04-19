/**
 * App shell — top nav, hash routing, tweaks drawer, design-doc drawer.
 */

(() => {
  const TWEAKS = window.TWEAKS = {
    theme:   localStorage.getItem("cmbv2_theme")   || "light",
    density: localStorage.getItem("cmbv2_density") || "default",
    accent:  localStorage.getItem("cmbv2_accent")  || "terracotta",
  };

  function validRoute(r) {
    return ["leaderboard", "evals", "prompts", "runs"].includes(r);
  }
  function currentRoute() {
    const h = (location.hash || "").replace("#", "");
    return validRoute(h) ? h : (localStorage.getItem("cmbv2_route") || "leaderboard");
  }

  function render() {
    const route = currentRoute();
    // Set active tab
    document.querySelectorAll(".topnav button[data-route]").forEach(b =>
      b.classList.toggle("active", b.dataset.route === route)
    );
    // Render sidebar + main
    document.getElementById("shell").innerHTML =
      window.__SIDEBAR.render() +
      (window.__SCREENS[route].render());
    window.__SIDEBAR.mount();
    window.__SCREENS[route].mount();
    // Global back-links / cross-nav (data-route attributes)
    document.querySelectorAll("[data-route]").forEach(el => {
      if (el.tagName === "BUTTON" && el.closest(".topnav")) return; // handled below
      el.addEventListener("click", (e) => {
        e.preventDefault();
        navigate(el.dataset.route);
      });
    });
  }

  function navigate(route) {
    if (!validRoute(route)) route = "leaderboard";
    location.hash = route;
    localStorage.setItem("cmbv2_route", route);
    render();
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  window.__APP = { render, navigate };

  // ---------- Top-nav buttons ----------
  document.querySelectorAll(".topnav button[data-route]").forEach(b => {
    b.addEventListener("click", () => navigate(b.dataset.route));
  });
  window.addEventListener("hashchange", () => render());

  // ---------- Tweaks drawer ----------
  const body = document.body;
  function applyTweak(key, val) {
    if (key === "theme")   { body.setAttribute("data-theme", val); TWEAKS.theme = val; localStorage.setItem("cmbv2_theme", val); }
    if (key === "density") { body.setAttribute("data-density", val); TWEAKS.density = val; localStorage.setItem("cmbv2_density", val); }
    if (key === "accent")  { body.setAttribute("data-accent", val); TWEAKS.accent = val; localStorage.setItem("cmbv2_accent", val); }
    document.querySelectorAll(`.seg[data-key="${key}"] button`).forEach(b =>
      b.classList.toggle("active", b.dataset.val === val)
    );
    document.querySelectorAll(`.swatch[data-accent]`).forEach(el =>
      el.classList.toggle("active", el.dataset.accent === val)
    );
  }
  // Initial state
  applyTweak("theme", TWEAKS.theme);
  applyTweak("density", TWEAKS.density);
  applyTweak("accent", TWEAKS.accent);

  document.querySelectorAll(".seg").forEach(seg => {
    seg.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      applyTweak(seg.dataset.key, btn.dataset.val);
    });
  });
  document.querySelectorAll(".swatch[data-accent]").forEach(el => {
    el.addEventListener("click", () => applyTweak("accent", el.dataset.accent));
  });

  document.getElementById("tweaksBtn").addEventListener("click", () => {
    document.getElementById("tweaks").classList.toggle("show");
  });
  // Click outside to close
  document.addEventListener("click", (e) => {
    const panel = document.getElementById("tweaks");
    if (!panel.classList.contains("show")) return;
    if (panel.contains(e.target) || e.target.closest("#tweaksBtn")) return;
    panel.classList.remove("show");
  });

  // ---------- Design-doc drawer ----------
  document.getElementById("docBtn").addEventListener("click", () => {
    document.getElementById("doc").classList.add("open");
  });
  document.getElementById("docClose").addEventListener("click", () => {
    document.getElementById("doc").classList.remove("open");
  });

  // ---------- Theme quick-toggle in header ----------
  document.getElementById("themeBtn").addEventListener("click", () => {
    applyTweak("theme", TWEAKS.theme === "light" ? "dark" : "light");
  });

  // Boot
  render();
})();
