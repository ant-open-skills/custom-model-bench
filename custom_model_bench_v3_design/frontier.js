/**
 * Screen: Frontier
 *
 * The anchor question: "Which model should I ship for my product?"
 *
 * - 2D chart: x=cost/1k, y=p50 latency, dot size = success rate, dot color = provider
 * - Log axes (cost range is 0.03→82; latency is 440→55000)
 * - Pareto-optimal models (non-dominated on user's weighting) stay full color;
 *   dominated models fade to ghost
 * - Personas on the left: "I'm building a customer support agent" etc —
 *   each maps to a weight profile + prose rationale
 * - Runtime filter: if the suite has multiple runtimes (yc-qualifier), we surface
 *   it as a pill group
 * - Hover a dot → full details pop
 * - Click a dot → drill to trace-diff for that candidate
 */

(() => {
  const B = window.__BENCH;
  const UI = window.BENCH_UI;
  const Fit = window.FitScore;

  // Persona-ized weight profiles. Each persona is a FOUNDER use-case
  // ("I'm building ___"), not a benchmark axis. Weights are on the same
  // five slots as Fit.USECASES for uniformity.
  // quality = success-rate today; rubric slot reserved.
  const PERSONAS = [
    {
      id: "support-agent",
      label: "Customer support agent",
      blurb: "High volume, user-facing, latency kills UX. Must not hallucinate but doesn't need to be a genius.",
      weights: { lat50: 0.30, lat95: 0.25, cost: 0.25, success: 0.20, quality: 0 },
      axes: ["Latency", "Cost", "Reliability"],
    },
    {
      id: "research-agent",
      label: "Research / deep-reasoning agent",
      blurb: "Can run for minutes. What matters is whether the final output holds up. Cost per run is secondary.",
      weights: { lat50: 0.05, lat95: 0.05, cost: 0.15, success: 0.75, quality: 0 },
      axes: ["Reliability"],
    },
    {
      id: "batch-classifier",
      label: "Batch classifier / ETL",
      blurb: "Millions of rows, offline. Cost dominates; p95 matters more than p50 because the slowest row pins the run.",
      weights: { lat50: 0.05, lat95: 0.15, cost: 0.60, success: 0.20, quality: 0 },
      axes: ["Cost", "p95 latency"],
    },
    {
      id: "interactive-copilot",
      label: "Interactive copilot",
      blurb: "Streaming in an IDE or editor. Latency you feel. Quality matters enough that cheap-and-dumb is a product killer.",
      weights: { lat50: 0.40, lat95: 0.15, cost: 0.10, success: 0.35, quality: 0 },
      axes: ["Latency", "Reliability"],
    },
    {
      id: "tool-using-agent",
      label: "Tool-using agent",
      blurb: "Calls real APIs, multi-turn. Cost explodes with turns; reliability is about the whole loop, not one answer.",
      weights: { lat50: 0.10, lat95: 0.10, cost: 0.30, success: 0.50, quality: 0 },
      axes: ["Reliability", "Cost"],
    },
  ];

  const SEL = {
    suite:   localStorage.getItem("cmbv3_suite")   || (B.scopes[0] && B.scopes[0].id),
    persona: localStorage.getItem("cmbv3_persona") || "support-agent",
    runtime: localStorage.getItem("cmbv3_runtime") || "all",
    hiddenProviders: new Set(JSON.parse(localStorage.getItem("cmbv3_hiddenProv") || "[]")),
  };
  function persist() {
    localStorage.setItem("cmbv3_suite", SEL.suite);
    localStorage.setItem("cmbv3_persona", SEL.persona);
    localStorage.setItem("cmbv3_runtime", SEL.runtime);
    localStorage.setItem("cmbv3_hiddenProv", JSON.stringify([...SEL.hiddenProviders]));
  }
  function currentScope() {
    return B.scopes.find(s => s.id === SEL.suite) || B.scopes[0];
  }
  function currentPersona() {
    return PERSONAS.find(p => p.id === SEL.persona) || PERSONAS[0];
  }

  // ----- Build candidate rows from a scope -----
  function buildCandidates(scope) {
    const runs = scope.comparison?.runs || [];
    return runs.map((r, i) => {
      const a = r.aggregate || {};
      const success = (a.n && a.n_success) ? a.n_success / a.n : null;
      const p50 = a.latency_ms?.p50;
      const p95 = a.latency_ms?.p95;
      const cost = a.cost_usd?.per_1k_evals;
      const { fit, sub } = Fit.compute(a, /* we'll redo with persona weights */ "balanced");
      return {
        idx: i,
        provider: r.provider,
        model: r.model,
        runtime: r.runtime || "",
        success, p50, p95, cost, a,
        fit, sub,
      };
    }).filter(c => c.cost != null && c.p50 != null);
  }

  // Recompute fit against persona weights (client-side).
  function fitWith(candidate, weights) {
    const sub = {
      lat50:   Fit.normLat(candidate.p50),
      lat95:   Fit.normLat(candidate.p95, 300, 5000),
      cost:    Fit.normCost(candidate.cost),
      success: Fit.normSuccess(candidate.success),
      quality: 0,
    };
    let total = 0, wsum = 0;
    for (const k of Object.keys(weights)) {
      total += (sub[k] || 0) * weights[k];
      wsum  += weights[k];
    }
    return { fit: wsum ? total / wsum : 0, sub };
  }

  // Pareto frontier: a candidate C dominates D iff C ≤ D on all (cost, p50)
  // AND success(C) ≥ success(D), and at least one strict. We hide dominated
  // candidates (ghost them, not remove).
  function computeDominance(cands) {
    const out = new Set();
    for (const c of cands) {
      for (const d of cands) {
        if (c === d) continue;
        const cheaperOrSame = d.cost <= c.cost;
        const fasterOrSame  = d.p50 <= c.p50;
        const moreReliable  = (d.success ?? 0) >= (c.success ?? 0);
        const strict = (d.cost < c.cost) || (d.p50 < c.p50) || ((d.success ?? 0) > (c.success ?? 0));
        if (cheaperOrSame && fasterOrSame && moreReliable && strict) {
          out.add(c);
          break;
        }
      }
    }
    return out; // set of dominated
  }

  // ----- SVG chart -----
  // We lay out in log-space for both axes, since cost and latency span
  // orders of magnitude. Axis ticks are drawn at nice round decades.
  const CHART = {
    w: 880, h: 560,
    m: { t: 36, r: 28, b: 64, l: 72 },
  };
  function log10(v) { return Math.log10(Math.max(0.0001, v)); }

  function axisExtent(vals, pad = 0.15) {
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const lLo = log10(lo), lHi = log10(hi);
    const range = Math.max(0.3, lHi - lLo);
    return [Math.pow(10, lLo - range * pad), Math.pow(10, lHi + range * pad)];
  }
  function niceTicks(lo, hi) {
    // Return decade + half-decade ticks inside [lo, hi] for log axes.
    const out = [];
    let d = Math.floor(log10(lo));
    while (Math.pow(10, d) <= hi * 1.001) {
      const base = Math.pow(10, d);
      for (const m of [1, 2, 5]) {
        const v = m * base;
        if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v);
      }
      d++;
    }
    return out;
  }
  function tickLabelCost(v) {
    if (v < 0.01) return `$${v.toFixed(3)}`;
    if (v < 1)    return `$${v.toFixed(2)}`;
    if (v < 100)  return `$${v.toFixed(0)}`;
    return `$${v.toFixed(0)}`;
  }
  function tickLabelLat(v) {
    if (v < 1000) return `${Math.round(v)}ms`;
    return `${(v / 1000).toFixed(v < 10000 ? 1 : 0)}s`;
  }

  function render() {
    const scope = currentScope();
    const persona = currentPersona();
    const allCands = buildCandidates(scope);
    // Runtime filter
    const runtimes = [...new Set(allCands.map(c => c.runtime || ""))].sort();
    const cands = SEL.runtime === "all"
      ? allCands
      : allCands.filter(c => (c.runtime || "") === SEL.runtime);
    // Provider filter via legend
    const shown = cands.filter(c => !SEL.hiddenProviders.has(c.provider));

    // Compute fit per candidate under this persona
    for (const c of shown) {
      const r = fitWith(c, persona.weights);
      c.fit = r.fit;
      c.sub = r.sub;
    }

    const dominated = computeDominance(shown);
    // Sort by fit desc for the right-rail ranked list
    const ranked = [...shown].sort((a, b) => b.fit - a.fit);

    // Axis extents from SHOWN candidates (so filtering zooms)
    const costs = shown.map(c => c.cost);
    const lats  = shown.map(c => c.p50);
    const [xLo, xHi] = shown.length ? axisExtent(costs) : [0.01, 100];
    const [yLo, yHi] = shown.length ? axisExtent(lats)  : [100, 60000];

    const x0 = CHART.m.l;
    const x1 = CHART.w - CHART.m.r;
    const y0 = CHART.m.t;
    const y1 = CHART.h - CHART.m.b;
    const xScale = v => x0 + (log10(v) - log10(xLo)) / (log10(xHi) - log10(xLo)) * (x1 - x0);
    // Y axis inverted so low latency sits at top
    const yScale = v => y0 + (log10(v) - log10(yLo)) / (log10(yHi) - log10(yLo)) * (y1 - y0);

    // Dot size by success rate
    const rDot = (s) => {
      if (s == null) return 8;
      return 6 + Math.round(s * 14); // 6..20
    };

    const xTicks = niceTicks(xLo, xHi);
    const yTicks = niceTicks(yLo, yHi);

    // Personas list
    const personaHtml = PERSONAS.map(p => `
      <button class="v3-persona ${p.id === persona.id ? "active" : ""}" data-persona="${p.id}">
        <div class="pp-head">
          <span class="pp-dot"></span>
          <span class="pp-label">${UI.esc(p.label)}</span>
        </div>
        <div class="pp-blurb">${UI.esc(p.blurb)}</div>
        <div class="pp-axes">
          ${p.axes.map(a => `<span class="pp-axis">${UI.esc(a)}</span>`).join("")}
        </div>
      </button>
    `).join("");

    // Weight bars (shows what the persona actually does)
    const wKeys = [
      { k: "lat50",   l: "latency (p50)" },
      { k: "lat95",   l: "latency (p95)" },
      { k: "cost",    l: "cost / 1k runs" },
      { k: "success", l: "reliability · validity" },
      { k: "quality", l: "quality (rubric)", reserved: true },
    ];
    const weightsHtml = wKeys.map(({ k, l, reserved }) => {
      const w = persona.weights[k] || 0;
      const pct = Math.round(w * 100);
      return `
        <div class="v3-wrow ${reserved ? "reserved" : ""}">
          <div class="wr-l">${UI.esc(l)}${reserved ? ' <span class="wr-res">reserved</span>' : ""}</div>
          <div class="wr-bar"><div class="wr-fill" style="width:${pct}%;"></div></div>
          <div class="wr-v">${pct}%</div>
        </div>
      `;
    }).join("");

    // Axis grid + ticks (SVG)
    const gridX = xTicks.map(t => `
      <line x1="${xScale(t)}" y1="${y0}" x2="${xScale(t)}" y2="${y1}" class="v3-grid"/>
      <text x="${xScale(t)}" y="${y1 + 20}" class="v3-tick" text-anchor="middle">${tickLabelCost(t)}</text>
    `).join("");
    const gridY = yTicks.map(t => `
      <line x1="${x0}" y1="${yScale(t)}" x2="${x1}" y2="${yScale(t)}" class="v3-grid"/>
      <text x="${x0 - 10}" y="${yScale(t) + 4}" class="v3-tick" text-anchor="end">${tickLabelLat(t)}</text>
    `).join("");

    // Frontier curve — connect non-dominated models in increasing cost order
    const frontier = shown
      .filter(c => !dominated.has(c))
      .sort((a, b) => a.cost - b.cost);
    const frontierPath = frontier.length >= 2
      ? `M ${frontier.map(c => `${xScale(c.cost).toFixed(1)} ${yScale(c.p50).toFixed(1)}`).join(" L ")}`
      : "";

    // Dots
    const dots = shown.map(c => {
      const color = UI.PROVIDER_COLORS[c.provider] || "#888";
      const dom = dominated.has(c);
      const x = xScale(c.cost), y = yScale(c.p50), r = rDot(c.success);
      const display = UI.modelDisplay(c.model) + (c.runtime && c.runtime !== "vercel" ? ` · ${c.runtime}` : "");
      return `
        <g class="v3-dot ${dom ? "dominated" : "frontier"}"
           data-idx="${c.idx}"
           data-model="${UI.esc(c.model)}"
           data-prov="${UI.esc(c.provider)}"
           data-runtime="${UI.esc(c.runtime || "")}"
           data-tooltip='${UI.esc(JSON.stringify({
             title: display,
             rows: [
               ["provider", c.provider],
               ["cost / 1k", tickLabelCost(c.cost)],
               ["latency p50", tickLabelLat(c.p50)],
               ["latency p95", c.p95 != null ? tickLabelLat(c.p95) : "—"],
               ["success", c.success != null ? `${(c.success * 100).toFixed(0)}%` : "—"],
               ["fit (persona)", `${Math.round(c.fit)}`],
             ],
           }))}'>
          <circle cx="${x}" cy="${y}" r="${r + 4}" fill="${color}" opacity="0.12" class="halo"/>
          <circle cx="${x}" cy="${y}" r="${r}" fill="${color}" class="core"/>
          ${!dom ? `<text x="${x + r + 6}" y="${y + 4}" class="v3-dot-label">${UI.esc(UI.modelDisplay(c.model))}</text>` : ""}
        </g>
      `;
    }).join("");

    // Provider legend (toggleable)
    const providersInView = [...new Set(cands.map(c => c.provider))];
    const legendHtml = providersInView.map(p => {
      const hidden = SEL.hiddenProviders.has(p);
      return `
        <button class="v3-legend ${hidden ? "off" : ""}" data-prov="${p}">
          <span class="lg-dot" style="background:${UI.PROVIDER_COLORS[p] || "#888"};"></span>
          <span>${UI.esc(UI.PROVIDER_LABEL[p] || p)}</span>
        </button>
      `;
    }).join("");

    // Runtime filter (only if there are multiple runtimes in this suite)
    const runtimeFilter = runtimes.length > 1 ? `
      <div class="v3-runtime-filter">
        <span class="rf-k">Runtime</span>
        <button class="rf-btn ${SEL.runtime === "all" ? "active" : ""}" data-rt="all">all</button>
        ${runtimes.map(rt => `
          <button class="rf-btn ${SEL.runtime === rt ? "active" : ""}" data-rt="${UI.esc(rt)}">
            ${UI.esc(rt || "(default)")}
          </button>
        `).join("")}
      </div>
    ` : "";

    // Right-rail ranked list
    const rail = ranked.slice(0, 12).map((c, i) => {
      const dom = dominated.has(c);
      return `
        <div class="v3-rail-row ${dom ? "ghost" : ""}" data-idx="${c.idx}">
          <div class="rr-rank">${i + 1}</div>
          <div class="rr-model">
            ${UI.providerDot(c.provider)}
            <div class="rr-name">${UI.esc(UI.modelDisplay(c.model))}</div>
            ${c.runtime && c.runtime !== "vercel" ? `<div class="rr-rt">· ${UI.esc(c.runtime)}</div>` : ""}
          </div>
          <div class="rr-stats">
            <span>${tickLabelCost(c.cost)}</span>
            <span>·</span>
            <span>${tickLabelLat(c.p50)}</span>
            <span>·</span>
            <span>${c.success != null ? `${Math.round(c.success * 100)}%` : "—"}</span>
          </div>
          <div class="rr-fit" title="Fit for ${UI.esc(persona.label)}">
            <div class="rr-fit-bar"><div class="rr-fit-fill" style="width:${Math.round(c.fit)}%;"></div></div>
            <div class="rr-fit-n">${Math.round(c.fit)}</div>
          </div>
        </div>
      `;
    }).join("");

    // Build the recommendation paragraph
    const top = ranked[0];
    let recommendation = "";
    if (top) {
      const second = ranked[1];
      const diff = second ? (top.fit - second.fit) : 0;
      const strong = diff > 8;
      recommendation = `
        <div class="v3-rec">
          <div class="v3-rec-k">For ${UI.esc(persona.label.toLowerCase())}, ship</div>
          <div class="v3-rec-v">
            ${UI.providerDot(top.provider)}
            <span class="rec-name">${UI.esc(UI.modelDisplay(top.model))}</span>
            ${top.runtime && top.runtime !== "vercel" ? `<span class="rec-rt">on ${UI.esc(top.runtime)}</span>` : ""}
          </div>
          <div class="v3-rec-why">
            ${strong
              ? `Clearly ahead of <strong>${UI.esc(UI.modelDisplay(second.model))}</strong> by ${Math.round(diff)} fit points.`
              : `Close race — <strong>${UI.esc(UI.modelDisplay(second?.model || ""))}</strong> is within ${Math.round(diff)} points. Trace-diff them before committing.`}
            ${tickLabelCost(top.cost)} / 1k · ${tickLabelLat(top.p50)} p50 · ${top.success != null ? `${Math.round(top.success * 100)}%` : "—"} valid.
          </div>
          <a class="v3-rec-link" data-route="trace-diff">See how it behaves on real prompts →</a>
        </div>
      `;
    }

    // Suite switcher
    const suites = B.scopes.map(s => `
      <button class="v3-suite ${s.id === scope.id ? "active" : ""}" data-suite="${s.id}">
        <div class="su-label">${UI.esc(s.label)}</div>
        <div class="su-sub">${s.comparison?.n_candidates || 0} candidates · ${s.comparison?.n_rows || 0} rows</div>
      </button>
    `).join("");

    return `
      <main class="main v3-main">
        <!-- Hero -->
        <section class="v3-hero">
          <div class="v3-kicker">Frontier · preview</div>
          <h1 class="v3-title">Which model should I ship for my product?</h1>
          <p class="v3-blurb">
            Not <em>which benchmark winner</em> — <em>which model survives the trade-offs you actually care about.</em>
            Pick a persona below; dominated models fade out, the frontier stays lit.
          </p>
        </section>

        <!-- Suite switcher strip -->
        <section class="v3-suites">
          ${suites}
        </section>

        <!-- Main two-col layout -->
        <section class="v3-frontier-wrap">
          <!-- Left: personas + weights -->
          <aside class="v3-col-left">
            <h3 class="v3-colh">I'm building a…</h3>
            <div class="v3-personas">${personaHtml}</div>

            <h3 class="v3-colh">How that weights the score</h3>
            <div class="v3-weights">${weightsHtml}</div>

            <div class="v3-honesty">
              <strong>On "quality":</strong> today this is JSON-validity / task-success-rate from real runs. A full rubric score is reserved and will drop in without redesign when the backend ships grading.
            </div>
          </aside>

          <!-- Middle: chart -->
          <div class="v3-col-chart">
            <div class="v3-chart-head">
              <div class="v3-chart-title">Cost × Latency × Reliability</div>
              <div class="v3-chart-sub">
                <span>x: cost per 1k runs (log) · y: p50 latency (log) · dot size: success rate</span>
              </div>
            </div>
            <div class="v3-chart-toolbar">
              <div class="v3-legends">${legendHtml}</div>
              ${runtimeFilter}
            </div>
            <div class="v3-chart-frame" id="v3-chart-frame">
              <svg class="v3-chart" viewBox="0 0 ${CHART.w} ${CHART.h}" xmlns="http://www.w3.org/2000/svg">
                <!-- Axes -->
                <line x1="${x0}" y1="${y1}" x2="${x1}" y2="${y1}" class="v3-axis"/>
                <line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y1}" class="v3-axis"/>
                ${gridX}
                ${gridY}
                <!-- Axis titles -->
                <text x="${(x0 + x1) / 2}" y="${y1 + 48}" class="v3-axis-title" text-anchor="middle">Cost per 1k runs (less → better)</text>
                <text x="${x0 - 52}" y="${(y0 + y1) / 2}" class="v3-axis-title" text-anchor="middle" transform="rotate(-90 ${x0 - 52} ${(y0 + y1) / 2})">p50 latency (less → better)</text>
                <!-- Quadrant label in top-left = "frontier corner" -->
                <text x="${x0 + 14}" y="${y0 + 20}" class="v3-corner">↖ frontier corner</text>
                <!-- Frontier polyline -->
                ${frontierPath ? `<path d="${frontierPath}" class="v3-frontier-line"/>` : ""}
                <!-- Dots last so they sit on top -->
                ${dots}
              </svg>
              <div class="v3-tooltip" id="v3-tooltip" hidden></div>
            </div>
            <div class="v3-chart-foot">
              <span class="vf-dom"><span class="vf-swatch ghost"></span>dominated · someone is better on every axis</span>
              <span class="vf-fro"><span class="vf-swatch"></span>on the frontier · a real trade-off choice</span>
            </div>
          </div>

          <!-- Right: ranked rail + recommendation -->
          <aside class="v3-col-right">
            ${recommendation}
            <div class="v3-rail">
              <div class="v3-rail-head">Ranked for ${UI.esc(persona.label)}</div>
              ${rail}
            </div>
          </aside>
        </section>
      </main>
    `;
  }

  function mount() {
    document.querySelectorAll(".v3-persona").forEach(el => {
      el.addEventListener("click", () => {
        SEL.persona = el.dataset.persona;
        persist();
        window.__APP.render();
      });
    });
    document.querySelectorAll(".v3-suite").forEach(el => {
      el.addEventListener("click", () => {
        SEL.suite = el.dataset.suite;
        persist();
        window.__APP.render();
      });
    });
    document.querySelectorAll(".v3-legend").forEach(el => {
      el.addEventListener("click", () => {
        const p = el.dataset.prov;
        if (SEL.hiddenProviders.has(p)) SEL.hiddenProviders.delete(p);
        else SEL.hiddenProviders.add(p);
        persist();
        window.__APP.render();
      });
    });
    document.querySelectorAll(".rf-btn").forEach(el => {
      el.addEventListener("click", () => {
        SEL.runtime = el.dataset.rt;
        persist();
        window.__APP.render();
      });
    });

    // Chart hover tooltip
    const tip = document.getElementById("v3-tooltip");
    const frame = document.getElementById("v3-chart-frame");
    document.querySelectorAll(".v3-dot").forEach(dot => {
      dot.addEventListener("mouseenter", (e) => {
        const data = JSON.parse(dot.getAttribute("data-tooltip"));
        tip.innerHTML = `
          <div class="tt-title">${UI.esc(data.title)}</div>
          ${data.rows.map(([k, v]) => `<div class="tt-row"><span class="tt-k">${UI.esc(k)}</span><span class="tt-v">${UI.esc(String(v))}</span></div>`).join("")}
          <div class="tt-hint">click → trace diff</div>
        `;
        tip.hidden = false;
      });
      dot.addEventListener("mousemove", (e) => {
        const fr = frame.getBoundingClientRect();
        const x = e.clientX - fr.left;
        const y = e.clientY - fr.top;
        tip.style.left = Math.min(fr.width - 220, x + 16) + "px";
        tip.style.top = Math.max(8, y - 80) + "px";
      });
      dot.addEventListener("mouseleave", () => { tip.hidden = true; });
      dot.addEventListener("click", () => {
        const model = dot.dataset.model;
        const runtime = dot.dataset.runtime;
        localStorage.setItem("cmbv3_td_model", model);
        localStorage.setItem("cmbv3_td_runtime", runtime);
        window.__APP.navigate("trace-diff");
      });
    });

    // Rail rows → trace diff
    document.querySelectorAll(".v3-rail-row").forEach(el => {
      el.addEventListener("click", () => {
        const scope = currentScope();
        const cand = (scope.comparison?.runs || [])[Number(el.dataset.idx)];
        if (!cand) return;
        localStorage.setItem("cmbv3_td_model", cand.model);
        localStorage.setItem("cmbv3_td_runtime", cand.runtime || "");
        window.__APP.navigate("trace-diff");
      });
    });
  }

  window.__V3_SCREENS = window.__V3_SCREENS || {};
  window.__V3_SCREENS.frontier = { render, mount };
  window.__V3_SEL = SEL;
  window.__V3_PERSONAS = PERSONAS;
})();
