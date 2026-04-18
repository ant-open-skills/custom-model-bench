// =====================================================================
// App shell — routing, tab state, tweaks, persistence
// =====================================================================

const TWEAKS = window.TWEAKS = {
  theme:      localStorage.getItem('cmb_theme') || 'light',
  density:    localStorage.getItem('cmb_density') || 'comfortable',
  distViz:    localStorage.getItem('cmb_distViz') || 'box',
  heroMetric: localStorage.getItem('cmb_hero') || 'all',
};

function currentRoute() {
  const hash = (location.hash || '').replace('#', '');
  const valid = ['compare', 'detail', 'drill', 'spec'];
  return valid.includes(hash) ? hash : (localStorage.getItem('cmb_route') || 'compare');
}

function setActiveTab(route) {
  document.querySelectorAll('#tabs a').forEach(a => {
    a.classList.toggle('active', a.dataset.route === route);
  });
}

function navigate(route) {
  if (!window.__SCREENS[route]) route = 'compare';
  location.hash = route;
  localStorage.setItem('cmb_route', route);
  setActiveTab(route);
  const main = document.getElementById('main');
  main.innerHTML = window.__SCREENS[route].render();
  window.__SCREENS[route].mount();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

window.__APP = { navigate };

// Tab click
document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-route]');
  if (target) {
    e.preventDefault();
    navigate(target.dataset.route);
  }
});

// Hash change (back button)
window.addEventListener('hashchange', () => navigate(currentRoute()));

// ---------- Tweaks ----------
const body = document.body;

function applyTweak(seg, val) {
  if (seg === 'theme')       { body.setAttribute('data-theme', val);   TWEAKS.theme = val;       localStorage.setItem('cmb_theme', val); }
  if (seg === 'density')     { body.setAttribute('data-density', val); TWEAKS.density = val;     localStorage.setItem('cmb_density', val); }
  if (seg === 'distViz')     { TWEAKS.distViz = val;                    localStorage.setItem('cmb_distViz', val); }
  if (seg === 'heroMetric')  { TWEAKS.heroMetric = val;                 localStorage.setItem('cmb_hero', val); }

  document.querySelectorAll(`.seg[data-seg="${seg}"] button`).forEach(b => {
    b.classList.toggle('active', b.dataset.val === val);
  });

  // Re-render on content-affecting tweaks
  if (seg === 'distViz' || seg === 'heroMetric') {
    const route = currentRoute();
    const main = document.getElementById('main');
    main.innerHTML = window.__SCREENS[route].render();
    window.__SCREENS[route].mount();
  }
}

// Initial state
applyTweak('theme', TWEAKS.theme);
applyTweak('density', TWEAKS.density);
document.querySelectorAll(`.seg[data-seg="distViz"] button`).forEach(b => b.classList.toggle('active', b.dataset.val === TWEAKS.distViz));
document.querySelectorAll(`.seg[data-seg="heroMetric"] button`).forEach(b => b.classList.toggle('active', b.dataset.val === TWEAKS.heroMetric));

document.querySelectorAll('.seg').forEach(seg => {
  seg.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    applyTweak(seg.dataset.seg, btn.dataset.val);
  });
});

// Tweaks panel toggle
const tweaksBtn = document.getElementById('tweaksBtn');
if (tweaksBtn) {
  tweaksBtn.addEventListener('click', () => {
    document.getElementById('tweaks').classList.toggle('open');
  });
}

// Close tweaks when clicking outside
document.addEventListener('click', (e) => {
  const panel = document.getElementById('tweaks');
  if (!panel || !panel.classList.contains('open')) return;
  if (panel.contains(e.target) || e.target.id === 'tweaksBtn' || e.target.closest('#tweaksBtn')) return;
  panel.classList.remove('open');
});

// Boot
navigate(currentRoute());
