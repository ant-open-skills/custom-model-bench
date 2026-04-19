/**
 * Screen renderers — Leaderboard / Evals / Prompts / Runs.
 * Each returns an HTML string for <main>; each has a mount() hook for events.
 */

(() => {
  const B = window.__BENCH;
  const UI = window.BENCH_UI;
  const Fit = window.FitScore;

  // ---------- Selection state ----------
  const SEL = {
    suite: localStorage.getItem("cmbv2_suite") || (B.scopes[0] && B.scopes[0].id),
    usecase: localStorage.getItem("cmbv2_usecase") || "balanced",
    providers: new Set(
      (localStorage.getItem("cmbv2_providers") || "anthropic,openai,google,xai").split(","),
    ),
    tiers: new Set(
      (localStorage.getItem("cmbv2_tiers") || "frontier,balanced,fast").split(","),
    ),
    sort: JSON.parse(localStorage.getItem("cmbv2_sort") || `{"key":"fit","asc":false}`),
    evalIdx: Number(localStorage.getItem("cmbv2_evalIdx") || 0),
  };
  function persist() {
    localStorage.setItem("cmbv2_suite", SEL.suite);
    localStorage.setItem("cmbv2_usecase", SEL.usecase);
    localStorage.setItem("cmbv2_providers", [...SEL.providers].join(","));
    localStorage.setItem("cmbv2_tiers", [...SEL.tiers].join(","));
    localStorage.setItem("cmbv2_sort", JSON.stringify(SEL.sort));
    localStorage.setItem("cmbv2_evalIdx", String(SEL.evalIdx));
  }
  function currentScope() {
    return B.scopes.find(s => s.id === SEL.suite) || B.scopes[0];
  }

  // ---------- Trace visualizer (Phase A.4b) ----------
  // Renders a row's tool-use sequence as an indented, color-coded list.
  // Called only when row.trace is present; no-op otherwise.
  function jsonish(v, max = 120) {
    try {
      const s = JSON.stringify(v);
      return s.length > max ? s.slice(0, max - 1) + "…" : s;
    } catch {
      return String(v);
    }
  }
  function renderTrace(trace) {
    if (!trace || trace.length === 0) return "";
    const rowStyle = "padding:5px 0; display:flex; gap:10px; align-items:flex-start; font-family:var(--mono); font-size:12px; line-height:1.5;";
    const stepBadge = (n) => `<span style="color:var(--ink-4); width:14px; flex-shrink:0; text-align:right;">${n}</span>`;

    const entries = trace.map((e) => {
      if (e.type === "assistant_text") {
        const t = e.text || "";
        const preview = t.length > 240 ? t.slice(0, 240) + "…" : t;
        return `<div style="${rowStyle}">
          ${stepBadge(e.step)}
          <span style="color:var(--ink-3); flex-shrink:0;">▸</span>
          <span style="font-family:var(--serif); font-size:13.5px; color:var(--ink-2); line-height:1.5; white-space:pre-wrap;">${UI.esc(preview)}</span>
        </div>`;
      }
      if (e.type === "tool_call") {
        return `<div style="${rowStyle}">
          ${stepBadge(e.step)}
          <span style="color:var(--accent); flex-shrink:0;">→</span>
          <div>
            <span style="color:var(--accent); font-weight:500;">${UI.esc(e.name)}</span>
            <span style="color:var(--ink-3);">(${UI.esc(jsonish(e.input, 100))})</span>
          </div>
        </div>`;
      }
      if (e.type === "tool_result") {
        return `<div style="${rowStyle}">
          ${stepBadge(e.step)}
          <span style="color:var(--good); flex-shrink:0;">←</span>
          <div>
            <span style="color:var(--good); font-weight:500;">${UI.esc(e.name)}</span>
            <span style="color:var(--ink-3);"> → ${UI.esc(jsonish(e.output, 140))}</span>
          </div>
        </div>`;
      }
      return "";
    }).join("");

    return `
      <div style="background:var(--bg-sunk); border-top:1px solid var(--rule-2); padding:10px 14px;">
        <div style="font-family:var(--mono); font-size:9px; text-transform:uppercase; letter-spacing:0.12em; color:var(--ink-3); margin-bottom:6px;">
          trace · ${trace.length} step${trace.length !== 1 ? "s" : ""}
        </div>
        ${entries}
      </div>
    `;
  }

  // ---------- Sidebar (shared across screens) ----------
  function sidebarHtml() {
    const byCat = {};
    for (const s of B.scopes) {
      const cat = s.kind === "flagship" ? "Cross-provider" : "Provider tiers";
      (byCat[cat] ||= []).push(s);
    }
    const groups = Object.entries(byCat).map(([cat, scopes]) => `
      <div class="side-group">
        <h4>${UI.esc(cat)} <span class="count">${scopes.length}</span></h4>
        ${scopes.map(s => `
          <div class="side-item ${s.id === SEL.suite ? "active" : ""}" data-suite="${s.id}">
            <span class="label"><span>${UI.esc(s.label)}</span></span>
            <span class="count">${s.comparison.n_candidates}</span>
          </div>
        `).join("")}
      </div>
    `).join("");

    // Agentic workflows category (reserved for Phase C+)
    const reserved = `
      <div class="side-group">
        <h4>Agentic workflows <span class="count">soon</span></h4>
        <div class="side-item" style="opacity:.5; cursor:default;">
          <span class="label"><span>YC prospect qualifier</span></span>
          <span class="count">v2</span>
        </div>
      </div>
    `;

    // Filter chips
    const providers = ["anthropic", "openai", "google", "xai"];
    const provChips = providers.map(p => `
      <button class="filter-chip ${SEL.providers.has(p) ? "on" : ""}" data-prov="${p}">
        <span class="pd" style="background:${UI.PROVIDER_COLORS[p]};"></span>
        ${UI.PROVIDER_LABEL[p]}
      </button>
    `).join("");
    const tierChips = ["frontier", "balanced", "fast"].map(t => `
      <button class="filter-chip ${SEL.tiers.has(t) ? "on" : ""}" data-tier="${t}">${t}</button>
    `).join("");

    return `
      <aside class="sidebar">
        ${groups}
        ${reserved}
        <div class="side-cat" style="margin-top:26px;">Providers</div>
        <div class="chip-row">${provChips}</div>
        <div class="side-cat">Tier</div>
        <div class="chip-row">${tierChips}</div>
      </aside>
    `;
  }

  function mountSidebar() {
    document.querySelectorAll(".side-item[data-suite]").forEach(el => {
      el.addEventListener("click", () => {
        SEL.suite = el.dataset.suite;
        SEL.evalIdx = 0;
        persist();
        window.__APP.render();
      });
    });
    document.querySelectorAll(".filter-chip[data-prov]").forEach(el => {
      el.addEventListener("click", () => {
        const p = el.dataset.prov;
        SEL.providers.has(p) ? SEL.providers.delete(p) : SEL.providers.add(p);
        if (SEL.providers.size === 0) {
          ["anthropic","openai","google","xai"].forEach(x => SEL.providers.add(x));
        }
        persist();
        window.__APP.render();
      });
    });
    document.querySelectorAll(".filter-chip[data-tier]").forEach(el => {
      el.addEventListener("click", () => {
        const t = el.dataset.tier;
        SEL.tiers.has(t) ? SEL.tiers.delete(t) : SEL.tiers.add(t);
        if (SEL.tiers.size === 0) {
          ["frontier","balanced","fast"].forEach(x => SEL.tiers.add(x));
        }
        persist();
        window.__APP.render();
      });
    });
  }

  // ==========================================================================
  // SCREEN — LEADERBOARD
  // ==========================================================================
  function renderLeaderboard() {
    const scope = currentScope();
    const cmp = scope.comparison;
    const allRuns = cmp.runs;
    const visible = allRuns.filter(r =>
      SEL.providers.has(r.provider) && SEL.tiers.has(UI.modelTier(r.model))
    );

    const enriched = visible.map(r => {
      const { fit, sub } = Fit.compute(r.aggregate, SEL.usecase);
      return {
        ...r, fit, sub,
        p50: r.aggregate.latency_ms.p50,
        p95: r.aggregate.latency_ms.p95,
        per1k: r.aggregate.cost_usd.per_1k_evals,
        success: r.aggregate.n_success / r.aggregate.n,
        accuracy: r.aggregate.answer_accuracy?.rate ?? null,
      };
    });
    const hasAccuracy = enriched.some(r => r.accuracy != null);

    const sorted = [...enriched].sort((a, b) => {
      const dir = SEL.sort.asc ? 1 : -1;
      return ((a[SEL.sort.key] ?? 0) - (b[SEL.sort.key] ?? 0)) * dir;
    });

    const extremes = UI.columnExtremes(enriched, {
      p50: r => r.p50, p95: r => r.p95, per1k: r => r.per1k, success: r => r.success,
      accuracy: r => r.accuracy,
    });

    const uc = Fit.USECASES[SEL.usecase];

    const topFit    = sorted[0];
    const bestAcc   = hasAccuracy ? [...enriched].filter(r => r.accuracy != null).sort((a, b) => b.accuracy - a.accuracy)[0] : null;
    const bestP95   = [...enriched].sort((a, b) => a.p95 - b.p95)[0];
    const cheapest  = [...enriched].filter(r => r.success >= 0.95).sort((a, b) => a.per1k - b.per1k)[0];
    const fastest   = [...enriched].sort((a, b) => a.p50 - b.p50)[0];

    const summaryCard = (k, run, sub) => `
      <div class="summary-card">
        <div class="k">${run ? UI.providerDot(run.provider) : ""}${UI.esc(k)}</div>
        <div class="v">${run ? UI.esc(UI.modelDisplay(run.model)) : "—"}</div>
        <div class="sub">${sub ?? "—"}</div>
      </div>
    `;

    const sortClass = (key, isNum) =>
      (SEL.sort.key === key ? `sort ${SEL.sort.asc ? "asc" : ""}` : "") + (isNum ? " num" : "");

    const colspan = hasAccuracy ? 9 : 8;
    const tbody = sorted.length === 0
      ? `<tr><td colspan="${colspan}" style="text-align:center; padding:40px; color:var(--ink-3); font-style:italic; font-family:var(--serif);">No candidates match these filters.</td></tr>`
      : sorted.map((r, i) => {
          // Top 4 rows render at full opacity; bottom rows fade to a muted
          // variant so the focus is on "which candidate actually wins".
          // Filter state still shows everything — this is visual emphasis,
          // not a hard truncation.
          const muted = i >= 4;
          const rowStyle = muted ? "opacity:0.42; filter:saturate(0.6);" : "";
          return `
          <tr data-cfg="${UI.esc(r.config_file)}" style="${rowStyle}">
            <td class="rank ${i === 0 ? "top" : ""}">${i + 1}</td>
            <td class="model-cell">${UI.modelLabel(r.model, r.provider)}</td>
            <td class="fit-cell">${UI.fitBar(r.fit, r.model)}</td>
            <td class="${UI.cellCls(r.p50, "p50", extremes, true)}">${UI.fmtMs(r.p50)}</td>
            <td class="${UI.cellCls(r.p95, "p95", extremes, true)}">${UI.fmtMs(r.p95)}</td>
            <td class="${UI.cellCls(r.per1k, "per1k", extremes, true)}">${UI.fmtCost1k(r.per1k)}</td>
            <td class="${UI.cellCls(r.success, "success", extremes, false)}">${UI.fmtRate(r.success)}</td>
            ${hasAccuracy
              ? `<td class="${UI.cellCls(r.accuracy, "accuracy", extremes, false)}">${r.accuracy != null ? UI.fmtRate(r.accuracy) : "—"}</td>`
              : ""}
            <td style="text-align:right; color:var(--ink-4); font-family:var(--mono); font-size:11px;">›</td>
          </tr>`;
        }).join("");

    return `
      <div class="main">
        <section class="hero">
          <h1>Pick the model that <em>actually ships.</em></h1>
          <p class="lede">
            Your own benchmarks, scored for the feature you're building. Fit re-weights when you switch use case — raw aggregates stay visible for the engineer reading over your shoulder.
          </p>
        </section>

        <div class="usecase-bar">
          <span class="lbl">Use case</span>
          ${Object.values(Fit.USECASES).map(u => `
            <button class="usecase-pill ${SEL.usecase === u.id ? "active" : ""}" data-uc="${u.id}" title="${UI.esc(u.help)}">
              ${UI.esc(u.label)}
            </button>
          `).join("")}
        </div>

        <section class="summary">
          ${summaryCard(`Top fit · ${uc.label}`, topFit, topFit ? `fit ${Math.round(topFit.fit)}` : null)}
          ${hasAccuracy
            ? summaryCard(`Highest accuracy`, bestAcc, bestAcc ? `${(bestAcc.accuracy * 100).toFixed(0)}% correct` : null)
            : summaryCard(`Best on p95`, bestP95, bestP95 ? `${UI.fmtMs(bestP95.p95)} p95` : null)}
          ${summaryCard(`Cheapest viable`, cheapest, cheapest ? `${UI.fmtCost1k(cheapest.per1k)}/1k evals` : null)}
          ${summaryCard(`Fastest p50`, fastest, fastest ? `${UI.fmtMs(fastest.p50)} p50` : null)}
        </section>

        <div class="board">
          <div class="board-head">
            <div>
              <div class="title">${UI.esc(scope.label)}</div>
              <div class="meta" style="margin-top:3px;">
                ${cmp.n_candidates} candidates · ${cmp.n_rows} rows · suite ${UI.esc(scope.id)}
              </div>
            </div>
            <div class="meta">fit — weighted by ${UI.esc(uc.label.toLowerCase())}</div>
          </div>
          <div style="overflow-x:auto;">
            <table class="board-table">
              <thead>
                <tr>
                  <th style="width:44px;">#</th>
                  <th class="${sortClass("model", false)}" data-sort="model">Model</th>
                  <th class="${sortClass("fit", true)}" data-sort="fit" title="Composite 0-100 for current use case">Fit</th>
                  <th class="${sortClass("p50", true)}" data-sort="p50" title="Median latency">p50 lat.</th>
                  <th class="${sortClass("p95", true)}" data-sort="p95" title="Tail latency">p95 lat.</th>
                  <th class="${sortClass("per1k", true)}" data-sort="per1k" title="Cost per 1000 evals">$/1k</th>
                  <th class="${sortClass("success", true)}" data-sort="success" title="Success rate">Success</th>
                  ${hasAccuracy
                    ? `<th class="${sortClass("accuracy", true)}" data-sort="accuracy" title="Exact-match accuracy against ground-truth answers">Accuracy</th>`
                    : ""}
                  <th style="width:32px;"></th>
                </tr>
              </thead>
              <tbody>${tbody}</tbody>
            </table>
          </div>
          <div class="board-footer">
            <span>
              last run ${UI.fmtTs(cmp.completed_at)} ·
              <span class="link" data-route="runs">runs history</span>
            </span>
            <span>comparison ${UI.esc(cmp.comparison_id.slice(0, 28))}…</span>
          </div>
        </div>
      </div>
    `;
  }

  function mountLeaderboard() {
    document.querySelectorAll(".usecase-pill").forEach(el => {
      el.addEventListener("click", () => {
        SEL.usecase = el.dataset.uc;
        persist();
        window.__APP.render();
      });
    });
    document.querySelectorAll(".board-table th[data-sort]").forEach(el => {
      el.addEventListener("click", () => {
        const key = el.dataset.sort;
        if (SEL.sort.key === key) SEL.sort.asc = !SEL.sort.asc;
        else { SEL.sort = { key, asc: key === "model" }; }
        persist();
        window.__APP.render();
      });
    });
    document.querySelectorAll(".board-table tbody tr[data-cfg]").forEach(el => {
      el.addEventListener("click", () => {
        SEL.evalIdx = 0;
        persist();
        window.__APP.navigate("evals", el.dataset.cfg);
      });
    });
  }

  // ==========================================================================
  // SCREEN — EVALS (prompt drill-down)
  // ==========================================================================
  function renderEvals() {
    const scope = currentScope();
    const cmp = scope.comparison;
    const visible = cmp.runs.filter(r =>
      SEL.providers.has(r.provider) && SEL.tiers.has(UI.modelTier(r.model))
    );
    if (visible.length === 0) {
      return `<div class="main"><div class="drill"><h2>No candidates match these filters.</h2></div></div>`;
    }

    // Rows are identified by id across all candidates; build a unified list
    // using the first candidate's results as the canonical order.
    const canonical = visible[0].results;
    const idx = Math.max(0, Math.min(SEL.evalIdx, canonical.length - 1));
    const currentRow = canonical[idx];

    // Gather each candidate's result for this id
    const candidates = visible.map(run => ({
      run,
      row: run.results.find(r => r.id === currentRow.id) || null,
    }));

    const expected = currentRow.expected_answer;
    const candidateHtml = candidates.map(({ run, row }) => {
      if (!row) return "";
      const isErr = row.error !== null;
      const bodyClass = isErr ? "candidate-body error" : "candidate-body";
      const bodyText = isErr ? UI.esc(row.error) : UI.esc(row.response);

      let verdict = "";
      if (!isErr && expected != null) {
        const correct = row.answer_correct === true;
        const extracted = row.answer_extracted ?? "?";
        const color = correct ? "var(--good)" : "var(--bad)";
        const label = correct ? "✓ correct" : "✗ wrong";
        const hint = correct
          ? `extracted <b>${UI.esc(extracted)}</b>`
          : `extracted <b>${UI.esc(extracted)}</b> · expected <b>${UI.esc(expected)}</b>`;
        verdict = `
          <span class="mono" style="font-size:10px; text-transform:uppercase; letter-spacing:0.08em; color:${color};">${label}</span>
          <span class="mono" style="font-size:10px; color:var(--ink-3); margin-left:8px;">${hint}</span>
        `;
      } else {
        verdict = `<span class="mono" style="font-size:10px; color:var(--ink-3); text-transform:uppercase; letter-spacing:0.08em;">${isErr ? "error" : "ok"}</span>`;
      }

      return `
        <div class="candidate">
          <div class="candidate-head">
            ${UI.modelLabel(run.model, run.provider)}
            <span>${verdict}</span>
          </div>
          <div class="${bodyClass}">${bodyText}</div>
          ${renderTrace(row.trace)}
          <div class="candidate-footer">
            <div class="stat"><div class="k">Latency</div><div class="v">${row.latency_ms}ms</div></div>
            <div class="stat"><div class="k">Turns</div><div class="v">${row.turns}</div></div>
            <div class="stat"><div class="k">In tok</div><div class="v">${row.input_tokens}</div></div>
            <div class="stat"><div class="k">Out tok</div><div class="v">${row.output_tokens}</div></div>
            <div class="stat"><div class="k">Cost</div><div class="v">$${row.cost_usd.toFixed(6)}</div></div>
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="main">
        <div class="drill">
          <div class="breadcrumb">
            <a data-route="leaderboard">${UI.esc(scope.label)}</a><span class="sep">›</span>eval ${UI.esc(currentRow.id)}
          </div>
          <h2>Row ${UI.esc(currentRow.id)}</h2>
          <div class="sub">${candidates.length} candidates · dataset ${UI.esc(UI.datasetBasename(cmp.dataset_path))}</div>

          <div class="prompt-block">${UI.esc(currentRow.prompt)}</div>

          <div class="sort-bar">
            <span>row</span>
            ${canonical.map((r, i) => `
              <button class="${i === idx ? "active" : ""}" data-idx="${i}">${UI.esc(r.id)}</button>
            `).join("")}
          </div>

          ${candidateHtml}
        </div>
      </div>
    `;
  }

  function mountEvals() {
    document.querySelectorAll(".sort-bar button[data-idx]").forEach(el => {
      el.addEventListener("click", () => {
        SEL.evalIdx = Number(el.dataset.idx);
        persist();
        window.__APP.render();
      });
    });
  }

  // ==========================================================================
  // SCREEN — PROMPTS (dataset browser)
  // ==========================================================================
  function renderPrompts() {
    const scope = currentScope();
    const cmp = scope.comparison;
    const canonical = cmp.runs[0]?.results ?? [];

    const rows = canonical.map((r, i) => `
      <tr data-idx="${i}">
        <td class="mono" style="color:var(--ink-3); width:80px;">${UI.esc(r.id)}</td>
        <td style="font-family:var(--serif); font-size:14px; line-height:1.45;">${UI.esc(r.prompt)}</td>
        <td style="width:44px; text-align:right; color:var(--ink-4); font-family:var(--mono);">›</td>
      </tr>
    `).join("");

    return `
      <div class="main">
        <div class="drill">
          <div class="breadcrumb">
            <a data-route="leaderboard">${UI.esc(scope.label)}</a><span class="sep">›</span>prompts
          </div>
          <h2>Dataset · ${UI.esc(UI.datasetBasename(cmp.dataset_path))}</h2>
          <div class="sub">${canonical.length} prompts · shared across ${cmp.n_candidates} candidates</div>

          <table class="runs-table" style="margin-top:16px;">
            <thead>
              <tr>
                <th style="width:80px;">ID</th>
                <th>Prompt</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function mountPrompts() {
    document.querySelectorAll(".runs-table tr[data-idx]").forEach(el => {
      el.addEventListener("click", () => {
        SEL.evalIdx = Number(el.dataset.idx);
        persist();
        window.__APP.navigate("evals");
      });
    });
  }

  // ==========================================================================
  // SCREEN — RUNS (history trend lines; falls back to an empty state when <2)
  // ==========================================================================

  // Small reusable SVG line chart.
  //   series: [{ key, label, color, points: [{ x: Date|number, y: number|null }] }]
  //   fmtY: optional value formatter for axis ticks
  function renderLineChart(opts) {
    const { series, title, fmtY, height = 180, ymaxClamp } = opts;
    const W = 380, H = height;
    // Reserve a dedicated top slot for the title so gridlines/tick labels
    // never cross through it. padT is the top of the plotting area, below
    // the title band.
    const titleH = title ? 18 : 8;
    const padL = 44, padR = 12, padT = titleH, padB = 22;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    // Determine the run-sequence length (N) from the longest series.
    let N = 0;
    for (const s of series) {
      if (s.points.length > N) N = s.points.length;
    }

    // Flatten Y values to compute domain. X is now an ordinal index
    // (1..N) derived from point position within each series, not from
    // the point's .x field.
    const ys = [];
    for (const s of series) {
      for (const p of s.points) {
        if (p.y == null || !Number.isFinite(p.y)) continue;
        ys.push(p.y);
      }
    }
    if (ys.length === 0 || N === 0) {
      return `<svg class="trend-chart" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <text x="${W/2}" y="${H/2}" text-anchor="middle" font-family="var(--serif)" font-size="13" fill="var(--ink-3)">no data</text>
      </svg>`;
    }
    const xMin = 1, xMax = N;
    let yMin = Math.min(...ys), yMax = Math.max(...ys);
    // Pad Y for breathing room
    const ySpan = yMax - yMin || Math.max(1, Math.abs(yMax) * 0.1);
    yMin = yMin - ySpan * 0.12;
    yMax = yMax + ySpan * 0.12;
    if (yMin === yMax) { yMin -= 1; yMax += 1; }
    // Optional ceiling clamp (e.g. rates in [0,1] should never exceed 1.0).
    if (typeof ymaxClamp === "number" && yMax > ymaxClamp) {
      yMax = ymaxClamp;
    }

    const sx = (i) => padL + (xMax === xMin ? innerW / 2 : ((i - xMin) / (xMax - xMin)) * innerW);
    const sy = (v) => padT + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

    // Y ticks (3 ticks)
    const ticks = [];
    for (let i = 0; i <= 2; i++) {
      const t = yMin + (i / 2) * (yMax - yMin);
      ticks.push(t);
    }
    const yTickText = (t) => {
      if (typeof fmtY === "function") return fmtY(t);
      if (Math.abs(t) >= 1000) return (t / 1000).toFixed(1) + "k";
      if (Math.abs(t) >= 10) return Math.round(t).toString();
      if (Math.abs(t) >= 1) return t.toFixed(2);
      return t.toFixed(3);
    };

    // X ticks: first + last, labelled as run-sequence positions.
    const fmtX = (i) => `run ${i}`;

    const gridLines = ticks.map(t => {
      const y = sy(t);
      return `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" stroke="var(--rule-2)" stroke-width="1"/>`;
    }).join("");
    const yLabels = ticks.map(t => {
      const y = sy(t);
      return `<text x="${padL - 6}" y="${y + 3}" text-anchor="end" font-family="var(--mono)" font-size="9" fill="var(--ink-3)">${UI.esc(yTickText(t))}</text>`;
    }).join("");
    const xLabels = `
      <text x="${padL}" y="${H - 6}" font-family="var(--mono)" font-size="9" fill="var(--ink-3)">${UI.esc(fmtX(xMin))}</text>
      <text x="${W - padR}" y="${H - 6}" text-anchor="end" font-family="var(--mono)" font-size="9" fill="var(--ink-3)">${UI.esc(fmtX(xMax))}</text>
    `;

    const seriesSvg = series.map(s => {
      // Use the point's index within its own series as the ordinal X.
      const pts = s.points
        .map((p, i) => ({ xi: i + 1, y: p.y }))
        .filter(p => p.y != null && Number.isFinite(p.y));
      if (pts.length === 0) return "";
      const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.xi).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
      const line = `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`;
      const dots = pts.map(p => `<circle cx="${sx(p.xi).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="2" fill="${s.color}"/>`).join("");
      return line + dots;
    }).join("");

    // Title sits in its own top slot, above the plotting area. padT is
    // the top of the gridline region, so the title at y=10 cannot be
    // crossed by the topmost gridline (which sits at y = padT).
    const titleSvg = title
      ? `<text x="${padL}" y="11" font-family="var(--mono)" font-size="10" fill="var(--ink-3)" text-transform="uppercase" letter-spacing="0.08em">${UI.esc(title)}</text>`
      : "";

    return `<svg class="trend-chart" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
      ${titleSvg}
      ${gridLines}
      ${yLabels}
      ${xLabels}
      ${seriesSvg}
    </svg>`;
  }

  function renderRuns() {
    const scope = currentScope();
    const cmp = scope.comparison;
    const history = Array.isArray(scope.history) ? scope.history : [];

    // Fallback: empty state if < 2 comparisons
    if (history.length < 2) {
      const baselineCards = cmp.runs.map(run => {
        const a = run.aggregate;
        return `
          <div class="summary-card">
            <div class="k">
              ${UI.providerDot(run.provider)}
              ${UI.esc(UI.modelDisplay(run.model))}
            </div>
            <div class="v" style="font-size:15px;">
              <span class="mono" style="font-size:12px;">p50 <b>${a.latency_ms.p50}ms</b></span>
            </div>
            <div class="sub">
              p95 ${a.latency_ms.p95}ms · $/1k ${a.cost_usd.per_1k_evals.toFixed(4)} · ok ${a.n_success}/${a.n}
            </div>
          </div>
        `;
      }).join("");

      const rerunCmd = scope.kind === "flagship"
        ? (scope.id === "reasoning" ? "bun bench:reasoning" : "bun bench:compare")
        : `bun bench:tiers:${scope.id}`;

      return `
        <div class="main">
          <div class="runs-wrap">
            <div class="breadcrumb">
              <a data-route="leaderboard">${UI.esc(scope.label)}</a><span class="sep">›</span>runs history
            </div>
            <h2 style="font-family:var(--serif); font-weight:400; font-size:28px; letter-spacing:-0.01em; margin:8px 0 4px;">
              Trends over time
            </h2>
            <div class="sub" style="font-family:var(--mono); font-size:11px; color:var(--ink-3); text-transform:uppercase; letter-spacing:0.08em; margin-bottom:16px;">
              not enough runs yet
            </div>

            <p style="font-family:var(--serif); font-size:15px; line-height:1.55; color:var(--ink-2); max-width:620px;">
              This scope has a single comparison so far. Re-run it across days or after a model/prompt change and this screen fills in with p50 / p95 / cost / success trend lines, annotated where the candidate config shifted.
            </p>

            <pre style="margin-top:14px;"># from the repo root
${UI.esc(rerunCmd)}
bun viewer-v2:build</pre>

            <div style="margin-top:20px;">
              <div style="font-family:var(--mono); font-size:10px; color:var(--ink-3); text-transform:uppercase; letter-spacing:0.1em; margin-bottom:10px;">
                Current baselines
              </div>
              <div class="summary" style="grid-template-columns:repeat(${Math.max(2, cmp.n_candidates)}, 1fr);">
                ${baselineCards}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // Trend-line mode ------------------------------------------------------
    // Build candidate keys from the most recent run.
    const latestRuns = history[history.length - 1].runs;
    const candidates = latestRuns.map(r => ({
      key: `${r.provider}/${r.model}`,
      provider: r.provider,
      model: r.model,
      color: UI.PROVIDER_COLORS[r.provider] || "#888",
      _aggregate: r.aggregate,
    }));

    // Apply provider + tier filters first. When a filter is active, show
    // every matching candidate (the user asked to narrow down). When no
    // filter is active (all providers + all tiers selected), show only the
    // top 4 by the current use case's fit score — the trend chart is
    // legible for ≤4 lines; 12 lines is unreadable.
    const filtered = candidates.filter(c =>
      SEL.providers.has(c.provider) && SEL.tiers.has(UI.modelTier(c.model))
    );
    const allSelected = SEL.providers.size === 4 && SEL.tiers.size === 3;
    let shown;
    if (allSelected) {
      shown = [...filtered]
        .map(c => ({ ...c, _fit: Fit.compute(c._aggregate, SEL.usecase).fit }))
        .sort((a, b) => b._fit - a._fit)
        .slice(0, 4);
    } else {
      shown = filtered.length > 0 ? filtered : candidates;
    }

    // Check whether any run anywhere has answer_accuracy.
    let hasAccuracy = false;
    for (const h of history) {
      for (const r of h.runs) {
        if (r.aggregate && r.aggregate.answer_accuracy && r.aggregate.answer_accuracy.rate != null) {
          hasAccuracy = true;
        }
      }
    }

    // For each metric, build series across candidates.
    function buildSeries(pick) {
      return shown.map(c => {
        const points = history.map(h => {
          const match = h.runs.find(r => r.provider === c.provider && r.model === c.model);
          const y = match ? pick(match.aggregate) : null;
          return { x: new Date(h.completed_at || h.started_at), y };
        });
        return { key: c.key, label: UI.modelDisplay(c.model), color: c.color, points };
      });
    }

    const p50Series = buildSeries(a => a?.latency_ms?.p50 ?? null);
    const p95Series = buildSeries(a => a?.latency_ms?.p95 ?? null);
    const costSeries = buildSeries(a => {
      const v = a?.cost_usd?.per_1k_evals;
      return v == null ? null : v;
    });
    const successSeries = buildSeries(a => (a && a.n ? a.n_success / a.n : null));
    const accuracySeries = hasAccuracy
      ? buildSeries(a => a?.answer_accuracy?.rate ?? null)
      : null;

    const fmtMs = (t) => {
      if (Math.abs(t) >= 1000) return (t / 1000).toFixed(1) + "s";
      return Math.round(t) + "ms";
    };
    const fmtCost = (t) => {
      if (Math.abs(t) >= 1) return "$" + t.toFixed(2);
      if (Math.abs(t) >= 0.01) return "$" + t.toFixed(3);
      return "$" + t.toFixed(4);
    };
    const fmtPct = (t) => (t * 100).toFixed(0) + "%";

    const charts = [
      { title: "p50 latency",   svg: renderLineChart({ title: "p50 latency",   series: p50Series,  fmtY: fmtMs }) },
      { title: "p95 latency",   svg: renderLineChart({ title: "p95 latency",   series: p95Series,  fmtY: fmtMs }) },
      { title: "$ per 1k evals",svg: renderLineChart({ title: "$ per 1k evals",series: costSeries, fmtY: fmtCost }) },
      accuracySeries
        ? { title: "answer accuracy", svg: renderLineChart({ title: "answer accuracy", series: accuracySeries, fmtY: fmtPct, ymaxClamp: 1 }) }
        : { title: "success rate",    svg: renderLineChart({ title: "success rate",    series: successSeries,  fmtY: fmtPct, ymaxClamp: 1 }) },
    ];

    const legendHtml = shown.map(c => `
      <div class="item" style="color:${c.color};">
        <span class="swatch"></span>
        <span style="color:var(--ink-2);">${UI.esc(UI.modelDisplay(c.model))}</span>
        <span style="color:var(--ink-3); margin-left:4px;">${UI.esc(UI.PROVIDER_LABEL[c.provider] || c.provider)}</span>
      </div>
    `).join("");

    const grid = charts.map(ch => `
      <div class="chart-card" style="background:var(--bg-elev-2, rgba(0,0,0,0.02)); border:1px solid var(--rule-2); border-radius:var(--r-md, 6px); padding:12px;">
        <div style="font-family:var(--mono); font-size:10px; color:var(--ink-3); text-transform:uppercase; letter-spacing:0.1em; margin-bottom:6px;">
          ${UI.esc(ch.title)}
        </div>
        ${ch.svg}
      </div>
    `).join("");

    const rerunCmd = scope.kind === "flagship"
      ? (scope.id === "reasoning" ? "bun bench:reasoning" : "bun bench:compare")
      : `bun bench:tiers:${scope.id}`;

    const firstTs = history[0].completed_at || history[0].started_at;
    const lastTs = history[history.length - 1].completed_at || history[history.length - 1].started_at;

    return `
      <div class="main">
        <div class="runs-wrap">
          <div class="breadcrumb">
            <a data-route="leaderboard">${UI.esc(scope.label)}</a><span class="sep">›</span>runs history
          </div>
          <h2 style="font-family:var(--serif); font-weight:400; font-size:28px; letter-spacing:-0.01em; margin:8px 0 4px;">
            Trends over time
          </h2>
          <div class="sub" style="font-family:var(--mono); font-size:11px; color:var(--ink-3); text-transform:uppercase; letter-spacing:0.08em; margin-bottom:16px;">
            ${history.length} runs · ${UI.fmtTs(firstTs)} → ${UI.fmtTs(lastTs)} · rerun with <span style="color:var(--ink-2);">${UI.esc(rerunCmd)}</span>
          </div>

          <div class="chart-legend">${legendHtml}</div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:6px;">
            ${grid}
          </div>
        </div>
      </div>
    `;
  }

  function mountRuns() { /* no interactive elements beyond breadcrumb */ }

  // ==========================================================================
  // Expose
  // ==========================================================================
  window.__SCREENS = {
    leaderboard: { render: renderLeaderboard, mount: mountLeaderboard },
    evals:       { render: renderEvals,       mount: mountEvals       },
    prompts:     { render: renderPrompts,     mount: mountPrompts     },
    runs:        { render: renderRuns,        mount: mountRuns        },
  };
  window.__SIDEBAR = { render: sidebarHtml, mount: mountSidebar };
  window.__SEL = SEL;
})();
