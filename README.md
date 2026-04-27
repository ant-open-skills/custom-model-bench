# custom-model-bench

A blueprint for benchmarking your own AI workflows — not another leaderboard. Plug in your task, your data, and your candidates; let the kit measure what actually matters for the feature you're building.

```
claude plugin marketplace add ant-open-skills/custom-model-bench
claude plugin install custom-model-bench@ant-open-skills
```

Then ask run to `/bench-view` to get started with an example or run `/bench-setup` to build your own. 

Want the full methodology behind the kit? [Read the blog post on krackedtools.dev →](https://www.krackedtools.dev)

## What it does

- **Cross-provider candidate runtime.** Vercel AI SDK adapters for Anthropic, OpenAI, Google, xAI — same pipeline, swap a config field.
- **Claude Agent SDK runtime variant.** Same task, second runtime — measure what the SDK buys you (or costs you) on identical inputs.
- **Tool-calling support.** Both runtimes capture per-step traces of every tool call and result.
- **Code-graded metrics out of the box.** Schema compliance, task completion, recovery rate, efficiency, ground-truth match, cost per successful task.
- **Rubric-graded metrics for agentic workflows.** 3-run Opus 4.7 judge with variance reporting across grounding / specificity / relevance / call-to-action.
- **Grounding faithfulness grader.** Two-stage claim extraction + deterministic match — catches when your agent makes things up.
- **Editorial web viewer** with four screens:
  - **Frontier** — scatter plot with persona-weighted fit scoring and swappable X/Y axes (cost · p50 · p95 · reliability · quality · recovery · task completion). "Which model should I ship?"
  - **Trace diff** — stacked candidate columns for a single row, tool calls inlined; agentic scopes add a workflow figure and a Stage 2 email / grounding / judge drilldown.
  - **Behavior** — per-candidate turns, tokens, tool mix. Surfaces the same-model / different-orchestration gap (e.g. Sonnet 4.6 on Vercel AI SDK vs. Claude Agent SDK).
  - **Leaderboard** — sortable table; on agentic scopes, columns swap to Fit · Task ✓ · Recovery · Fab. · Judge · p50 · $/task with a same-model-vs delta card.

## Quick start — inside Claude Code

After the two-command install above, the kit is fully driven from inside Claude Code. Three slash commands cover the lifecycle:

| Command | When to reach for it |
|---|---|
| `/bench-view` | **Start here.** Opens the viewer on the shipped results so you see what the platform looks like before running anything. |
| `/bench-run [scope]` | Run a comparison on the named scope (or it'll ask which). Pick `yc-qualifier:mock` for a free deterministic preview, `yc-qualifier` for the real-APIs flagship (~$30). |
| `/bench-setup` | Interactive intake to scaffold a new benchmark from your own task. |

The skill also activates on intent — say "benchmark my prompt" or "compare these models" and you'll be routed through the same flows. Picking **Demo first** in `/bench-setup` skips scaffolding and opens the viewer directly.

## The shipped scopes

- **`speed-bench`** — single-turn prompts across 12 candidates. Latency vs cost vs accuracy on simple tasks.
- **`reasoning-bench`** — hard science/math problems graded for exact-match correctness.
- **`tool-bench`** — multi-tool-use tasks with mocked tool handlers (deterministic, reproducible).
- **`yc-qualifier`** — the agentic flagship. Stage 1 prospect research → Stage 2 email drafter → grounding-faithfulness grader → 3-run Opus 4.7 rubric judge.

## Standalone CLI (without Claude Code)

If you'd rather drive the kit directly from a terminal — for CI runs, scripted comparisons, or hacking on the internals — clone the repo and use the bun scripts:

```bash
# Install dependencies
bun install

# See what the platform looks like first — open the viewer on the shipped results
bun viewer                           # Builds data + serves at http://localhost:4040

# Ready to run your own? Copy .env.example and fill in API keys
# (only providers you benchmark need keys)
cp .env.example .env
$EDITOR .env

# Run an existing benchmark with your keys
bun bench:tools                      # Tool bench across 12 candidates (mocked tools, cheap)
bun bench:reasoning                  # Reasoning bench across 4 flagships
bun bench:yc-qualifier:mock          # Prospect qualifier with mocked tools
bun bench:yc-qualifier               # Prospect qualifier with real APIs (~$30)

# Re-run the viewer to see your new numbers alongside the shipped ones
bun viewer
```

Same datasets, same graders, same comparison JSONs as the slash-command path — just driven from the shell instead of the Claude Code chat.

## Build your own scope

`/bench-setup` asks, via the arrow-nav / space-to-toggle picker (Q2 + Q4 are multi-select, Q3 is single-select):

1. *What are you building?* — free text, 1-3 sentences.
2. *What do you care about?* — Speed · Cost · Reliability · Balanced (pick any combination).
3. *What do you already have?* — A dataset · A system prompt · Nothing yet · Demo first.
4. *Which providers do you want to compare?* — Anthropic · OpenAI · Google · xAI.

If you pick **Nothing yet** or **A system prompt**, the skill kicks off a brainstorming sub-flow — 3-5 follow-ups tailored to your task — and generates a synthetic starter dataset. **Demo first** skips scaffolding and opens the viewer on the shipped scopes so you can see the kit working before committing your own task.

The output is a directory at `examples/<your-scope>/` with dataset + candidate configs + system prompt wired and ready to run.

## Repo layout

```
custom-model-bench/
  ├── .claude-plugin/         marketplace + plugin metadata
  ├── commands/               slash command definitions (bench-run, bench-view, bench-setup)
  ├── skills/custom-model-bench/
  │     ├── SKILL.md          the skill that activates on benchmark intent
  │     ├── examples/<scope>/ each scope owns its dataset + configs + runs
  │     └── scripts/          run-comparison.ts, judge.ts, graders/, adapters/
  ├── viewer/                 static HTML + JS viewer; reads data.js
  ├── docs/specs/             design docs and handoff notes
  └── blog/                   release content
```

## Design principles

- **Blueprint, not leaderboard.** Let your own data tell you which model wins for your use case.
- **Honest measurement over favourable framing.** When the data says Opus is 3.6× the cost on the same task, the kit reports it. We don't engineer the metric to flatter the conclusion.
- **Cross-provider by default.** Anthropic, OpenAI, Google, xAI all run through the same pipeline.
- **Reproducible.** `MOCK_TOOLS=1` swaps every external tool call to a deterministic fixture. Every run is replayable.

## License

MIT.
