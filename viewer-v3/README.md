# viewer-v3 — "The Bench" (Phase D/E)

Design prototype for the v3 viewer surface of `custom-model-bench`. Built on top of the v2 handoff and extended with agentic-pipeline support (Phase D) and Stage 2 rubric/grounding drilldown (Phase E). Self-contained preview at project root: `The Bench v3.html`.

**Before shipping to the real repo, read `HANDOFF.md` — it lists exactly what Claude Code needs to do to migrate this into `ant-open-skills/custom-model-bench`.** The data contract lives in `types.d.ts`.

## Four screens

- **Frontier** — scatter plot of candidates along cost × latency × reliability. Persona dialer re-weights on the fly. Answer to "which model should I ship?"
- **Trace diff** — stacked candidate columns for a single dataset row, tool calls inlined. For agentic scopes, appends the workflow figure + Stage 2 drilldown (email / grounding / judge tabs).
- **Behavior** — per-candidate turns, tokens, tool mix. Surfaces Sonnet 4.6 cagent-sdk vs vercel verbosity gap.
- **Leaderboard** — sortable table. On agentic scopes, columns swap to Fit · Task ✓ · Recovery · Fab. rate · Judge · p50 · $ / task, and same-model-different-runtime rows get a delta card between them.

All UI state (selected scope, persona, theme, density, accent, trace-diff row + columns, Stage 2 tab) persists via localStorage under `cmbv3_*`.

## Synthetic data caveat

`agentic-enrich.js` is a client-side deterministic synthesizer that promotes the `yc-qualifier` scope to `kind: "agentic"` and fills every Phase D/E field (Stage 2 emails, grounding claims, judge runs, agentic aggregates) with seeded sample data. **It is not real output.** It exists only so the UI surface is exercisable in this prototype. When Claude Code wires the real backend emitter per `types.d.ts`, delete this file and its script tag in `index.html`.

## Run it

This folder is a standalone viewer. After the migration:

```bash
bun viewer-v3        # builds data.js + serves on :4042
```

Today, preview via the self-contained bundle at project root: open `The Bench v3.html`.

## Files

```
viewer-v2/
├── index.html       shell (top nav, tweaks drawer, design-doc drawer, script imports)
├── styles.css       full design system (ported verbatim from bench-design-v2)
├── data.js          auto-generated — don't edit by hand
├── fit.js           0-100 composite score, four use-case weight profiles
├── components.js    UI primitives + provider / model / tier mappings
├── frontier.js      screen — scatter + persona dialer
├── trace-diff.js    screen — candidate columns + inlined traces
├── behavior.js      screen — per-candidate turns / tokens / tool mix
├── leaderboard-v3.js screen — agentic columns + same-model vs card
├── stage2-drilldown.js  trace-diff addon — workflow + Stage 2 lens
├── workflow-diagram.js  hand-composed SVG figure for yc-qualifier
├── agentic-enrich.js    ⚠️ synthetic data layer (delete on real-backend handoff)
├── app-v3.js        routing + persistence + drawers
├── types.d.ts       🟢 backend data contract — see HANDOFF.md
├── HANDOFF.md       migration notes for Claude Code
└── build-data.ts    the data generator
├── serve.ts         minimal Bun static server
├── MIGRATION.md     design field → real schema mapping
└── README.md        this file
```

## Design credits

Visual language and prototype code from the `bench-design-v2` Claude Design handoff. This implementation ports it from React-JSX prototype to plain HTML+JS globals (same pattern as v1), wires it to the real JSON schema, and replaces every fabricated field with either real data or a documented drop. See `MIGRATION.md` for the per-field breakdown.
