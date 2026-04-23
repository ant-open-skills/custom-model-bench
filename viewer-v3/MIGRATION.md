# Design → schema migration

How the bench-design-v2 prototype's data model maps onto the real `comparison_*.json` schema. Fields the design expects that don't exist in our data are either derived on the fly or dropped with a note.

## Top-level suite catalog

| Design field (`data.jsx`) | Our source | Notes |
|---|---|---|
| `SUITE_CATALOG[id].label` | `window.__BENCH.scopes[].label` | 1:1 |
| `SUITE_CATALOG[id].category` | derived from `scope.kind` | `flagship` → "Cross-provider"; `intra` → "Provider tiers". "Agentic workflows" bucket reserved for Phase C+ scopes. |
| `SUITE_CATALOG[id].desc` | derived per scope | hand-authored short blurb, kept client-side |
| `SUITE_CATALOG[id].models` | `scope.comparison.runs[].model` | 1:1 |
| `COMPARISONS[id]` | `scope.comparison` | 1:1 — identical schema |
| `HISTORY[id]` | **dropped** | We only have one comparison per scope in v1. Runs screen renders a "not enough runs yet" empty state (as v1's Drill did). |

## Per-candidate run

| Design field | Our source | Notes |
|---|---|---|
| `run.config_file` | `run.config_file` | 1:1 |
| `run.provider` | `run.provider` | 1:1 |
| `run.model` | `run.model` | 1:1 |
| `run.systemPrompt` | `run.systemPrompt` | may be undefined |
| `run.temperature` | `run.temperature` | may be undefined |
| `run.maxOutputTokens` | `run.maxOutputTokens` | may be undefined |
| `run.results[]` | `run.results[]` | 1:1 |
| `run.aggregate` | `run.aggregate` | 1:1 |

## Per-result row

All fields 1:1 from our schema: `id · prompt · response · turns · latency_ms · input_tokens · output_tokens · cost_usd · error`.

Design uses `ref` (prompt category tag) for its canned-response lookup table — this was mock-only, **dropped** entirely (we show real responses from our runs).

## Leaderboard

| Design | Our source |
|---|---|
| `leaderboard.latency_p50_ms[]` | same |
| `leaderboard.latency_p95_ms[]` | same |
| `leaderboard.cost_per_1k_evals_usd[]` | same |
| `leaderboard.success_rate[]` | same |

## UI overlays (not in JSON — client-side mappings)

Kept as-is from `data.jsx` since these are purely presentational:

- `PROVIDER_COLORS` — `#d97757 / #10a37f / #4285f4 / #64748b`
- `PROVIDER_LABEL` — "Anthropic / OpenAI / Google / xAI"
- `MODEL_TIER` — hand-curated mapping from model ID to `"frontier" | "balanced" | "fast"`. Extended for models we actually run:
  - `claude-opus-4-7` → frontier · `claude-sonnet-4-6` → balanced · `claude-haiku-4-5` → fast
  - `gpt-5.4` → frontier · `gpt-5.4-mini` → balanced · `gpt-5.4-nano` → fast
  - `gemini-3.1-pro-preview` → frontier · `gemini-3-flash-preview` → balanced · `gemini-3.1-flash-lite-preview` → fast
  - `grok-4` → frontier · `grok-4.20-0309-reasoning` → frontier · `grok-4.20-0309-non-reasoning` → balanced · `grok-4-1-fast-non-reasoning` → fast
  - unknown → `balanced`
- `MODEL_DISPLAY` — short friendly name mapping; unknown models fall back to the raw model ID.

## Fit score

Ported 1:1 from `fit.jsx`. Normalization constants (latency/cost knees) unchanged. The four use-case weight profiles (balanced / speed / cost / reliability) are identical. `quality` stays reserved at weight 0 (populated after rubric grading ships in Phase E).

## Dropped from the design (mock-only)

- **Coding / reasoning / tool-use dimension scores** (`data.jsx` PROFILES.outMult shape) — never expressed as per-dimension scores in our schema; design's radar-chart axes dropped. Leaderboard "Best on coding" summary-card reuses p95-proxy per the design itself (`bestCoding = sort by p95 ascending`). Kept as **"Best on p95"** so the label doesn't lie.
- **Recent runs feed** — no historical store, Runs screen shows empty-state + current baseline.
- **Compare tray / radar overlay** — radar needs per-dimension scores we don't have; dropped for v1.
- **`ref` prompt category tag** — mock-only; real prompts are shown verbatim.
- **`dataset_path` full filesystem prefix** — display as basename only.

## Screens shipped

- **Leaderboard** — full (sortable table, use-case pills, 4 summary cards, provider/tier filters)
- **Evals / drilldown** — full (prompt picker, candidate stack with real responses + metric footer)
- **Prompts** — dataset browser, simple list
- **Runs** — empty state + current-baseline grid (mirrors v1)
- **Design-doc drawer** — full text-only panel
- **Tweaks panel** — density, accent, theme, layout-variant

## Future additions (tracked in the plan, not in v1)

- Radar chart once per-dimension rubric scores exist (Phase E adds grounding + rubric).
- Runs time-series once multiple comparisons per scope exist.
- Agentic-workflows suites category once tool-use evals land (Phase B+).
