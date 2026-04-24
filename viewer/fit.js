/**
 * Fit score — ported from bench-design-v2/project/fit.jsx (1:1).
 *
 * A 0-100 composite per candidate, re-weightable by use case, computed
 * client-side from our real aggregate fields only (no rubric data required).
 *
 * Normalization reference points:
 *   latency p50:  150ms → 100  ·  3000ms → 0    (log)
 *   latency p95:  300ms → 100  ·  5000ms → 0    (log)
 *   cost /1k:     $0.05 → 100  ·  $5.00 → 0     (log)
 *   success rate: 0.95 → 80    ·  1.00 → 100    (linear on tail; falls to 0 at 0.5)
 *
 * Weights per use case sum to 1.0. `quality` reserved at weight 0 until Phase E
 * ships rubric grading.
 */

(() => {
  function normLat(ms, good = 150, bad = 3000) {
    if (ms == null) return 0;
    const lg = Math.log(good), lb = Math.log(bad);
    const t = (Math.log(Math.max(1, ms)) - lg) / (lb - lg);
    return Math.max(0, Math.min(100, 100 * (1 - t)));
  }
  function normCost(usdPer1k, good = 0.05, bad = 5.0) {
    if (usdPer1k == null) return 0;
    const lg = Math.log(good), lb = Math.log(bad);
    const t = (Math.log(Math.max(0.001, usdPer1k)) - lg) / (lb - lg);
    return Math.max(0, Math.min(100, 100 * (1 - t)));
  }
  function normSuccess(r) {
    if (r == null) return 0;
    if (r >= 0.95) return 80 + (r - 0.95) / 0.05 * 20;
    return Math.max(0, (r - 0.5) / 0.45 * 80);
  }
  // Agentic-scope sub-scores. Return 0 when the aggregate doesn't carry the
  // field, so non-agentic candidates score 0 on these dims — which is fine
  // because agentic-aware personas are only meaningful on agentic scopes.
  function normQuality(aggregate) {
    const m = aggregate?.stage2?.judge?.overall_mean;
    if (m == null) return 0;
    return Math.max(0, Math.min(100, (m / 5) * 100));
  }
  function normRecovery(aggregate) {
    const r = aggregate?.recovery_rate?.rate;
    if (r == null) return 0;
    return Math.max(0, Math.min(100, r * 100));
  }
  function normTaskCompletion(aggregate) {
    // Emitted as either a scalar (yc-qualifier) or { rate } depending on scope.
    const v = aggregate?.task_completion;
    const r = typeof v === "number" ? v : v?.rate;
    if (r == null) return 0;
    return Math.max(0, Math.min(100, r * 100));
  }

  const USECASES = {
    balanced: {
      id: "balanced", label: "Balanced",
      help: "Equal emphasis on latency, cost, and reliability",
      weights: { lat50: 0.25, lat95: 0.10, cost: 0.30, success: 0.35, quality: 0 },
    },
    speed: {
      id: "speed", label: "Speed-critical",
      help: "Optimize for interactive UX; p95 counts",
      weights: { lat50: 0.45, lat95: 0.30, cost: 0.05, success: 0.20, quality: 0 },
    },
    cost: {
      id: "cost", label: "Cost-sensitive",
      help: "Minimize $/1k evals, keep reliability",
      weights: { lat50: 0.05, lat95: 0.05, cost: 0.60, success: 0.30, quality: 0 },
    },
    reliability: {
      id: "reliability", label: "Reliability-first",
      help: "Success rate dominates; soft preference for speed",
      weights: { lat50: 0.15, lat95: 0.05, cost: 0.10, success: 0.70, quality: 0 },
    },
  };

  function compute(aggregate, usecaseId = "balanced") {
    const uc = USECASES[usecaseId] || USECASES.balanced;
    const sub = {
      lat50:            normLat(aggregate.latency_ms?.p50),
      lat95:            normLat(aggregate.latency_ms?.p95, 300, 5000),
      cost:             normCost(aggregate.cost_usd?.per_1k_evals),
      success:          normSuccess(aggregate.n_success / aggregate.n),
      // Agentic-scope sub-scores. 0 when the scope doesn't emit them —
      // existing USECASES give them weight 0, so backward-compat holds.
      quality:          normQuality(aggregate),
      recovery:         normRecovery(aggregate),
      task_completion:  normTaskCompletion(aggregate),
    };
    let total = 0, wsum = 0;
    for (const k of Object.keys(uc.weights)) {
      total += (sub[k] || 0) * uc.weights[k];
      wsum  += uc.weights[k];
    }
    const fit = wsum > 0 ? total / wsum : 0;
    return { fit, sub, weights: uc.weights };
  }

  window.FitScore = {
    compute, USECASES,
    normLat, normCost, normSuccess,
    normQuality, normRecovery, normTaskCompletion,
  };
})();
