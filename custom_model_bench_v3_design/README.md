# viewer-v2 — "The Bench"

A richer web UI for the benchmark comparisons, built from the `bench-design-v2` Claude Design handoff. Lives alongside `viewer/` (v1) — the two viewers share the same data source and both get rebuilt independently.

## Run it

From the repo root:

```bash
bun viewer-v2        # builds data.js + serves on :4041
```

Open http://localhost:4041. (v1 still runs on :4040 via `bun viewer`.)

Or in two steps:

```bash
bun viewer-v2:build
bun viewer-v2:serve
```

Set `PORT=<n>` on `viewer-v2:serve` to pick a different port.

## What's in it

- **Leaderboard** — sortable table with fit-score bar, provider-colored dots, tier badges (frontier / balanced / fast), four summary cards (Top Fit / Best p95 / Cheapest Viable / Fastest p50), use-case pills that re-weight the fit score, provider + tier chip filters.
- **Evals** — per-prompt drill-down. Pick a row, see all candidates' responses side-by-side with their per-turn metrics.
- **Prompts** — flat dataset browser; click a prompt to jump to its drill-down.
- **Runs** — history trends (empty-state today; populates once a scope accumulates multiple comparisons).
- **Design-doc drawer** (top-right) — rationale, fit-score formula, component inventory, what was deliberately cut from the design.
- **Tweaks drawer** — theme (light/dark), density (compact / default / comfy), accent (six swatches).

All UI state (selected suite, use case, sort, filters, theme, density, accent) persists via localStorage.

## How the data gets here

`viewer-v2/build-data.ts` walks the five example directories under `skills/custom-model-bench/examples/*/runs/`, picks the most recent `comparison_*.json` from each, and writes `viewer-v2/data.js` as `window.__BENCH = { scopes: [...] }`. Exactly the same pattern as `viewer/build-data.ts` — both viewers are driven by the same real JSON files.

## Files

```
viewer-v2/
├── index.html       shell (top nav, tweaks drawer, design-doc drawer, script imports)
├── styles.css       full design system (ported verbatim from bench-design-v2)
├── data.js          auto-generated — don't edit by hand
├── fit.js           0-100 composite score, four use-case weight profiles
├── components.js    UI primitives + provider / model / tier mappings
├── screens.js       Leaderboard / Evals / Prompts / Runs renderers
├── app.js           routing + persistence + drawers
├── build-data.ts    the data generator
├── serve.ts         minimal Bun static server
├── MIGRATION.md     design field → real schema mapping
└── README.md        this file
```

## Design credits

Visual language and prototype code from the `bench-design-v2` Claude Design handoff. This implementation ports it from React-JSX prototype to plain HTML+JS globals (same pattern as v1), wires it to the real JSON schema, and replaces every fabricated field with either real data or a documented drop. See `MIGRATION.md` for the per-field breakdown.
