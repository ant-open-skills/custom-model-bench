# viewer — "The Bench"

Static HTML/JS viewer for `custom-model-bench`. Reads `data.js` (generated from `examples/<scope>/runs/comparison_*.json`) and renders four screens against the latest comparison per scope.

## Four screens

- **Frontier** — scatter plot of candidates with persona-weighted fit scoring; user-swappable X/Y axes across `cost / p50 / p95 / reliability / quality / recovery / task completion`. Answers "which model should I ship?"
- **Trace diff** — stacked candidate columns for a single dataset row, tool calls inlined. On agentic scopes, appends the workflow figure + Stage 2 drilldown (email / grounding / judge tabs).
- **Behavior** — per-candidate turns, tokens, tool mix. Surfaces the same-model / different-orchestration gap (Sonnet 4.6 on Vercel AI SDK vs. Claude Agent SDK).
- **Leaderboard** — sortable table. On agentic scopes, columns swap to Fit · Task ✓ · Recovery · Fab. rate · Judge · p50 · $/task; same-model-different-runtime rows get a delta card between them.

All UI state (selected scope, persona, axes, theme, density, accent, trace-diff row + columns, Stage 2 tab) persists via `localStorage` under `cmbv3_*` keys.

## Run it

```bash
bun viewer        # builds data.js + serves on http://localhost:4040
# or the pieces separately:
bun viewer:build  # scans examples/<scope>/runs/ → writes viewer/data.js
bun viewer:serve  # starts the static server
```

## Files

```
viewer/
├── index.html              shell (top nav, tweaks drawer, design-doc drawer)
├── styles.css              base design tokens
├── styles-v3.css           typographic system (Newsreader · Inter Tight · JetBrains Mono)
├── styles-phase-de.css     agentic-leaderboard + Stage-2-drilldown additions
├── data.js                 auto-generated — don't edit by hand
├── build-data.ts           scans runs/ and writes data.js
├── serve.ts                minimal Bun static server (PORT env overrides :4040)
├── fit.js                  0-100 composite score; persona weight profiles
├── components.js           UI primitives (provider chips, model labels, tier icons)
├── frontier.js             screen — scatter + persona + axis pickers
├── trace-diff.js           screen — candidate columns + inlined traces
├── behavior.js             screen — per-candidate turns / tokens / tool mix
├── leaderboard-v3.js       screen — agentic columns + same-model vs card
├── stage2-drilldown.js     trace-diff addon — workflow + Stage 2 lens
├── workflow-diagram.js     hand-composed SVG pipeline figure for yc-qualifier
├── agentic-enrich.js       fallback synthesizer — no-ops when real data is present
├── app-v3.js               routing + persistence + drawers
├── types.d.ts              backend data contract
├── MIGRATION.md            design field → real schema mapping
└── screens/                screenshot tour (flagship / agentic / trace / stage2)
```

### On `agentic-enrich.js`

The enrich layer short-circuits when the run aggregate already carries real Phase E data (`aggregate.stage2.judge.overall_mean` present). It exists only as a fallback for scopes that declare `kind: "agentic"` without emitting those fields yet. For every scope currently shipping in the repo, the real comparison JSON is authoritative.

## Design credits

Visual language ported from the `bench-design-v2` Claude Design handoff. The migration write-up lives in `docs/specs/2026-04-22-viewer-v3-handoff.md`.
