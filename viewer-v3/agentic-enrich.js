/**
 * Agentic enrichment layer (Phase D + E).
 *
 * The backend will eventually emit these fields directly; until then we
 * synthesise them from a deterministic seed (model+runtime+rowId) so the
 * surface renders and stays stable across reloads.
 *
 * Mutates window.__BENCH in place on load. No-op for scopes that are not
 * kind:"agentic".
 *
 * Aggregate fields added per run:
 *   - task_completion            0..1
 *   - recovery_rate.rate         0..1
 *   - dead_end_rate              0..1
 *   - tool_call_accuracy.rate    0..1
 *   - efficiency.rate            0..1
 *   - schema_compliance.rate     0..1
 *   - ground_truth.tech_stack_overlap_mae, .fit_score_mae, .contacts_precision
 *   - stage2.judge.overall_mean  1..5
 *   - stage2.judge.overall_std   0..1
 *   - stage2.judge.dimensions.{tone,specificity,grounding,call_to_action}.mean
 *   - stage2.grounding_faithfulness.mean_fabrication_rate 0..1
 *
 * Per-row fields added on row.stage2:
 *   - email_text: { recipient_name, subject, body }
 *   - grounding:  { claim_results: [{ claim, grounded, evidence }] }
 *   - judge:      { runs: [{run_id, scores:{...}, rationale}, ...], overall_mean, std }
 */

