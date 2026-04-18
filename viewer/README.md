# Viewer

A standalone static web UI that visualizes the benchmark runs produced by this repo. Editorial paper aesthetic with a dark-mode toggle; four screens (Compare, Run detail, Drill-down, Spec); scope switcher that pivots between the cross-provider flagship showdown and each provider's intra-tier comparison.

## Run it

From the repo root:

```bash
bun viewer        # builds data.js from the latest comparison_*.json in each scope, then serves on :4040
```

Then open http://localhost:4040.

Or in two steps:

```bash
bun viewer:build  # regenerates viewer/data.js from the five scopes' latest runs
bun viewer:serve  # serves viewer/ on :4040
```

Set `PORT=<n>` to pick a different port.

## How the data gets in

`viewer/build-data.ts` walks the five example directories (`demo`, `anthropic-tiers`, `openai-tiers`, `google-tiers`, `xai-tiers`), picks the most recent `comparison_*.json` from each, and writes everything into `viewer/data.js` as `window.__BENCH = { scopes: [...] }`. The HTML then loads it via a plain `<script>` tag — no fetch, no server-side rendering, no build tooling.

After every fresh `bun bench:compare` / `bun bench:tiers:*`, re-run `bun viewer:build` to pick up the new results.

## Files

```
viewer/
├── index.html        shell (nav, tabs, tweaks panel)
├── styles.css        full editorial design system (light + dark)
├── charts.js         SVG chart primitives (box / strip / histogram / line / sparkline)
├── screens.js        Compare / Detail / Drill / Spec renderers
├── app.js            hash routing, tweaks persistence
├── data.js           generated — do not edit by hand
├── build-data.ts     the generator
└── serve.ts          minimal Bun static server
```

## Design credits

The visual language (paper palette, serif display, tagged-box diagrams, four-screen structure) originated from a design handoff via claude.ai/design. This implementation wires it to the real `custom-model-bench` JSON schema and extends it with a five-scope switcher so the intra-provider tier comparisons reuse the same components.
