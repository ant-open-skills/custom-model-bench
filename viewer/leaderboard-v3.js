/**
 * Screen: Leaderboard (v3)
 *
 * Power-user reference table. Ported from v2's leaderboard but:
 *   - No persona dialer (that lives on Frontier)
 *   - Adds a context breadcrumb above the table
 *   - When scope.kind === "agentic", swaps the column set for Phase D metrics
 *     (task completion, recovery, fabrication [inverted], judge mean, $/task)
 *   - Same-model same-suite pairs get a "vs" affordance + delta row
 *
 * Sidebar from v2 (__SIDEBAR) is NOT loaded here — instead we have a compact
 * scope/provider/tier strip above the table.
 */

(() => {
  const B  = window.__BENCH;
  const UI = window.BENCH_UI;
  const Fit = window.FitScore;

  const SEL = {
    suite: localStorage.getItem("cmbv3_lb_suite") || localStorage.getItem("cmbv3_suite") || (B.scopes[0] && B.scopes[0].id),
    providers: new Set((localStorage.getItem("cmbv3_lb_prov")  || "anthropic,openai,google,xai").split(",").filter(Boolean)),
    tiers:     new Set((localStorage.getItem("cmbv3_lb_tier")  || "frontier,balanced,fast").split(",").filter(Boolean)),
    sort: JSON.parse(localStorage.getItem("cmbv3_lb_sort") || `{"key":"fit","asc":false}`),
  };
  function persist() {
    localStorage.setItem("cmbv3_lb_suite", SEL.suite);
    localStorage.setItem("cmbv3_lb_prov",  [...SEL.providers].join(","));
    localStorage.setItem("cmbv3_lb_tier",  [...SEL.tiers].join(","));
    localStorage.setItem("cmbv3_lb_sort",  JSON.stringify(SEL.sort));
  }
  function currentScope() { return B.scopes.find(s => s.id === SEL.suite) || B.scopes[0]; }

  // ----- Build enriched candidate rows from a scope -----
  function buildRows(scope) {
    const cmp = scope.comparison;
    const visible = cmp.runs.filter(r =>
      SEL.providers.has(r.provider) && SEL.tiers.has(UI.modelTier(r.model))
    );
    return visible.map(r => {
      const a = r.aggregate || {};
      // Fit: weighted on "balanced" for the leaderboard. (The persona dialer
      // moved to Frontier; leaderboard uses a neutral baseline.)
      const { fit } = Fit.compute(a, "balanced");
      const out = {
        ...r, fit,
        p50: a.latency_ms?.p50,
        p95: a.latency_ms?.p95,
        per1k: a.cost_usd?.per_1k_evals,
        perTask: a.cost_usd?.per_successful_task ?? null,
        success: a.n ? a.n_success / a.n : null,
        accuracy: a.answer_accuracy?.rate ?? null,
      };
      if (scope.kind === "agentic") {
        out.task_completion = a.task_completion ?? null;
        out.recovery        = a.recovery_rate?.rate ?? null;
        out.fabrication     = a.stage2?.grounding_faithfulness?.mean_fabrication_rate ?? null;
        out.judge_mean      = a.stage2?.judge?.overall_mean ?? null;
        out.tool_acc        = a.tool_call_accuracy?.rate ?? null;
        out.efficiency      = a.efficiency?.rate ?? null;
      }
      return out;
    });
  }

  // ----- Column extremes for coloring (supports lower-is-better columns) -----
  function sortRows(rows) {
    const dir = SEL.sort.asc ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[SEL.sort.key], bv = b[SEL.sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });
  }

  // Breadcrumb: "Viewing: <suite> · N candidates · filtered to <providers> + <tiers>"
  function crumb(scope, rows) {
    const cmp = scope.comparison;
    const allProv = ["anthropic","openai","google","xai"];
    const allTier = ["frontier","balanced","fast"];
    const provList = [...SEL.providers].map(p => UI.PROVIDER_LABEL[p] || p);
    const tierList = [...SEL.tiers];
    const provTxt = SEL.providers.size === allProv.length ? "all providers" : provList.join(", ");
    const tierTxt = SEL.tiers.size     === allTier.length ? "all tiers"     : `${tierList.join(" + ")} tier${tierList.length > 1 ? "s" : ""}`;
    const kindTag = scope.kind === "agentic"
      ? `<span class="lb-kind lb-kind-agentic">agentic · 2-stage</span>`
      : `<span class="lb-kind">${UI.esc(scope.kind || "flagship")}</span>`;
    return `
      <div class="lb-crumb">
        <span class="lb-crumb-k">Viewing</span>
        <span class="lb-crumb-scope">${UI.esc(scope.label)}</span>
        ${kindTag}
        <span class="lb-crumb-sep">·</span>
        <span class="lb-crumb-n">${rows.length} / ${cmp.n_candidates} candidates</span>
        <span class="lb-crumb-sep">·</span>
        <span class="lb-crumb-filter">filtered to <b>${UI.esc(provTxt)}</b> + <b>${UI.esc(tierTxt)}</b></span>
      </div>
    `;
  }

  // --- Column definitions ---
  // Each column: { key, label, title?, num, lowIsBest, fmt(r, ex), agg? }
  function colsFor(scope) {
    const base = [
      { key: "rank",    label: "#",        num: false, fmt: (r, i) => `<td class="rank ${i === 0 ? "top" : ""}">${i + 1}</td>` },
      { key: "model",   label: "Model",    num: false, fmt: (r) => `<td class="model-cell">${UI.modelLabel(r.model, r.provider, r.runtime)}</td>` },
      { key: "fit",     label: "Fit",      title: "Composite 0-100", num: true, lowIsBest: false,
        fmt: (r, i, ex) => `<td class="fit-cell">${UI.fitBar(r.fit, r.model)}</td>` },
    ];
    if (scope.kind === "agentic") {
      // Agentic column set — Phase D metrics.
      base.push(
        { key: "task_completion", label: "Task ✓",     title: "Task completion rate (per 15-task suite)", num: true, lowIsBest: false, fmt: (r, i, ex) => numCell(r.task_completion, "task_completion", ex, false, fmtPct) },
        { key: "recovery",        label: "Recovery",   title: "Recovery rate — % of runs that correctly recovered from an error response", num: true, lowIsBest: false, fmt: (r, i, ex) => numCell(r.recovery, "recovery", ex, false, fmtPct) },
        { key: "fabrication",     label: "Fab. rate",  title: "Grounding faithfulness — mean fabrication rate on Stage 2 emails. Lower is better.", num: true, lowIsBest: true,  fmt: (r, i, ex) => numCell(r.fabrication, "fabrication", ex, true, fmtPct) },
        { key: "judge_mean",      label: "Judge 1-5",  title: "Stage 2 judge overall mean (3-run avg across 4 dimensions)",                          num: true, lowIsBest: false, fmt: (r, i, ex) => judgeCell(r.judge_mean, "judge_mean", ex) },
        { key: "p50",             label: "p50 lat.",   num: true, lowIsBest: true,  fmt: (r, i, ex) => numCell(r.p50, "p50", ex, true, UI.fmtMs) },
        { key: "perTask",         label: "$ / task",   title: "Cost per successful task — includes cost of failed attempts", num: true, lowIsBest: true, fmt: (r, i, ex) => numCell(r.perTask, "perTask", ex, true, fmtCost) },
      );
    } else {
      base.push(
        { key: "p50",     label: "p50 lat.", num: true, lowIsBest: true,  fmt: (r, i, ex) => numCell(r.p50, "p50", ex, true, UI.fmtMs) },
        { key: "p95",     label: "p95 lat.", num: true, lowIsBest: true,  fmt: (r, i, ex) => numCell(r.p95, "p95", ex, true, UI.fmtMs) },
        { key: "per1k",   label: "$/1k",     num: true, lowIsBest: true,  fmt: (r, i, ex) => numCell(r.per1k, "per1k", ex, true, UI.fmtCost1k) },
        { key: "success", label: "Success",  num: true, lowIsBest: false, fmt: (r, i, ex) => numCell(r.success, "success", ex, false, UI.fmtRate) },
      );
      // Accuracy shows only when any candidate has it.
      // Caller will splice below.
    }
    base.push(
      { key: "_chev", label: "", num: false, fmt: () => `<td class="lb-chev">›</td>` }
    );
    return base;
  }

  function fmtPct(v) {
    if (v == null) return "—";
    return `<span class="n">${(v * 100).toFixed(1)}</span><span class="u">%</span>`;
  }
  function fmtCost(v) {
    if (v == null) return "—";
    if (v < 0.1)   return `<span class="n">$${v.toFixed(4)}</span>`;
    if (v < 1)     return `<span class="n">$${v.toFixed(3)}</span>`;
    return `<span class="n">$${v.toFixed(2)}</span>`;
  }
  function judgeCell(v, key, ex) {
    if (v == null) return `<td class="num-cell">—</td>`;
    const pct = ((v - 1) / 4) * 100;
    const best = ex[key] && v === ex[key].max ? "best" : "";
    return `<td class="num-cell judge-cell ${best}">
      <div class="lb-judge">
        <div class="lb-judge-bar"><div class="lb-judge-fill" style="width:${pct.toFixed(1)}%;"></div></div>
        <span class="lb-judge-n">${v.toFixed(1)}</span>
      </div>
    </td>`;
  }
  function numCell(v, key, ex, lowIsBest, fmtter) {
    const cls = UI.cellCls(v, key, ex, lowIsBest);
    return `<td class="${cls}">${v == null ? "—" : fmtter(v)}</td>`;
  }

  // --- Same-model pair detection. Returns [[a, b], ...] for pairs that share
  //     a model but differ in runtime. Used for the "vs" affordance + delta. ---
  function sameModelPairs(rows) {
    const byModel = {};
    for (const r of rows) (byModel[r.model] ||= []).push(r);
    const pairs = [];
    for (const m of Object.keys(byModel)) {
      const group = byModel[m];
      if (group.length < 2) continue;
      // Only compare pairs that actually differ on runtime.
      for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
        if ((group[i].runtime || "") !== (group[j].runtime || "")) {
          pairs.push([group[i], group[j]]);
        }
      }
    }
    return pairs;
  }

  function deltaRow(a, b, colspan, isAgentic) {
    const dMeanTurns = (a.aggregate?.turns?.mean ?? null);
    const bMeanTurns = (b.aggregate?.turns?.mean ?? null);
    const dPer1k = a.per1k, bPer1k = b.per1k;
    const dPerTask = a.perTask, bPerTask = b.perTask;
    const aRt = a.runtime || "default";
    const bRt = b.runtime || "default";
    const delta = (x, y, fmt) => {
      if (x == null || y == null) return "—";
      const d = y - x;
      const sign = d > 0 ? "+" : "";
      return `${sign}${fmt(d)}`;
    };
    const fmtX = (d) => (Math.abs(d) < 1 ? d.toFixed(2) : d.toFixed(1));
    const fmtD = (d) => `$${d.toFixed(3)}`;
    const axis = (lbl, xv, yv, fmtv) => `
      <div class="lb-vs-axis">
        <div class="lb-vs-k">${lbl}</div>
        <div class="lb-vs-row">
          <span class="lb-vs-a">${xv}</span>
          <span class="lb-vs-arrow">→</span>
          <span class="lb-vs-b">${yv}</span>
        </div>
      </div>
    `;
    const fmtNum = (v) => v == null ? "—" : (typeof v === "number" && v < 1 ? v.toFixed(2) : Math.round(v * 10) / 10);
    const fmtCost2 = (v) => v == null ? "—" : `$${v.toFixed(v < 0.1 ? 4 : 3)}`;
    const p50A = a.p50, p50B = b.p50;
    return `
      <tr class="lb-vs-row-tr">
        <td colspan="${colspan}">
          <div class="lb-vs-card">
            <div class="lb-vs-lead">
              <div class="lb-vs-kicker">Same model · two runtimes</div>
              <div class="lb-vs-title">
                <span class="lb-vs-model">${UI.esc(UI.modelDisplay(a.model))}</span>
                <span class="lb-vs-chip">${UI.esc(aRt)}</span>
                <span class="lb-vs-vs">vs</span>
                <span class="lb-vs-chip">${UI.esc(bRt)}</span>
              </div>
              <div class="lb-vs-blurb">
                Identical model weights, different harness. The headline finding: cost and turn-count diverge by multiples.
              </div>
            </div>
            <div class="lb-vs-axes">
              ${axis("mean turns",    fmtNum(dMeanTurns), fmtNum(bMeanTurns), fmtNum)}
              ${axis("$ / 1k evals",  fmtCost2(dPer1k),    fmtCost2(bPer1k),    fmtCost2)}
              ${isAgentic ? axis("$ / task", fmtCost2(dPerTask), fmtCost2(bPerTask), fmtCost2) : ""}
              ${axis("p50 latency",   p50A != null ? Math.round(p50A) + "ms" : "—", p50B != null ? Math.round(p50B) + "ms" : "—", (v)=>v)}
            </div>
          </div>
        </td>
      </tr>
    `;
  }

  function render() {
    const scope = currentScope();
    const cmp = scope.comparison;
    const isAgentic = scope.kind === "agentic";

    const all = buildRows(scope);
    // Determine accuracy column visibility for non-agentic scopes
    const hasAccuracy = !isAgentic && all.some(r => r.accuracy != null);
    const cols = colsFor(scope);
    if (hasAccuracy) {
      // Insert Accuracy column before the trailing _chev column
      cols.splice(cols.length - 1, 0, {
        key: "accuracy", label: "Accuracy", title: "Exact-match accuracy against ground-truth answers",
        num: true, lowIsBest: false,
        fmt: (r, i, ex) => numCell(r.accuracy, "accuracy", ex, false, UI.fmtRate),
      });
    }

    const extremes = UI.columnExtremes(all, {
      p50:             r => r.p50,
      p95:             r => r.p95,
      per1k:           r => r.per1k,
      success:         r => r.success,
      accuracy:        r => r.accuracy,
      task_completion: r => r.task_completion,
      recovery:        r => r.recovery,
      fabrication:     r => r.fabrication,
      judge_mean:      r => r.judge_mean,
      perTask:         r => r.perTask,
    });

    const sorted = sortRows(all);
    const pairs = isAgentic ? sameModelPairs(sorted) : [];
    // Mark pair partners for link rendering
    const pairSet = new Set();
    const pairLinks = new Map(); // model -> [rowA, rowB]
    for (const [a, b] of pairs) {
      pairSet.add(a); pairSet.add(b);
      pairLinks.set(a.model, [a, b]);
    }

    // Build tbody — interleave a "vs" row after the second partner appears
    const seenPair = new Set();
    const colspan = cols.length;
    let rowHtml = "";
    sorted.forEach((r, i) => {
      const cells = cols.map(c => c.fmt(r, i, extremes)).join("");
      const pairCls = pairSet.has(r) ? "lb-row-paired" : "";
      rowHtml += `<tr class="${pairCls}" data-model="${UI.esc(r.model)}" data-runtime="${UI.esc(r.runtime || "")}">${cells}</tr>`;
      // After we've seen both partners of a pair, emit the delta row
      for (const [a, b] of pairs) {
        if (seenPair.has(a.model)) continue;
        if (r === a || r === b) {
          // check if the other is already seen
          const other = r === a ? b : a;
          if (sorted.indexOf(other) <= i) {
            rowHtml += deltaRow(a, b, colspan, isAgentic);
            seenPair.add(a.model);
          }
        }
      }
    });

    const sortClass = (key, isNum) =>
      (SEL.sort.key === key ? `sort ${SEL.sort.asc ? "asc" : ""}` : "") + (isNum ? " num" : "");

    const thead = cols.map(c => {
      if (c.key === "rank" || c.key === "_chev") return `<th style="width:${c.key === "rank" ? 44 : 32}px;"></th>`;
      if (c.key === "model") return `<th class="${sortClass("model", false)}" data-sort="model">Model</th>`;
      return `<th class="${sortClass(c.key, true)}" data-sort="${c.key}" title="${UI.esc(c.title || "")}">${UI.esc(c.label)}</th>`;
    }).join("");

    // Filters (providers / tiers)
    const provChips = ["anthropic","openai","google","xai"].map(p => `
      <button class="filter-chip ${SEL.providers.has(p) ? "on" : ""}" data-prov="${p}">
        <span class="pd" style="background:${UI.PROVIDER_COLORS[p]};"></span>
        ${UI.esc(UI.PROVIDER_LABEL[p])}
      </button>
    `).join("");
    const tierChips = ["frontier","balanced","fast"].map(t => `
      <button class="filter-chip ${SEL.tiers.has(t) ? "on" : ""}" data-tier="${t}">${UI.esc(t)}</button>
    `).join("");

    // Suite switcher strip (grouped)
    const suitesHtml = UI.suiteSwitcher(B.scopes, scope.id);

    return `
      <main class="main v3-main">
        <section class="v3-hero v3-hero-slim">
          <div class="v3-kicker">Leaderboard · preview</div>
          <h1 class="v3-title">Every number. Every candidate. One table.</h1>
          <p class="v3-blurb">
            The power-user reference view — raw aggregates, sortable, filterable.
            ${isAgentic ? `Agentic scope: columns show Stage 1 task-completion + Stage 2 grounding & judge.` : `Use Frontier for persona-weighted picks; use this view to check the numbers.`}
          </p>
        </section>

        ${suitesHtml}

        ${crumb(scope, all)}

        <section class="lb-filters">
          <div class="lb-filter-group">
            <span class="lb-filter-k">Providers</span>
            <div class="lb-chips">${provChips}</div>
          </div>
          <div class="lb-filter-group">
            <span class="lb-filter-k">Tier</span>
            <div class="lb-chips">${tierChips}</div>
          </div>
        </section>

        <div class="board lb-board">
          <div class="board-head">
            <div>
              <div class="title">${UI.esc(scope.label)} · ${isAgentic ? "agentic columns" : "flagship columns"}</div>
              <div class="meta" style="margin-top:3px;">
                ${cmp.n_candidates} candidates · ${cmp.n_rows} rows · suite ${UI.esc(scope.id)}
              </div>
            </div>
            <div class="meta">last run ${UI.fmtTs(cmp.completed_at)}</div>
          </div>
          <div style="overflow-x:auto;">
            <table class="board-table lb-table">
              <thead><tr>${thead}</tr></thead>
              <tbody>${rowHtml}</tbody>
            </table>
          </div>
          <div class="board-footer">
            <span>comparison ${UI.esc(cmp.comparison_id.slice(0, 34))}…</span>
            <span>dataset ${UI.esc(UI.datasetBasename(cmp.dataset_path))}</span>
          </div>
        </div>

        ${isAgentic ? legendAgentic() : ""}
      </main>
    `;
  }

  function legendAgentic() {
    return `
      <section class="lb-legend">
        <div class="lb-legend-k">Agentic columns · reading the metrics</div>
        <div class="lb-legend-grid">
          <div><b>Task ✓</b> — % of 15 tasks where the Stage 1 agent produced a valid <code>ProspectProfile</code> and survived to Stage 2.</div>
          <div><b>Recovery</b> — % of times the agent, after hitting a tool error, corrected course rather than giving up. Higher = more resilient.</div>
          <div><b>Fab. rate</b> — on Stage 2 emails, share of claims that <em>couldn't</em> be traced to a tool output. <em>Lower is better</em> — color scale inverted.</div>
          <div><b>Judge 1-5</b> — three independent judge runs, averaged across tone, specificity, grounding, call-to-action.</div>
          <div><b>$ / task</b> — total spend ÷ completed tasks. Penalises models that waste tokens on failures.</div>
        </div>
      </section>
    `;
  }

  function mount() {
    document.querySelectorAll(".v3-suite").forEach(el => {
      el.addEventListener("click", () => {
        SEL.suite = el.dataset.suite;
        persist();
        window.__APP.render();
      });
    });
    document.querySelectorAll(".filter-chip[data-prov]").forEach(el => {
      el.addEventListener("click", () => {
        const p = el.dataset.prov;
        SEL.providers.has(p) ? SEL.providers.delete(p) : SEL.providers.add(p);
        if (SEL.providers.size === 0) ["anthropic","openai","google","xai"].forEach(x => SEL.providers.add(x));
        persist();
        window.__APP.render();
      });
    });
    document.querySelectorAll(".filter-chip[data-tier]").forEach(el => {
      el.addEventListener("click", () => {
        const t = el.dataset.tier;
        SEL.tiers.has(t) ? SEL.tiers.delete(t) : SEL.tiers.add(t);
        if (SEL.tiers.size === 0) ["frontier","balanced","fast"].forEach(x => SEL.tiers.add(x));
        persist();
        window.__APP.render();
      });
    });
    document.querySelectorAll(".lb-table th[data-sort]").forEach(el => {
      el.addEventListener("click", () => {
        const key = el.dataset.sort;
        if (SEL.sort.key === key) SEL.sort.asc = !SEL.sort.asc;
        else SEL.sort = { key, asc: key === "model" };
        persist();
        window.__APP.render();
      });
    });
    // Click a row → trace diff for that model
    document.querySelectorAll(".lb-table tbody tr[data-model]").forEach(el => {
      el.addEventListener("click", () => {
        localStorage.setItem("cmbv3_td_model", el.dataset.model);
        localStorage.setItem("cmbv3_td_runtime", el.dataset.runtime || "");
        // Also share suite
        localStorage.setItem("cmbv3_suite", SEL.suite);
        window.__APP.navigate("trace-diff");
      });
    });
  }

  window.__V3_SCREENS = window.__V3_SCREENS || {};
  window.__V3_SCREENS.leaderboard = { render, mount };
})();
