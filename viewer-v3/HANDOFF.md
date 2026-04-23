# Handoff — v3 viewer → Claude Code

**Status:** design prototype complete. The viewer at `The Bench v3.html` is a self-contained preview of the v3 UX for the `custom-model-bench` kit, built against a synthesized data layer. This document is what Claude Code needs to migrate it into the repo at `ant-open-skills/custom-model-bench` and wire it to real backend output.

---

## What's in this folder

```
viewer-v3/
├── index.html                 app shell — top nav, tweaks drawer, design-doc drawer
├── app-v3.js                  hash routing · persistence · tweaks
├── styles.css                 v2 base tokens — carried forward
├── styles-v3.css              v3 typographic system (Newsreader serif, Inter Tight, JetBrains Mono)
├── styles-phase-de.css        Phase D/E additions — agentic leaderboard, stage-2 drilldown, workflow
│
├── data.js                    sample bundle — `window.__BENCH = { scopes: [...] }`
├── agentic-enrich.js          ⚠️ SYNTHETIC DATA LAYER — delete once backend emits agentic fields
│
├── fit.js                     0-100 composite fit score; 4 persona weight profiles
├── components.js              UI primitives (provider chips, model labels, tier icons)
│
├── frontier.js                screen — scatter-plot + persona dialer
├── trace-diff.js              screen — stacked columns per candidate; trace inlined
├── behavior.js                screen — turns / tokens / tool mix per candidate
├── leaderboard-v3.js          screen — agentic columns + same-model vs card + breadcrumb
├── stage2-drilldown.js        trace-diff addon — workflow + Stage 2 lens per candidate
├── workflow-diagram.js        hand-composed SVG pipeline for yc-qualifier (see §Workflow)
│
├── types.d.ts                 🟢 backend data contract — read this first
├── README.md                  orientation
├── MIGRATION.md               v2 → v3 diff notes
└── HANDOFF.md                 this file
```

**Dead code (already removed from index.html, kept on disk for reference):**
- `screens.js`, `app.js` — v2 renderers for old Leaderboard/Evals/Prompts/Runs sidebar. v3 replaces all four.

---

## Four screens, four routes

Hash-based routing. State persisted to `localStorage` (`cmbv3_*` keys).

| Route          | File                     | What it answers                                            |
|----------------|--------------------------|------------------------------------------------------------|
| `#frontier`    | `frontier.js`            | "Which model should I ship, given my persona weights?"     |
| `#trace-diff`  | `trace-diff.js` + `stage2-drilldown.js` | "Why does candidate A beat B on this row?"    |
| `#behavior`    | `behavior.js`            | "What's the turns/tokens/tool-mix shape per candidate?"    |
| `#leaderboard` | `leaderboard-v3.js`      | "The table." Agentic columns. Same-model-vs card.          |

**Leaderboard agentic columns** (when `scope.kind === "agentic"`): Fit · Task ✓ · Recovery · Fab. rate (inverted) · Judge 1–5 · p50 lat. · $ / task. Scope-switcher triggers column swap.

**Same-model vs card:** group rows by `run.model`; when two rows share model but differ in `run.runtime`, slot a delta card between them with mean turns / $-per-1k / $-per-task / p50. Flagship row: Sonnet 4.6 cagent-sdk vs vercel.

---

## Backend data contract

**Read `viewer-v3/types.d.ts` first.** Every shape the viewer reads is in there, with pointers to the source-of-truth files in the repo (system prompts, judge rubric, Zod schemas, graders).

Short version — what the comparison runner needs to emit:

### Per run (=per candidate) — `AgenticRun`
```ts
{
  candidate_id, provider, model, tier, runtime, label,
  rows_total, rows_ok, success_rate,
  mean_cost_usd, mean_latency_ms, p50_latency_ms, p95_latency_ms, total_cost_usd,
  agentic: {
    schema_compliance, task_completion, recovery_rate,
    fabrication_rate, judge_overall_mean, judge_overall_std,
    mean_turns, mean_tool_calls, cost_per_task_usd,
  },
  rows: RunRow[],   // per-dataset-row detail
}
```

### Per row — `RunRow.stage2` (agentic only)
```ts
{
  profile: ProspectProfile | null,      // extractProfile() from schema.ts
  email:   EmailDraft      | null,      // extractEmailDraft() from schema.ts
  grounding: GroundingResult | null,    // from graders/grounding_faithfulness.ts
  judge: { runs: JudgeRun[3], overall_mean, overall_std } | null,
}
```

### Scope-level — `agentic_aggregate`
```ts
{
  mean_task_completion, mean_judge_overall,
  highest_variance_candidate,
  same_model_pairs: [{ model, runtimes: { vercel, cagent_sdk } }, ...],
}
```

### Integration steps

