// =====================================================================
// Diagram / micro-chart primitives — all SVG, editorial aesthetic
// =====================================================================

const INK = '#141413';
const INK3 = '#5A5955';
const INK4 = '#8A8880';
const RULE_SOFT = '#D9D6CC';

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}
function makeSvg(w, h) {
  const s = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, width: '100%', style: `display:block;height:auto;font-family:Inter,system-ui,sans-serif;` });
  return s;
}

// ----- BOX PLOT -----
// Horizontal box plot: min · p25 · p50 · p75 · p95 · p99
function renderBoxPlot(container, samples, opts = {}) {
  const values = [...samples].sort((a,b) => a-b);
  const q = p => values[Math.floor((values.length - 1) * p)];
  const min = values[0], max = values[values.length - 1];
  const p25 = q(0.25), p50 = q(0.5), p75 = q(0.75), p95 = q(0.95);

  const W = 300, H = 58;
  const pad = 6;
  const xmax = opts.xmax || max;
  const xmin = opts.xmin || 0;
  const x = v => pad + (v - xmin) / (xmax - xmin) * (W - pad*2);

  const s = makeSvg(W, H);
  // baseline
  s.appendChild(svgEl('line', { x1: x(min), y1: H/2, x2: x(max), y2: H/2, stroke: INK4, 'stroke-width': 1 }));
  // min/max ticks
  [min, max].forEach(v => {
    s.appendChild(svgEl('line', { x1: x(v), y1: H/2 - 6, x2: x(v), y2: H/2 + 6, stroke: INK4, 'stroke-width': 1 }));
  });
  // box
  s.appendChild(svgEl('rect', {
    x: x(p25), y: H/2 - 11, width: Math.max(2, x(p75) - x(p25)), height: 22,
    fill: opts.fill || '#fff', stroke: INK, 'stroke-width': 1.2, rx: 2,
  }));
  // median
  s.appendChild(svgEl('line', { x1: x(p50), y1: H/2 - 11, x2: x(p50), y2: H/2 + 11, stroke: INK, 'stroke-width': 2 }));
  // p95 marker
  s.appendChild(svgEl('line', { x1: x(p95), y1: H/2 - 9, x2: x(p95), y2: H/2 + 9, stroke: INK, 'stroke-width': 1.2, 'stroke-dasharray': '2 2' }));

  // labels
  const label = (txt, xpos, align = 'middle', y = H - 2) => {
    const t = svgEl('text', { x: xpos, y, 'font-size': 9, 'text-anchor': align, fill: INK3, 'font-family': 'JetBrains Mono, monospace' });
    t.textContent = txt; s.appendChild(t);
  };
  label(`${min}`, x(min), 'start', 12);
  label(`p50 ${p50}`, x(p50), 'middle');
  label(`p95 ${p95}`, x(p95), 'middle', 12);
  label(`${max}`, x(max), 'end');

  container.innerHTML = '';
  container.appendChild(s);
}

// ----- STRIP PLOT -----
function renderStripPlot(container, samples, opts = {}) {
  const values = [...samples].sort((a,b) => a-b);
  const min = values[0], max = values[values.length - 1];
  const p50 = values[Math.floor((values.length - 1) * 0.5)];
  const p95 = values[Math.floor((values.length - 1) * 0.95)];
  const W = 300, H = 58, pad = 6;
  const xmax = opts.xmax || max, xmin = opts.xmin || 0;
  const x = v => pad + (v - xmin) / (xmax - xmin) * (W - pad*2);
  const s = makeSvg(W, H);
  s.appendChild(svgEl('line', { x1: pad, y1: H/2, x2: W-pad, y2: H/2, stroke: RULE_SOFT, 'stroke-width': 1 }));
  values.forEach(v => {
    s.appendChild(svgEl('circle', {
      cx: x(v), cy: H/2 + (Math.random()-0.5)*14, r: 2.5,
      fill: opts.fill || INK, 'fill-opacity': 0.55, stroke: 'none'
    }));
  });
  s.appendChild(svgEl('line', { x1: x(p50), y1: H/2 - 14, x2: x(p50), y2: H/2 + 14, stroke: INK, 'stroke-width': 1.5 }));
  const tP50 = svgEl('text', { x: x(p50), y: H - 2, 'font-size': 9, 'text-anchor': 'middle', fill: INK3, 'font-family': 'JetBrains Mono, monospace' });
  tP50.textContent = `p50 ${p50}`; s.appendChild(tP50);
  const tP95 = svgEl('text', { x: x(p95), y: 10, 'font-size': 9, 'text-anchor': 'middle', fill: INK3, 'font-family': 'JetBrains Mono, monospace' });
  tP95.textContent = `p95 ${p95}`; s.appendChild(tP95);
  container.innerHTML = '';
  container.appendChild(s);
}

