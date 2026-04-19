# custom-model-bench

A blueprint for benchmarking your own AI workflows — not another leaderboard. Plug in your task, your data, and your candidates; let the kit measure what actually matters for the feature you're building.

```
claude plugin marketplace add ant-open-skills/custom-model-bench
claude plugin install custom-model-bench@ant-open-skills
```

Then ask Claude to "benchmark my prompt" or invoke `/bench-setup` directly.

## What it does

- **Cross-provider candidate runtime.** Vercel AI SDK adapters for Anthropic, OpenAI, Google, xAI — same pipeline, swap a config field.
- **Claude Agent SDK runtime variant.** Same task, second runtime — measure what the SDK buys you (or costs you) on identical inputs.
- **Tool-calling support.** Both runtimes capture per-step traces of every tool call and result.
- **Code-graded metrics out of the box.** Schema compliance, task completion, recovery rate, efficiency, ground-truth match, cost per successful task.
- **Rubric-graded metrics for agentic workflows.** 3-run Opus 4.7 judge with variance reporting across grounding / specificity / relevance / call-to-action.
- **Grounding faithfulness grader.** Two-stage claim extraction + deterministic match — catches when your agent makes things up.
- **Static viewer.** Editorial-aesthetic web UI with a leaderboard, eval drilldowns with trace visualization, dataset browser, and time-series.

## Quick start

```bash
# Install dependencies
bun install

# Copy and fill in API keys (only providers you benchmark need keys)
cp .env.example .env
$EDITOR .env

# Run an existing benchmark
bun bench:tools                      # Tool bench across 12 candidates (mocked tools, cheap)
bun bench:reasoning                  # Reasoning bench across 4 flagships
bun bench:yc-qualifier:mock          # Prospect qualifier with mocked tools
bun bench:yc-qualifier               # Prospect qualifier with real APIs (~$5–80)

# View results
bun viewer-v2                        # Builds data + serves at http://localhost:4041
```

## The shipped scopes

- **`speed-bench`** — single-turn prompts across 12 candidates. Latency vs cost vs accuracy on simple tasks.
- **`reasoning-bench`** — hard science/math problems graded for exact-match correctness.
- **`tool-bench`** — multi-tool-use tasks with mocked tool handlers (deterministic, reproducible).
- **`yc-qualifier`** — the agentic flagship. Stage 1 prospect research → Stage 2 email drafter → grounding-faithfulness grader → 3-run Opus 4.7 rubric judge.

## Slash commands

Three primitives. Discoverable in the `/` menu.

| Command | Effect |
|---|---|
| `/bench-run [scope]` | Runs a comparison on the named scope. |
| `/bench-view` | Builds + serves the viewer. |
| `/bench-setup` | Three-question intake to scaffold a new benchmark from your own task. |

The skill activates on intent — say "benchmark my prompt" or "compare these models" and it'll route you through the same flows.

## Build your own scope

`/bench-setup` asks three questions:

1. *What are you building?*
2. *What do you care about?* (speed / cost / reliability / balanced)
3. *What do you already have?* (a dataset / a prompt / nothing yet)

Plus a provider picker (Anthropic / OpenAI / Google / xAI). If you don't have a dataset, the skill kicks off a brainstorming-style sub-flow — 3-5 follow-ups about your task — and generates a synthetic one tailored to your domain.

The output is a directory at `examples/<your-scope>/` with everything wired and ready to run.

## Repo layout

```
custom-model-bench/
  ├── .claude-plugin/         marketplace + plugin metadata
  ├── commands/               slash command definitions
  ├── skills/custom-model-bench/
  │     ├── SKILL.md          the skill that activates on benchmark intent
  │     ├── examples/<scope>/ each scope owns its dataset + configs + runs
  │     └── scripts/          run-comparison.ts, judge.ts, graders/, adapters/
  ├── viewer-v2/              static HTML + JS viewer; reads data.js
  ├── docs/specs/             design docs
  └── blog/                   release content
```

## Design principles

- **Blueprint, not leaderboard.** Let your own data tell you which model wins for your use case.
- **Honest measurement over favourable framing.** When the data says Opus is 3.6× the cost on the same task, the kit reports it. We don't engineer the metric to flatter the conclusion.
- **Cross-provider by default.** Anthropic, OpenAI, Google, xAI all run through the same pipeline.
- **Reproducible.** `MOCK_TOOLS=1` swaps every external tool call to a deterministic fixture. Every run is replayable.

## License

MIT.
