/**
 * v3 App shell — top nav, hash routing, tweaks, design-doc drawer.
 * Routes: frontier | trace-diff | behavior | leaderboard
 *
 * We reuse the v2 leaderboard/evals/prompts/runs screens if the user clicks
 * through to the old views. The three new screens (frontier, trace-diff,
 * behavior) each register themselves on window.__V3_SCREENS.
 */

(() => {
  const TWEAKS = window.TWEAKS = {
    theme:   localStorage.getItem("cmbv3_theme")   || "light",
    density: localStorage.getItem("cmbv3_density") || "default",
    accent:  localStorage.getItem("cmbv3_accent")  || "terracotta",
  };

  const ROUTES = ["frontier", "trace-diff", "behavior", "leaderboard"];
  function validRoute(r) { return ROUTES.includes(r); }

  function currentRoute() {
    const h = (location.hash || "").replace("#", "");
    return validRoute(h) ? h : (localStorage.getItem("cmbv3_route") || "frontier");
  }

  function screenFor(route) {
    if (route === "frontier")    return window.__V3_SCREENS.frontier;
    if (route === "trace-diff")  return window.__V3_SCREENS.traceDiff;
    if (route === "behavior")    return window.__V3_SCREENS.behavior;
    if (route === "leaderboard") return window.__V3_SCREENS.leaderboard;
    return window.__V3_SCREENS.frontier;
  }

  function render() {
    const route = currentRoute();
    document.querySelectorAll(".topnav button[data-route]").forEach(b =>
      b.classList.toggle("active", b.dataset.route === route)
    );
    const screen = screenFor(route);
    const shell = document.getElementById("shell");
    shell.innerHTML = screen.render();
    screen.mount();
    document.querySelectorAll("[data-route]").forEach(el => {
      if (el.tagName === "BUTTON" && el.closest(".topnav")) return;
      el.addEventListener("click", (e) => {
        e.preventDefault();
        navigate(el.dataset.route);
      });
    });
  }

  function navigate(route) {
    if (!validRoute(route)) route = "frontier";
    location.hash = route;
    localStorage.setItem("cmbv3_route", route);
    render();
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  window.__APP = { render, navigate };

  document.querySelectorAll(".topnav button[data-route]").forEach(b => {
    b.addEventListener("click", () => navigate(b.dataset.route));
  });
  window.addEventListener("hashchange", () => render());

  const body = document.body;
  function applyTweak(key, val) {
    if (key === "theme")   { body.setAttribute("data-theme", val); TWEAKS.theme = val; localStorage.setItem("cmbv3_theme", val); }
    if (key === "density") { body.setAttribute("data-density", val); TWEAKS.density = val; localStorage.setItem("cmbv3_density", val); }
    if (key === "accent")  { body.setAttribute("data-accent", val); TWEAKS.accent = val; localStorage.setItem("cmbv3_accent", val); }
    document.querySelectorAll(`.seg[data-key="${key}"] button`).forEach(b =>
      b.classList.toggle("active", b.dataset.val === val)
    );
    document.querySelectorAll(`.swatch[data-accent]`).forEach(el =>
      el.classList.toggle("active", el.dataset.accent === val)
    );
  }
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
  document.addEventListener("click", (e) => {
    const panel = document.getElementById("tweaks");
    if (!panel.classList.contains("show")) return;
    if (panel.contains(e.target) || e.target.closest("#tweaksBtn")) return;
    panel.classList.remove("show");
  });

  document.getElementById("docBtn").addEventListener("click", () => {
    document.getElementById("doc").classList.add("open");
  });
  document.getElementById("docClose").addEventListener("click", () => {
    document.getElementById("doc").classList.remove("open");
  });
  document.getElementById("themeBtn").addEventListener("click", () => {
    applyTweak("theme", TWEAKS.theme === "light" ? "dark" : "light");
  });

  render();
})();