(() => {
  const B = window.__BENCH;
  if (!B || !Array.isArray(B.scopes)) return;

  // --- Deterministic PRNG: seed → [0,1) stream ---
  function hash32(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(seed) {
    let t = seed >>> 0;
    return () => {
      t = (t + 0x6d2b79f5) >>> 0;
      let r = t;
      r = Math.imul(r ^ (r >>> 15), r | 1);
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeRng(seedStr) { return mulberry32(hash32(seedStr)); }

  // Models we bias slightly (better→ worse): opus > sonnet > haiku;
  // cagent-sdk runs take longer/score a touch higher on grounding.
  function modelBias(model) {
    if (model.includes("opus"))   return 0.12;
    if (model.includes("sonnet")) return 0.04;
    if (model.includes("haiku"))  return -0.06;
    return 0;
  }
  function runtimeBias(runtime) {
    if (runtime === "cagent-sdk") return 0.05;
    return 0;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // --- Canned per-row content (keyed by row id → company) ---
  const ROW_COMPANY = {
    "yc-001": { name: "Anthropic",  slug: "anthropic",   contact: "Tom Brown" },
    "yc-002": { name: "OpenAI",     slug: "openai",      contact: "Greg Brockman" },
    "yc-003": { name: "Vercel",     slug: "vercel",      contact: "Guillermo Rauch" },
    "yc-004": { name: "Supabase",   slug: "supabase",    contact: "Paul Copplestone" },
    "yc-005": { name: "Stripe",     slug: "stripe",      contact: "David Singleton" },
    "yc-006": { name: "Linear",     slug: "linear",      contact: "Karri Saarinen" },
    "yc-007": { name: "Figma",      slug: "figma",       contact: "Evan Wallace" },
    "yc-008": { name: "Notion",     slug: "notion",      contact: "Ivan Zhao" },
    "yc-009": { name: "Shopify",    slug: "shopify",     contact: "Mikhail Parakhin" },
    "yc-010": { name: "Databricks", slug: "databricks",  contact: "Reynold Xin" },
    "yc-011": { name: "HashiCorp",  slug: "hashicorp",   contact: "Armon Dadgar" },
    "yc-012": { name: "Cloudflare", slug: "cloudflare",  contact: "John Graham-Cumming" },
    "yc-013": { name: "Microsoft",  slug: "microsoft",   contact: "Scott Guthrie" },
    "yc-014": { name: "Apple",      slug: "apple",       contact: "Craig Federighi" },
    "yc-015": { name: "Meta",       slug: "meta",        contact: "Andrew Bosworth" },
  };

  function emailFor(rowId, company, rng) {
    const firstName = (company.contact || "there").split(" ")[0];
    const hook = [
      "Noticed your team's recent work",
      "Your GitHub footprint pointed me here",
      "Your LinkedIn surfaced you",
      "Your team's language mix caught my eye",
    ][Math.floor(rng() * 4)];
    const subjects = [
      `Benchmarking your agents, ${firstName}?`,
      `Quick read on ${company.name}'s eval story`,
      `${company.name} + AgentEval — worth 10 min?`,
      `Thought you'd want to see this, ${firstName}`,
    ];
    const subject = subjects[Math.floor(rng() * subjects.length)];
    const body = [
      `Hi ${firstName},`,
      ``,
      `${hook} — specifically the TypeScript-heavy stack at ${company.name} and the kind of agent workflows your team is shipping. We built AgentEval to make this exact setup easier to benchmark: same prompt × many candidates, with tool-call traces lined up column-by-column.`,
      ``,
      `Two things I think you'd find interesting:`,
      `• Same model (Sonnet 4.6), two harnesses → 9 turns vs 4 turns, $0.093 vs $0.026 per task. We surface that directly.`,
      `• Tool-call accuracy + recovery rate — not just final-answer correctness.`,
      ``,
      `If this lands, happy to show you the bench running against ${company.name}'s public API. 15 min?`,
      ``,
      `— sent from AgentEval`,
    ].join("\n");
    return {
      recipient_name: company.contact,
      subject,
      body,
    };
  }

  // A mini library of claim templates — grounded claims can be verified
  // against tool-call output; ungrounded ones are fabrications.
  function claimsFor(rowId, company, rng, fabRate) {
    const allGrounded = [
      { claim: `${company.name} maintains a public ${company.slug} GitHub org.`,   evidence: `github_lookup({org:"${company.slug}"}) → {public_repos: 42}` },
      { claim: `Their top repo has a TypeScript footprint.`,                        evidence: `github_lookup response: language_mix.TypeScript = 28%` },
      { claim: `${company.contact} is listed on their team page.`,                   evidence: `web_fetch(/team) → contact block matched` },
      { claim: `Company stack includes Python for backend tooling.`,                 evidence: `github_lookup response: language_mix.Python > 20%` },
      { claim: `Tech stack overlap with AgentEval's TypeScript core is >60%.`,       evidence: `computed from language_mix vs stack profile` },
    ];
    const allFab = [
      { claim: `${company.name} has 47 engineers working on agent infrastructure.`,       evidence: null },
      { claim: `${company.contact} previously worked at OpenAI as a researcher.`,          evidence: null },
      { claim: `They raised a Series C last quarter at a $4B valuation.`,                  evidence: null },
      { claim: `Their internal eval tooling is named "Benchwarmer".`,                      evidence: null },
    ];

    // Pick 4 grounded + some fabricated proportional to fabRate
    const rngIdx = () => Math.floor(rng() * 1e6);
    const picks = [];
    const grounded = [...allGrounded].sort(() => rngIdx() % 3 - 1).slice(0, 4);
    for (const g of grounded) picks.push({ ...g, grounded: true });
    const nFab = Math.max(0, Math.round(fabRate * 6));
    const fabs = [...allFab].sort(() => rngIdx() % 3 - 1).slice(0, nFab);
    for (const f of fabs) picks.push({ ...f, grounded: false });
    // Shuffle
    for (let i = picks.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [picks[i], picks[j]] = [picks[j], picks[i]];
    }
    return picks;
  }

  function judgeRunsFor(rowId, rng, baseMean) {
    // 3 independent judge runs, each with per-dim scores 1..5.
    // Dimensions: tone, specificity, grounding, call_to_action
    const dims = ["tone", "specificity", "grounding", "call_to_action"];
    const rationales = [
      "Opens well but the CTA is softer than ideal; could name a specific metric.",
      "Strong specificity — names the 9-vs-4-turn figure. Tone is professional, not too salesy.",
      "Grounding is tight: every claim maps to something a tool actually returned.",
      "CTA is clear (\"15 min?\") and the hook references the recipient's actual stack.",
      "Slightly generic opener; body recovers with concrete numbers.",
      "Tone borders on stiff — a softer second sentence would help.",
    ];
    const runs = [];
    for (let i = 0; i < 3; i++) {
      const jitter = (rng() - 0.5) * 0.6;
      const scores = {};
      let sum = 0;
      for (const d of dims) {
        const v = clamp(baseMean + jitter + (rng() - 0.5) * 0.35, 1, 5);
        scores[d] = Math.round(v * 10) / 10;
        sum += scores[d];
      }
      const overall = Math.round((sum / dims.length) * 10) / 10;
      runs.push({
        run_id: `judge_${rowId}_${i + 1}`,
        scores,
        overall,
        rationale: rationales[Math.floor(rng() * rationales.length)],
      });
    }
    const means = dims.reduce((o, d) => (o[d] = avg(runs.map(r => r.scores[d])), o), {});
    const overallMean = avg(runs.map(r => r.overall));
    const overallStd = std(runs.map(r => r.overall));
    return { runs, dimensions: means, overall_mean: round1(overallMean), overall_std: round2(overallStd) };
  }

  function avg(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
  function std(xs) {
    const m = avg(xs);
    const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length;
    return Math.sqrt(v);
  }
  function round1(v) { return Math.round(v * 10) / 10; }
  function round2(v) { return Math.round(v * 100) / 100; }

  function enrichRun(scope, run) {
    // Real backend data shipped in Phase E.4 — judge.overall_mean is the
    // tell-tale. If present, the run already carries real task_completion,
    // recovery_rate, judge, and grounding fields; don't overwrite them with
    // seeded synthetic values. This keeps the synth layer as a fallback for
    // any future scope declared kind:"agentic" that doesn't emit the Phase E
    // shapes yet.
    if (run?.aggregate?.stage2?.judge?.overall_mean != null) return;

    const bias = modelBias(run.model) + runtimeBias(run.runtime || "");
    const rngAgg = makeRng(`agg|${scope.id}|${run.config_file || run.model}|${run.runtime || ""}`);

    // Aggregate agentic fields
    const taskCompletion = clamp(0.70 + bias + (rngAgg() - 0.5) * 0.15, 0, 1);
    const recoveryRate   = clamp(0.60 + bias + (rngAgg() - 0.5) * 0.2, 0, 1);
    const deadEndRate    = clamp(0.12 - bias + (rngAgg() - 0.5) * 0.1, 0, 0.5);
    const toolAcc        = clamp(0.82 + bias * 0.5 + (rngAgg() - 0.5) * 0.12, 0, 1);
    const efficiency     = clamp(0.65 + bias - (run.runtime === "cagent-sdk" ? 0.1 : 0) + (rngAgg() - 0.5) * 0.15, 0, 1);
    const schemaComp     = clamp(0.90 + bias * 0.3 + (rngAgg() - 0.5) * 0.08, 0, 1);
    const fabRate        = clamp(0.14 - bias + (rngAgg() - 0.5) * 0.1, 0.02, 0.4);
    const judgeBase      = clamp(3.6 + bias * 8 + (rngAgg() - 0.5) * 0.4, 1, 5);
    const judgeOverall   = round1(judgeBase);
    const judgeStd       = round2(0.18 + Math.abs(rngAgg() - 0.5) * 0.2);

    run.aggregate = run.aggregate || {};
    run.aggregate.task_completion = round2(taskCompletion);
    run.aggregate.recovery_rate   = { rate: round2(recoveryRate), n: 15, matches: Math.round(recoveryRate * 15) };
    run.aggregate.dead_end_rate   = round2(deadEndRate);
    run.aggregate.tool_call_accuracy = { rate: round2(toolAcc), matches: Math.round(toolAcc * 37), n: 37 };
    run.aggregate.efficiency      = { rate: round2(efficiency) };
    run.aggregate.schema_compliance = { rate: round2(schemaComp) };
    run.aggregate.ground_truth    = {
      tech_stack_overlap_mae: round2(0.08 - bias * 0.3 + rngAgg() * 0.04),
      fit_score_mae:          round1(10 - bias * 15 + rngAgg() * 3),
      contacts_precision:     round2(clamp(0.75 + bias + (rngAgg() - 0.5) * 0.1, 0, 1)),
    };
    run.aggregate.stage2 = {
      judge: {
        overall_mean: judgeOverall,
        overall_std: judgeStd,
        dimensions: {
          tone:           round1(clamp(judgeBase + (rngAgg() - 0.5) * 0.3, 1, 5)),
          specificity:    round1(clamp(judgeBase + (rngAgg() - 0.5) * 0.5 + bias * 2, 1, 5)),
          grounding:      round1(clamp(judgeBase + (rngAgg() - 0.5) * 0.4 + bias * 3, 1, 5)),
          call_to_action: round1(clamp(judgeBase + (rngAgg() - 0.5) * 0.35, 1, 5)),
        },
      },
      grounding_faithfulness: {
        mean_fabrication_rate: round2(fabRate),
        n_claims_total:        90,
        n_grounded:            Math.round(90 * (1 - fabRate)),
      },
    };

    // Per-row stage2
    const rows = run.results || run.rows || [];
    for (const row of rows) {
      const rngRow = makeRng(`row|${scope.id}|${run.config_file || run.model}|${run.runtime || ""}|${row.id}`);
      const company = ROW_COMPANY[row.id] || { name: row.id, slug: row.id, contact: "Reader" };
      const rowFab = clamp(fabRate + (rngRow() - 0.5) * 0.1, 0, 0.5);
      const baseMean = clamp(judgeBase + (rngRow() - 0.5) * 0.5, 1, 5);
      const judge = judgeRunsFor(row.id, rngRow, baseMean);
      const claims = claimsFor(row.id, company, rngRow, rowFab);
      const nTotal = claims.length;
      const nGrounded = claims.filter(c => c.grounded).length;

      row.stage2 = {
        email_text: emailFor(row.id, company, rngRow),
        grounding: {
          claim_results: claims,
          n_total: nTotal,
          n_grounded: nGrounded,
          fabrication_rate: round2((nTotal - nGrounded) / Math.max(1, nTotal)),
        },
        judge,
      };
    }
  }

  for (const scope of B.scopes) {
    if (scope.kind !== "agentic") continue;
    const runs = scope.comparison?.runs || [];
    for (const run of runs) enrichRun(scope, run);
  }
})();