1. **Write an emitter** in `scripts/run-comparison.ts` that serializes the above on each run into `examples/<scope>/runs/comparison_*.json`. The structural fields (rows_total, mean_cost_usd, traces, etc.) already exist; Phase D/E adds the `agentic` + `stage2` + `agentic_aggregate` surfaces.
2. **Port `build-data.ts`** (currently `viewer-v3/build-data.ts`) to read those JSONs and emit `data.js`. Detection for `kind: "agentic"`: the scope has a `judge-rubric.md` + Stage 2 config + the grounding grader is configured.
3. **Delete `agentic-enrich.js`** — it's a deterministic seeded synthesizer for the agentic fields. Remove its script tag from `index.html`. Grep the codebase for `__AGENTIC_ENRICH_VERSION` to verify no lingering refs.
4. **Keep `workflow-diagram.js`** — it's scope-specific and hand-drawn. The Workflow type in `types.d.ts` is what the auto-layout fallback consumes; the bespoke figure takes precedence when registered.

---

## Workflow diagram — design rationale

`workflow-diagram.js` is a hand-composed, scope-specific SVG for the `yc-qualifier` pipeline. The goals:

- Show the *actual* pipeline, not a generic 5-box flowchart: real tool names (`github_lookup`, `linkedin_enrich`, `web_fetch`) with the 502-fallback arrow, both Zod schemas inlined, the 5 claim types the grounding grader extracts, the 3 judge passes × 4 rubric dimensions.
- Editorial aesthetic — numbered stations, document-card artifacts with folded-corner glyphs, hairline rules, figure caption. Matches the v3 "almanac" voice.
- **Don't generalize this.** When new agentic scopes land, draw them bespoke. A generic auto-laid-out flowchart reads as AI slop; a considered figure reads as a product. Keep the old generalized renderer (`renderWorkflow` in `stage2-drilldown.js`) as a last-resort fallback.

---

## Routing & state keys

All localStorage keys live under `cmbv3_*`:

| Key                       | Meaning                                             |
|---------------------------|-----------------------------------------------------|
| `cmbv3_route`             | last-visited top-level route                        |
| `cmbv3_theme` / `_density` / `_accent` | tweaks                                 |
| `cmbv3_suite`             | selected scope id (e.g. "yc-qualifier")             |
| `cmbv3_persona`           | frontier chart persona (speed/cost/balanced/quality) |
| `cmbv3_td_row`            | selected dataset row on trace-diff                  |
| `cmbv3_td_cols`           | number of candidate columns (2/3/4)                 |
| `cmbv3_td_cols_map`       | JSON: column index → candidate_id overrides         |
| `cmbv3_td_model`          | primary model chip on trace-diff                    |
| `cmbv3_td_s2tab`          | Stage 2 drilldown tab: `email` / `grounding` / `judge` |

---

## Screenshot tour

Generated against the synthetic-data build. Paths are relative to `viewer-v3/`.

| Screen                                      | File                        |
|--------------------------------------------|-----------------------------|
| Leaderboard · flagship (cross-provider)     | `screens/01-leaderboard-flagship.png` |
| Leaderboard · agentic (w/ same-model vs)    | `screens/02-leaderboard-agentic.png`  |
| Trace diff + workflow diagram               | `screens/03-trace-workflow.png`       |
| Stage 2 drilldown · email / grounding / judge | `screens/04-stage2-tabs.png`        |

---

## What's not done (Claude Code's job)

1. Wire the real backend emitter to the `AgenticRun` + `Stage2` shapes.
2. Delete `agentic-enrich.js`.
3. Update `scripts/judge.ts` to return three full runs (currently returns one; Phase E needs `JudgeRun[3]`).
4. Update `scripts/run-comparison.ts` to compute `agentic_aggregate.same_model_pairs` at aggregation time.
5. Move `viewer-v3/` into the repo as the new `viewer/` root; retire `viewer-v2/`.
6. One smoke-test run of each shipped scope to confirm the viewer renders cleanly against real output.

---

## Caveats for migration

- **Grounding grader cost:** Phase E adds a per-row Sonnet 4.6 extractor call (claim extraction). Budget ~$0.01-0.03 per row on top of the existing candidate cost. The viewer shows `extraction_cost_usd` per row but doesn't surface it at the aggregate level yet — consider adding to the leaderboard tooltip.
- **Judge variance as signal:** the leaderboard shows `judge_overall_mean`; the trace-diff Stage 2 tab shows `±σ`. High variance (σ > 0.5) usually means the rubric is ambiguous on that row; worth flagging in docs once real data reveals the distribution.
- **Dead-end rows:** rubric explicitly allows skipping (empty EmailDraft). Grounding grader returns neutral 0 for empty bodies. Viewer honors both. Don't let backend "fix" this by forcing a draft.
