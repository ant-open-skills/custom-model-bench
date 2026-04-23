/**
 * Shared UI primitives + provider/model/tier mappings.
 * All functions return HTML strings (not DOM nodes) to compose cleanly with
 * the screen renderers.
 */

(() => {
  const PROVIDER_COLORS = {
    anthropic: "#d97757",
    openai:    "#10a37f",
    google:    "#4285f4",
    xai:       "#64748b",
  };

  const PROVIDER_LABEL = {
    anthropic: "Anthropic",
    openai:    "OpenAI",
    google:    "Google",
    xai:       "xAI",
  };

  // Hand-curated model → tier mapping. Unknown models default to "balanced".
  const MODEL_TIER = {
    // Anthropic
    "claude-opus-4-7":                 "frontier",
    "claude-sonnet-4-6":               "balanced",
    "claude-haiku-4-5":                "fast",
    // OpenAI
    "gpt-5.4":                         "frontier",
    "gpt-5.4-mini":                    "balanced",
    "gpt-5.4-nano":                    "fast",
    "gpt-4.1":                         "balanced",
    "gpt-4.1-mini":                    "fast",
    "gpt-4o":                          "balanced",
    "gpt-4o-mini":                     "fast",
    // Google
    "gemini-3.1-pro-preview":          "frontier",
    "gemini-3-flash-preview":          "balanced",
    "gemini-3.1-flash-lite-preview":   "fast",
    "gemini-2.5-pro":                  "frontier",
    "gemini-2.5-flash":                "balanced",
    // xAI
    "grok-4":                          "frontier",
    "grok-4.20-0309-reasoning":        "frontier",
    "grok-4.20-0309-non-reasoning":    "balanced",
    "grok-4.20-multi-agent-0309":      "frontier",
    "grok-4-1-fast-reasoning":         "fast",
    "grok-4-1-fast-non-reasoning":     "fast",
    "grok-4-fast":                     "fast",
    "grok-3-mini":                     "fast",
  };

  const MODEL_DISPLAY = {
    "claude-opus-4-7":                 "Opus 4.7",
    "claude-sonnet-4-6":               "Sonnet 4.6",
    "claude-haiku-4-5":                "Haiku 4.5",
    "gpt-5.4":                         "GPT-5.4",
    "gpt-5.4-mini":                    "GPT-5.4 mini",
    "gpt-5.4-nano":                    "GPT-5.4 nano",
    "gemini-3.1-pro-preview":          "Gemini 3.1 Pro",
    "gemini-3-flash-preview":          "Gemini 3 Flash",
    "gemini-3.1-flash-lite-preview":   "Gemini 3.1 Flash-Lite",
    "grok-4":                          "Grok 4",
    "grok-4.20-0309-reasoning":        "Grok 4.20 reasoning",
    "grok-4.20-0309-non-reasoning":    "Grok 4.20",
    "grok-4-1-fast-non-reasoning":     "Grok 4.1 Fast",
  };

  function modelDisplay(model) {
    return MODEL_DISPLAY[model] || model;
  }
  function modelTier(model) {
    return MODEL_TIER[model] || "balanced";
  }

  // ---- Formatting helpers ----
  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function fmtMs(v) {
    if (v == null || !Number.isFinite(v)) return "—";
    if (v < 1000) return `<span class="n">${Math.round(v)}</span><span class="u">ms</span>`;
    return `<span class="n">${(v / 1000).toFixed(2)}</span><span class="u">s</span>`;
  }
  function fmtCost1k(v) {
    if (v == null || !Number.isFinite(v)) return "—";
    if (v < 0.01) return `<span class="n">$${v.toFixed(4)}</span>`;
    if (v < 1) return `<span class="n">$${v.toFixed(3)}</span>`;
    return `<span class="n">$${v.toFixed(2)}</span>`;
  }
  function fmtRate(r) {
    if (r == null || !Number.isFinite(r)) return "—";
    return `<span class="n">${(r * 100).toFixed(1)}</span><span class="u">%</span>`;
  }
  function fmtTs(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60)  return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60)  return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24)  return `${h} hr ago`;
    const day = Math.floor(h / 24);
    return `${day} d ago`;
  }

  // ---- UI primitives (HTML strings) ----
  function providerDot(provider) {
    return `<span class="provider-dot" style="background:${PROVIDER_COLORS[provider] || "#888"};"></span>`;
  }
  function tierBadge(tier) {
    return `<span class="tier-badge ${tier}">${tier}</span>`;
  }
  // Small secondary badge shown when a candidate runs under a non-default
  // runtime (e.g. "cagent-sdk"). Helps distinguish rows that share the same
  // provider/model string but run through a different adapter.
  function runtimeBadge(runtime) {
    if (!runtime || runtime === "vercel") return "";
    return `<span class="runtime-badge ${esc(runtime)}" title="Runtime: ${esc(runtime)}">${esc(runtime)}</span>`;
  }
  function modelLabel(model, provider, runtime) {
    const tier = modelTier(model);
    return `
      <div class="model-line">
        ${providerDot(provider)}
        <span class="model-name">${esc(modelDisplay(model))}</span>
        ${tierBadge(tier)}
        ${runtimeBadge(runtime)}
      </div>
      <div class="model-provider">${esc(PROVIDER_LABEL[provider] || provider)} · <span class="mono">${esc(model)}</span></div>
    `;
  }
  function fitBar(value, model) {
    const tier = modelTier(model);
    const pct = Math.max(0, Math.min(100, Math.round(value)));
    return `
      <div class="fit-wrap">
        <div class="fit-bar tier-${tier}">
          <div class="fill" style="width:${pct}%;"></div>
        </div>
        <div class="fit-num">${pct}</div>
      </div>
    `;
  }

  // Compute {min, max} for a set of extractors across candidates.
  function columnExtremes(rows, extractors) {
    const out = {};
    for (const key of Object.keys(extractors)) {
      const vs = rows.map(r => extractors[key](r)).filter(v => v != null && Number.isFinite(v));
      if (vs.length === 0) { out[key] = null; continue; }
      out[key] = { min: Math.min(...vs), max: Math.max(...vs) };
    }
    return out;
  }
  function cellCls(val, key, extremes, lowIsBest) {
    if (val == null || !Number.isFinite(val)) return "num-cell";
    const ex = extremes[key];
    if (!ex || ex.min === ex.max) return "num-cell";
    const best = lowIsBest ? ex.min : ex.max;
    const worst = lowIsBest ? ex.max : ex.min;
    if (val === best) return "num-cell best";
    if (val === worst) return "num-cell worst";
    return "num-cell";
  }

  function datasetBasename(p) {
    if (!p) return "—";
    const parts = p.split("/");
    return parts.slice(-2).join("/");
  }

  // --- Suite switcher (grouped by scope kind) ---------------------------
  // Renders the row of scope cards above hero/leaderboard/etc., organized
  // into three labeled columns: open-ended benchmarks, agentic workflows,
  // agent harnesses. The "harnesses" column is an empty-state today —
  // populates when `kind: "harness"` scopes land (e.g. SWE-bench-style).
  function suiteSwitcher(scopes, activeId) {
    const flagships = scopes.filter(s => s.kind === "flagship");
    const agentic   = scopes.filter(s => s.kind === "agentic");
    // Future: s.kind === "harness"
    const harnesses = scopes.filter(s => s.kind === "harness");

    const card = (s) => `
      <button class="v3-suite ${s.id === activeId ? "active" : ""}" data-suite="${esc(s.id)}">
        <div class="su-label">${esc(s.label)}</div>
        <div class="su-sub">${s.comparison?.n_candidates || 0} candidates · ${s.comparison?.n_rows || 0} rows</div>
      </button>
    `;

    const col = (title, items, opts = {}) => `
      <div class="v3-suite-col ${opts.muted ? "is-muted" : ""}">
        <div class="v3-suite-col-h">${esc(title)}</div>
        <div class="v3-suite-col-body">
          ${items.length
            ? items.map(card).join("")
            : `<div class="v3-suite-empty">${esc(opts.emptyLabel || "None yet")}</div>`}
        </div>
      </div>
    `;

    return `
      <section class="v3-suites v3-suites-grouped">
        ${col("Baseline benchmarks", flagships)}
        ${col("Agentic workflows", agentic)}
        ${col("Agent harnesses", harnesses, { muted: true, emptyLabel: "Coming soon" })}
      </section>
    `;
  }

  window.BENCH_UI = {
    PROVIDER_COLORS, PROVIDER_LABEL, MODEL_TIER, MODEL_DISPLAY,
    modelDisplay, modelTier,
    esc, fmtMs, fmtCost1k, fmtRate, fmtTs,
    providerDot, tierBadge, runtimeBadge, modelLabel, fitBar,
    columnExtremes, cellCls, datasetBasename,
    suiteSwitcher,
  };
})();
