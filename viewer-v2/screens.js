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
      };
    });

    const sorted = [...enriched].sort((a, b) => {
      const dir = SEL.sort.asc ? 1 : -1;
      return ((a[SEL.sort.key] ?? 0) - (b[SEL.sort.key] ?? 0)) * dir;
    });

    const extremes = UI.columnExtremes(enriched, {
      p50: r => r.p50, p95: r => r.p95, per1k: r => r.per1k, success: r => r.success,
    });

    const uc = Fit.USECASES[SEL.usecase];

    const topFit    = sorted[0];
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

    const tbody = sorted.length === 0
      ? `<tr><td colspan="8" style="text-align:center; padding:40px; color:var(--ink-3); font-style:italic; font-family:var(--serif);">No candidates match these filters.</td></tr>`
      : sorted.map((r, i) => `
          <tr data-cfg="${UI.esc(r.config_file)}">
            <td class="rank ${i === 0 ? "top" : ""}">${i + 1}</td>
            <td class="model-cell">${UI.modelLabel(r.model, r.provider)}</td>
            <td class="fit-cell">${UI.fitBar(r.fit, r.model)}</td>
            <td class="${UI.cellCls(r.p50, "p50", extremes, true)}">${UI.fmtMs(r.p50)}</td>
            <td class="${UI.cellCls(r.p95, "p95", extremes, true)}">${UI.fmtMs(r.p95)}</td>
            <td class="${UI.cellCls(r.per1k, "per1k", extremes, true)}">${UI.fmtCost1k(r.per1k)}</td>
            <td class="${UI.cellCls(r.success, "success", extremes, false)}">${UI.fmtRate(r.success)}</td>
            <td style="text-align:right; color:var(--ink-4); font-family:var(--mono); font-size:11px;">›</td>
          </tr>
      `).join("");

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
          ${summaryCard(`Best on p95`, bestP95, bestP95 ? `${UI.fmtMs(bestP95.p95)} p95` : null)}
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

    const candidateHtml = candidates.map(({ run, row }) => {
      if (!row) return "";
      const isErr = row.error !== null;
      const bodyClass = isErr ? "candidate-body error" : "candidate-body";
      const bodyText = isErr ? UI.esc(row.error) : UI.esc(row.response);
      return `
        <div class="candidate">
          <div class="candidate-head">
            ${UI.modelLabel(run.model, run.provider)}
            <span class="mono" style="font-size:10px; color:var(--ink-3); text-transform:uppercase; letter-spacing:0.08em;">
              ${isErr ? "error" : "ok"}
            </span>
          </div>
          <div class="${bodyClass}">${bodyText}</div>
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
  // SCREEN — RUNS (history, currently an empty state)
  // ==========================================================================
  function renderRuns() {
    const scope = currentScope();
    const cmp = scope.comparison;

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
      ? "bun bench:compare"
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