// ----- HISTOGRAM -----
function renderHistogram(container, samples, opts = {}) {
  const values = [...samples];
  const min = Math.min(...values), max = Math.max(...values);
  const xmax = opts.xmax || max, xmin = opts.xmin || 0;
  const bins = 14;
  const binW = (xmax - xmin) / bins;
  const counts = new Array(bins).fill(0);
  values.forEach(v => {
    const i = Math.min(bins - 1, Math.floor((v - xmin) / binW));
    counts[i]++;
  });
  const maxC = Math.max(...counts);
  const W = 300, H = 58, pad = 6;
  const bw = (W - pad*2) / bins;
  const s = makeSvg(W, H);
  counts.forEach((c, i) => {
    const hb = (c / maxC) * (H - 18);
    s.appendChild(svgEl('rect', {
      x: pad + i * bw + 0.5, y: H - 12 - hb, width: bw - 1, height: hb,
      fill: opts.fill || INK, 'fill-opacity': 0.8
    }));
  });
  const p50 = [...values].sort((a,b)=>a-b)[Math.floor(values.length*0.5)];
  const xp50 = pad + (p50 - xmin) / (xmax - xmin) * (W - pad*2);
  s.appendChild(svgEl('line', { x1: xp50, y1: 6, x2: xp50, y2: H - 12, stroke: INK, 'stroke-width': 1.2, 'stroke-dasharray': '3 2' }));

  const tMin = svgEl('text', { x: pad, y: H - 2, 'font-size': 9, fill: INK3, 'font-family': 'JetBrains Mono, monospace' });
  tMin.textContent = `${xmin}ms`; s.appendChild(tMin);
  const tMax = svgEl('text', { x: W - pad, y: H - 2, 'font-size': 9, fill: INK3, 'font-family': 'JetBrains Mono, monospace', 'text-anchor': 'end' });
  tMax.textContent = `${xmax}ms`; s.appendChild(tMax);
  const tP50 = svgEl('text', { x: xp50, y: 6, 'font-size': 9, fill: INK, 'font-family': 'JetBrains Mono, monospace', 'text-anchor': 'middle' });
  tP50.textContent = `p50 ${p50}`; s.appendChild(tP50);

  container.innerHTML = '';
  container.appendChild(s);
}

// Dispatch based on viz type
function renderDistribution(container, samples, opts = {}) {
  const viz = (window.TWEAKS || {}).distViz || 'box';
  if (viz === 'strip') return renderStripPlot(container, samples, opts);
  if (viz === 'hist')  return renderHistogram(container, samples, opts);
  return renderBoxPlot(container, samples, opts);
}

// ----- LINE CHART (trend) -----
function renderLineChart(container, series, opts = {}) {
  // series: [{ label, values: [{x: dateStr, y: number}], color }]
  const W = opts.width || 600, H = opts.height || 220;
  const pad = { t: 20, r: 20, b: 28, l: 44 };
  const allY = series.flatMap(s => s.values.map(v => v.y));
  const ymin = opts.ymin !== undefined ? opts.ymin : Math.min(...allY) * 0.92;
  const ymax = opts.ymax !== undefined ? opts.ymax : Math.max(...allY) * 1.04;
  const xs = series[0].values.map((_, i) => i);
  const x = i => pad.l + i / (xs.length - 1) * (W - pad.l - pad.r);
  const y = v => pad.t + (1 - (v - ymin) / (ymax - ymin)) * (H - pad.t - pad.b);

  const s = makeSvg(W, H);

  // grid
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const gy = pad.t + i / gridLines * (H - pad.t - pad.b);
    s.appendChild(svgEl('line', { x1: pad.l, y1: gy, x2: W - pad.r, y2: gy, stroke: RULE_SOFT, 'stroke-width': 0.8 }));
    const val = ymax - i / gridLines * (ymax - ymin);
    const t = svgEl('text', { x: pad.l - 8, y: gy + 3, 'font-size': 10, fill: INK4, 'text-anchor': 'end', 'font-family': 'JetBrains Mono, monospace' });
    t.textContent = opts.yFormat ? opts.yFormat(val) : Math.round(val);
    s.appendChild(t);
  }

  // x axis labels (first, middle, last)
  const xTicks = series[0].values;
  const tickIdx = [0, Math.floor(xTicks.length/2), xTicks.length - 1];
  tickIdx.forEach(i => {
    const t = svgEl('text', { x: x(i), y: H - 8, 'font-size': 10, fill: INK4, 'text-anchor': 'middle', 'font-family': 'JetBrains Mono, monospace' });
    t.textContent = xTicks[i].x;
    s.appendChild(t);
  });

  // model-version shift marker (if present in opts.shifts)
  (opts.shifts || []).forEach(shift => {
    const sx = x(shift.index);
    s.appendChild(svgEl('line', { x1: sx, y1: pad.t, x2: sx, y2: H - pad.b, stroke: INK, 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
    const t = svgEl('text', { x: sx + 6, y: pad.t + 12, 'font-size': 10, fill: INK, 'font-style': 'italic' });
    t.textContent = shift.label;
    s.appendChild(t);
  });

  // lines
  series.forEach(ser => {
    const d = ser.values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v.y)}`).join(' ');
    s.appendChild(svgEl('path', { d, fill: 'none', stroke: ser.color || INK, 'stroke-width': 1.8, 'stroke-linejoin': 'round' }));
    ser.values.forEach((v, i) => {
      s.appendChild(svgEl('circle', { cx: x(i), cy: y(v.y), r: 2.8, fill: '#fff', stroke: ser.color || INK, 'stroke-width': 1.4 }));
    });
  });

  container.innerHTML = '';
  container.appendChild(s);
}

// ----- SPARKLINE (tiny) -----
function renderSparkline(container, values, opts = {}) {
  const W = 120, H = 28, pad = 2;
  const ymin = Math.min(...values), ymax = Math.max(...values);
  const x = i => pad + i / (values.length - 1) * (W - pad*2);
  const y = v => pad + (1 - (v - ymin) / (ymax - ymin || 1)) * (H - pad*2);
  const s = makeSvg(W, H);
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ');
  s.appendChild(svgEl('path', { d, fill: 'none', stroke: opts.color || INK, 'stroke-width': 1.5 }));
  const last = values.length - 1;
  s.appendChild(svgEl('circle', { cx: x(last), cy: y(values[last]), r: 2.5, fill: opts.color || INK }));
  container.innerHTML = '';
  container.appendChild(s);
}

window.__CHARTS = { renderDistribution, renderLineChart, renderSparkline, renderBoxPlot, renderStripPlot, renderHistogram };
