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
  // Axis dims available on the chart. `dim` is the key we pull from each
  // candidate; `label` is the axis title; `tick` is the value formatter; `isBetter`
  // defines "less is better" (cost/latency) vs "more is better" (success). Dot
  // size is always success rate regardless of which two axes are on screen.
  const AXIS_DIMS = {
    cost:            { dim: "cost",            label: "Cost per 1k runs",      shortLabel: "Cost",       tick: "cost",  lessIsBetter: true,  min: 0.01, max: 200 },
    lat50:           { dim: "p50",             label: "p50 latency",           shortLabel: "p50 lat.",   tick: "lat",   lessIsBetter: true,  min: 100,  max: 120000 },
    lat95:           { dim: "p95",             label: "p95 latency",           shortLabel: "p95 lat.",   tick: "lat",   lessIsBetter: true,  min: 100,  max: 120000 },
    success:         { dim: "success",         label: "Run reliability",       shortLabel: "Reliability", tick: "pct",  lessIsBetter: false, min: 0,    max: 1 },
    quality:         { dim: "quality",         label: "Judge quality (1–5)",   shortLabel: "Quality",    tick: "judge", lessIsBetter: false, min: 3.5,  max: 5.0 },
    recovery:        { dim: "recovery",        label: "Recovery rate",         shortLabel: "Recovery",   tick: "pct",   lessIsBetter: false, min: 0,    max: 1 },
    task_completion: { dim: "task_completion", label: "Task completion rate",  shortLabel: "Task ✓",     tick: "pct",   lessIsBetter: false, min: 0,    max: 1 },
  };

  const PERSONAS = [
    {
      id: "premium-agent",
      label: "Premium agent",
      blurb: "High-stakes per task — drives revenue, contracts, compliance. Can't ship a cheap one that fabricates or bails when a tool fails.",
      weights: { lat50: 0.07, lat95: 0.03, cost: 0.10, success: 0.10, quality: 0.30, recovery: 0.25, task_completion: 0.15 },
      axes: { x: "cost", y: "quality" },
      axesTagline: "",
    },
    {
      id: "support-agent",
      label: "Customer support agent",
      blurb: "High volume, user-facing, latency kills UX. Must not hallucinate but doesn't need to be a genius.",
      weights: { lat50: 0.30, lat95: 0.25, cost: 0.25, success: 0.20, quality: 0 },
      // Felt user-latency on y, reliability on x (human-facing: can it keep up AND not lie?)
      axes: { x: "cost", y: "lat50" },
      axesTagline: "",
    },
    {
      id: "research-agent",
      label: "Research / deep-reasoning agent",
      blurb: "Can run for minutes. What matters is whether the final output holds up. Cost per run is secondary.",
      weights: { lat50: 0.05, lat95: 0.05, cost: 0.15, success: 0.75, quality: 0 },
      // Reliability is everything; cost is the only other real knob
      axes: { x: "cost", y: "lat50" },
      axesTagline: "",
    },
    {
      id: "batch-classifier",
      label: "Batch classifier / ETL",
      blurb: "Millions of rows, offline. Cost dominates; p95 matters more than p50 because the slowest row pins the run.",
      weights: { lat50: 0.05, lat95: 0.15, cost: 0.60, success: 0.20, quality: 0 },
      // p95 pins the wall-clock of a batch; cost pins the bill
      axes: { x: "cost", y: "lat50" },
      axesTagline: "",
    },
    {
      id: "interactive-copilot",
      label: "Interactive copilot",
      blurb: "Streaming in an IDE or editor. Latency you feel. Quality matters enough that cheap-and-dumb is a product killer.",
      weights: { lat50: 0.40, lat95: 0.15, cost: 0.10, success: 0.35, quality: 0 },
      axes: { x: "cost", y: "lat50" },
      axesTagline: "",
    },
    {
      id: "tool-using-agent",
      label: "Tool-using agent",
      blurb: "Calls real APIs, multi-turn. Cost explodes with turns; reliability is about the whole loop, not one answer.",
      weights: { lat50: 0.10, lat95: 0.10, cost: 0.30, success: 0.50, quality: 0 },
      // Whole-loop reliability vs $/task; latency is a non-factor at agent scale
      axes: { x: "cost", y: "lat50" },
      axesTagline: "",
    },
  ];

  const SEL = {
    suite:   localStorage.getItem("cmbv3_suite")   || (B.scopes[0] && B.scopes[0].id),
    persona: localStorage.getItem("cmbv3_persona") || "premium-agent",
    runtime: localStorage.getItem("cmbv3_runtime") || "all",
    // Axis overrides — null means "use the persona's default axes".
    axisX:   localStorage.getItem("cmbv3_axis_x") || null,
    axisY:   localStorage.getItem("cmbv3_axis_y") || null,
    hiddenProviders: new Set(JSON.parse(localStorage.getItem("cmbv3_hiddenProv") || "[]")),
  };
  function persist() {
    localStorage.setItem("cmbv3_suite", SEL.suite);
    localStorage.setItem("cmbv3_persona", SEL.persona);
    localStorage.setItem("cmbv3_runtime", SEL.runtime);
    if (SEL.axisX) localStorage.setItem("cmbv3_axis_x", SEL.axisX); else localStorage.removeItem("cmbv3_axis_x");
    if (SEL.axisY) localStorage.setItem("cmbv3_axis_y", SEL.axisY); else localStorage.removeItem("cmbv3_axis_y");
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
      // Agentic-scope dims. Null when the scope doesn't emit them — the axis
      // filter below drops candidates missing the active axis value.
      const quality = a.stage2?.judge?.overall_mean ?? null;
      const recovery = a.recovery_rate?.rate ?? null;
      const tc = a.task_completion;
      const task_completion = typeof tc === "number" ? tc : (tc?.rate ?? null);
      const { fit, sub } = Fit.compute(a, /* we'll redo with persona weights */ "balanced");
      return {
        idx: i,
        provider: r.provider,
        model: r.model,
        runtime: r.runtime || "",
        success, p50, p95, cost,
        quality, recovery, task_completion,
        a, fit, sub,
      };
    }).filter(c => c.cost != null && c.p50 != null);
  }

  // Recompute fit against persona weights (client-side).
  function fitWith(candidate, weights) {
    const a = candidate.a || {};
    const sub = {
      lat50:            Fit.normLat(candidate.p50),
      lat95:            Fit.normLat(candidate.p95, 300, 5000),
      cost:             Fit.normCost(candidate.cost),
      success:          Fit.normSuccess(candidate.success),
      quality:          Fit.normQuality(a),
      recovery:         Fit.normRecovery(a),
      task_completion:  Fit.normTaskCompletion(a),
    };
    let total = 0, wsum = 0;
    for (const k of Object.keys(weights)) {
      total += (sub[k] || 0) * weights[k];
      wsum  += weights[k];
    }
    return { fit: wsum ? total / wsum : 0, sub };
  }

  // Pareto frontier on the two active axes (persona-driven).
  // A candidate C is dominated by D iff D is ≥ as good on BOTH axes and strictly
  // better on at least one. "Better" means smaller for cost/latency, larger for success.
  function computeDominance(cands, xAxis, yAxis) {
    function better(d, c, ax) {
      const vD = d[ax.dim], vC = c[ax.dim];
      if (vD == null || vC == null) return { eq: false, strict: false };
      if (ax.lessIsBetter) return { eq: vD <= vC, strict: vD < vC };
      return { eq: vD >= vC, strict: vD > vC };
    }
    const out = new Set();
    for (const c of cands) {
      for (const d of cands) {
        if (c === d) continue;
        const bx = better(d, c, xAxis);
        const by = better(d, c, yAxis);
        if (bx.eq && by.eq && (bx.strict || by.strict)) {
          out.add(c);
          break;
        }
      }
    }
    return out;
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
  function tickLabelPct(v) {
    return `${Math.round(v * 100)}%`;
  }
  function tickLabelJudge(v) {
    return v.toFixed(2);
  }
  function formatTick(kind, v) {
    if (kind === "cost")  return tickLabelCost(v);
    if (kind === "lat")   return tickLabelLat(v);
    if (kind === "pct")   return tickLabelPct(v);
    if (kind === "judge") return tickLabelJudge(v);
    return String(v);
  }
  // Linear nice-ticks for the success/reliability axis (0–1 range)
  function linearTicks(lo, hi, n = 5) {
    const out = [];
    const step = (hi - lo) / (n - 1);
    for (let i = 0; i < n; i++) out.push(lo + step * i);
    return out;
  }
  function linearExtent(vals, pad = 0.08) {
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const span = Math.max(0.05, hi - lo);
    return [Math.max(0, lo - span * pad), Math.min(1, hi + span * pad)];
  }

  function render() {
    const scope = currentScope();
    const persona = currentPersona();
    // Axis overrides live in SEL; if the user hasn't picked, fall back to the
    // persona's defaults. This lets the chart react to persona changes while
    // still honoring an explicit user pick for this scope.
    const xKey = (SEL.axisX && AXIS_DIMS[SEL.axisX]) ? SEL.axisX : persona.axes.x;
    const yKey = (SEL.axisY && AXIS_DIMS[SEL.axisY]) ? SEL.axisY : persona.axes.y;
    const xAxis = AXIS_DIMS[xKey];
    const yAxis = AXIS_DIMS[yKey];
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

    const dominated = computeDominance(shown, xAxis, yAxis);
    // Sort by fit desc for the right-rail ranked list
    const ranked = [...shown].sort((a, b) => b.fit - a.fit);

    // Axis scales — log for cost/latency (span orders of magnitude),
    // linear for the 0–1 reliability axis.
    function buildScale(axis, range) {
      const vals = shown.map(c => c[axis.dim]).filter(v => v != null);
      // Linear scale for pct (0–1) and judge (1–5) dims.
      if (axis.tick === "pct" || axis.tick === "judge") {
        // Pct uses data-derived extent; judge uses axis config min/max so the
        // 1–5 scale stays comparable across comparisons.
        let lo, hi, ticks;
        if (axis.tick === "pct") {
          [lo, hi] = vals.length ? linearExtent(vals) : [0, 1];
          ticks = linearTicks(lo, hi, 5);
        } else {
          lo = axis.min; hi = axis.max;
          ticks = linearTicks(lo, hi, 4); // 3.5 / 4.0 / 4.5 / 5.0
        }
        const scale = v => range[0] + (v - lo) / (hi - lo || 1) * (range[1] - range[0]);
        return { lo, hi, ticks, scale };
      }
      // Log scale for cost / latency (span orders of magnitude).
      const [lo, hi] = vals.length ? axisExtent(vals) : [axis.min, axis.max];
      const ticks = niceTicks(lo, hi);
      const scale = v => range[0] + (log10(v) - log10(lo)) / (log10(hi) - log10(lo)) * (range[1] - range[0]);
      return { lo, hi, ticks, scale };
    }

    const x0 = CHART.m.l;
    const x1 = CHART.w - CHART.m.r;
    const y0 = CHART.m.t;
    const y1 = CHART.h - CHART.m.b;

    // X scale: left → right as native value. We want "better" to be at the top-left corner
    // for less-is-better x, but at top-right for more-is-better x. So we just put native low
    // at left; the user reads the "frontier corner" label to know the direction.
    const xS = buildScale(xAxis, [x0, x1]);
    // Y scale: we ALWAYS want "better" visually at the top.
    //   less-is-better (cost/latency): lo at top, hi at bottom → range [y0, y1]
    //   more-is-better (success):      hi at top, lo at bottom → range [y1, y0]
    const yRange = yAxis.lessIsBetter ? [y0, y1] : [y1, y0];
    const yS = buildScale(yAxis, yRange);
    const xScale = xS.scale;
    const yScale = yS.scale;

    // Dot size by success rate
    const rDot = (s) => {
      if (s == null) return 8;
      return 6 + Math.round(s * 14); // 6..20
    };

    const xTicks = xS.ticks;
    const yTicks = yS.ticks;

    // Personas list
    const personaHtml = PERSONAS.map(p => `
      <button class="v3-persona ${p.id === persona.id ? "active" : ""}" data-persona="${p.id}">
        <div class="pp-head">
          <span class="pp-dot"></span>
          <span class="pp-label">${UI.esc(p.label)}</span>
        </div>
        <div class="pp-blurb">${UI.esc(p.blurb)}</div>
        <div class="pp-axes">
          <span class="pp-axis">${UI.esc(AXIS_DIMS[p.axes.x].shortLabel)}</span>
          <span class="pp-axis-sep">\u00d7</span>
          <span class="pp-axis">${UI.esc(AXIS_DIMS[p.axes.y].shortLabel)}</span>
        </div>
      </button>
    `).join("");

    // Weight bars (shows what the persona actually does)
    const wKeys = [
      { k: "lat50",           l: "latency (p50)" },
      { k: "lat95",           l: "latency (p95)" },
      { k: "cost",            l: "cost / 1k runs" },
      { k: "success",         l: "run reliability" },
      { k: "quality",         l: "judge quality (1–5)" },
      { k: "recovery",        l: "recovery rate" },
      { k: "task_completion", l: "task completion" },
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
      <text x="${xScale(t)}" y="${y1 + 20}" class="v3-tick" text-anchor="middle">${formatTick(xAxis.tick, t)}</text>
    `).join("");
    const gridY = yTicks.map(t => `
      <line x1="${x0}" y1="${yScale(t)}" x2="${x1}" y2="${yScale(t)}" class="v3-grid"/>
      <text x="${x0 - 10}" y="${yScale(t) + 4}" class="v3-tick" text-anchor="end">${formatTick(yAxis.tick, t)}</text>
    `).join("");

    // Frontier curve — connect non-dominated models in increasing X order
    const frontier = shown
      .filter(c => !dominated.has(c))
      .filter(c => c[xAxis.dim] != null && c[yAxis.dim] != null)
      .sort((a, b) => a[xAxis.dim] - b[xAxis.dim]);
    const frontierPath = frontier.length >= 2
      ? `M ${frontier.map(c => `${xScale(c[xAxis.dim]).toFixed(1)} ${yScale(c[yAxis.dim]).toFixed(1)}`).join(" L ")}`
      : "";

    // Dots
    const dots = shown.filter(c => c[xAxis.dim] != null && c[yAxis.dim] != null).map(c => {
      const color = UI.PROVIDER_COLORS[c.provider] || "#888";
      const dom = dominated.has(c);
      const x = xScale(c[xAxis.dim]), y = yScale(c[yAxis.dim]), r = rDot(c.success);
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

    // Suite switcher (grouped)
    const suitesHtml = UI.suiteSwitcher(B.scopes, scope.id);

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
        ${suitesHtml}

        <!-- Main two-col layout -->
        <section class="v3-frontier-wrap">
          <!-- Left: personas + weights -->
          <aside class="v3-col-left">
            <h3 class="v3-colh">I'm building a…</h3>
            <div class="v3-personas">${personaHtml}</div>

            <h3 class="v3-colh">How that weights the score</h3>
            <div class="v3-weights">${weightsHtml}</div>

            <div class="v3-honesty">
              <strong>On "quality":</strong> the 1–5 score is the mean of a 3-run Opus 4.7 rubric judge across four dimensions (grounding / specificity / relevance / CTA). Recovery and task-completion come from the same real runs. Agentic-only — simple scopes score 0 on those dims.
            </div>
          </aside>

          <!-- Middle: chart -->
          <div class="v3-col-chart">
            <div class="v3-chart-head">
              <div class="v3-chart-title">${UI.esc(xAxis.shortLabel)} × ${UI.esc(yAxis.shortLabel)}</div>
              <div class="v3-chart-sub">
                <span>x: ${UI.esc(xAxis.label)} (${xAxis.tick === "cost" || xAxis.tick === "lat" ? "log" : "linear"}) · y: ${UI.esc(yAxis.label)} (${yAxis.tick === "cost" || yAxis.tick === "lat" ? "log" : "linear"}) · dot size: success rate</span>
              </div>
            </div>

            <!-- Axis pickers: swap what's on X and Y without switching persona -->
            <div class="v3-axis-pickers">
              <div class="v3-axis-row">
                <span class="v3-axis-lbl">X axis</span>
                ${Object.entries(AXIS_DIMS).map(([k, a]) => `
                  <button class="v3-axis-chip ${k === xKey ? "active" : ""}" data-axis="x" data-key="${k}" title="${UI.esc(a.label)}">${UI.esc(a.shortLabel)}</button>
                `).join("")}
              </div>
              <div class="v3-axis-row">
                <span class="v3-axis-lbl">Y axis</span>
                ${Object.entries(AXIS_DIMS).map(([k, a]) => `
                  <button class="v3-axis-chip ${k === yKey ? "active" : ""}" data-axis="y" data-key="${k}" title="${UI.esc(a.label)}">${UI.esc(a.shortLabel)}</button>
                `).join("")}
              </div>
              ${(SEL.axisX || SEL.axisY) ? `
                <div class="v3-axis-reset-row">
                  <button class="v3-axis-reset" id="v3-axis-reset">reset to persona defaults (${UI.esc(AXIS_DIMS[persona.axes.x].shortLabel)} × ${UI.esc(AXIS_DIMS[persona.axes.y].shortLabel)})</button>
                </div>
              ` : ""}
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
                <text x="${(x0 + x1) / 2}" y="${y1 + 48}" class="v3-axis-title" text-anchor="middle">${UI.esc(xAxis.label)} (${xAxis.lessIsBetter ? "less" : "more"} → better)</text>
                <text x="${x0 - 52}" y="${(y0 + y1) / 2}" class="v3-axis-title" text-anchor="middle" transform="rotate(-90 ${x0 - 52} ${(y0 + y1) / 2})">${UI.esc(yAxis.label)} (${yAxis.lessIsBetter ? "less" : "more"} → better)</text>
                <!-- Frontier-corner label: indicates which corner is the optimal direction -->
                <text x="${xAxis.lessIsBetter ? x0 + 14 : x1 - 14}" y="${y0 + 20}" class="v3-corner" text-anchor="${xAxis.lessIsBetter ? "start" : "end"}">${xAxis.lessIsBetter ? "↖" : "↗"} frontier corner</text>
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
        // Switching personas resets any axis override so the new persona's
        // defaults take effect. The user can re-pick after if they want.
        SEL.axisX = null;
        SEL.axisY = null;
        persist();
        window.__APP.render();
      });
    });
    // Axis pickers: swap x/y dims without changing persona/weights.
    document.querySelectorAll(".v3-axis-chip").forEach(el => {
      el.addEventListener("click", () => {
        const axis = el.dataset.axis;
        const key = el.dataset.key;
        if (axis === "x") SEL.axisX = key;
        else if (axis === "y") SEL.axisY = key;
        persist();
        window.__APP.render();
      });
    });
    const reset = document.getElementById("v3-axis-reset");
    if (reset) reset.addEventListener("click", () => {
      SEL.axisX = null;
      SEL.axisY = null;
      persist();
      window.__APP.render();
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
