---
name: custom-model-bench
description: Help the user benchmark a custom Claude agent or prompted workflow against datasets and rubrics — especially for agentic tool-use tasks where tool-call traces are part of the signal. Activate when the user wants to evaluate, score, or compare model/prompt/agent quality, or mentions "benchmark", "compare models", "test prompts", or "evaluate".
---

# custom-model-bench

A blueprint for benchmarking your own AI workflows — not a leaderboard. The kit lives at `examples/<scope>/` (datasets + candidate configs) and writes results to `examples/<scope>/runs/comparison_*.json`. A static viewer reads those JSONs and renders the four-screen UI: Leaderboard · Evals · Prompts · Runs.

## What to do when activated

When the user asks you to benchmark, evaluate, compare, or score model/agent behavior, **first orient them with a three-option menu** based on what already exists in the project:

```
1 — RUN AN EXISTING BENCHMARK   (60 seconds, see real numbers)
2 — BUILD MY OWN                (3-question intake → scaffold a scope)
3 — JUST OPEN THE VIEWER        (use cached data, no API calls)
```

Detect the right state to present:

- **No `examples/<scope>/` dirs yet** → present all three; default suggestion is (1) so they see value first.
- **At least one scope exists** → present "Existing scopes: …" and ask whether they want to (1) run one, (2) build a new one, or (3) view results.
- **A scope was run in the last 24h** → offer "Last run: <scope> · <time> · open viewer? rerun?".

## Slash commands available

Three primitives. Use these to fulfill what the user picked from the menu.

| Command | Effect |
|---|---|
| `/custom-model-bench:bench-run [scope]` | Runs the comparison runner on the named scope. No arg → ask which. |
| `/custom-model-bench:bench-view` | Builds + serves the static viewer; prints the URL. |
| `/custom-model-bench:bench-setup` | Three-question intake to build a new scope. |

The user can invoke these directly. You can also invoke them on their behalf when their intent is clear.

## The shipped scopes (use these for the "1 — RUN AN EXISTING" path)

- **`speed-bench`** — short single-turn prompts across 12 candidates. Frontier vs balanced vs fast comparison on simple tasks.
- **`reasoning-bench`** — hard science/math problems graded for exact-match correctness.
- **`tool-bench`** — multi-tool-use tasks with mocked tool handlers (deterministic, cheap to re-run).
- **`yc-qualifier`** (the agentic flagship) — Stage 1 prospect research → Stage 2 email drafter → grounding-faithfulness grader → 3-run Opus 4.7 rubric judge. The full pipeline.

## When the user picks "BUILD MY OWN" (`/custom-model-bench:bench-setup`)

The setup flow asks **four locked questions** — these are the entry contract.

**CRITICAL — how to ask Q2, Q3, and Q4:** You MUST call the `AskUserQuestion` tool for each of these. Do NOT write the options as a text message, bullet list, or numbered list. Do NOT paraphrase the options into prose. The interactive picker (arrow-nav + space-to-toggle + automatic "Other" field) is the whole point of the flow; rendering bullets defeats it. Q1 is the only free-text question.

1. *What are you building?* (1-3 sentences — free text, derive the scope name from the answer)
2. *What do you care about?* → `AskUserQuestion`, `multiSelect: true`, options: Speed / Cost / Reliability / Balanced
3. *What do you already have?* → `AskUserQuestion`, `multiSelect: false`, options: A dataset / A system prompt / Nothing yet / Demo first
4. *Which providers do you want to compare?* → `AskUserQuestion`, `multiSelect: true`, options: Anthropic / OpenAI / Google / xAI (default Anthropic only)

The full option descriptions, parameters, and branching logic live in `commands/bench-setup.md`. Consult it for the exact `AskUserQuestion` call shape before asking each question.

Branch on Q3:

- **A dataset** → prompt for file path or pasted JSONL, validate (`id` + `prompt` required per row), scaffold the scope, run.
- **A system prompt** → prompt for pasted prompt text, kick the dataset-synth sub-flow seeded with their prompt.
- **Nothing yet** → kick the dataset-synth sub-flow seeded with Q1 + Q2.
- **Demo first** → do not ask the user to run more commands. Immediately invoke `/custom-model-bench:bench-view` on their behalf (builds + serves the static viewer over shipped comparison JSONs — no API calls, instant). Say one line before invoking ("Opening the viewer on the shipped benchmarks — come back to `/bench-setup` when you're ready to wire up your own") and then call it. Exit setup.

The dataset-synth sub-flow is brainstorming-style — 3-5 follow-up questions tailored to Q1, then one Sonnet 4.6 call generates ~10-15 synthetic test rows. The user reviews and can regenerate.

## After every run completes — the "what next?" loop

Don't disappear after a run finishes. Stay warm and offer one contextual next step based on what just happened:

- Just previewed an existing scope → *"Want to set up your own?"*
- Just built + ran their own → *"Want to add another model? Tweak the system prompt and re-run? Add edge cases?"*
- Just iterated → *"Want to share the leaderboard?"*

Edits like "add Gemini Pro to my qualifier scope" or "swap the system prompt" are handled in conversation — you do the file edits, then offer to re-run via `/custom-model-bench:bench-run`. No separate slash commands for those.

## Project layout — where things live

```
custom-model-bench/
  ├── .claude-plugin/         marketplace + plugin metadata
  ├── commands/               slash command definitions (bench-run, bench-view, bench-setup)
  ├── skills/custom-model-bench/
  │     ├── SKILL.md          this file
  │     ├── examples/<scope>/ each scope owns its dataset + configs + runs
  │     │     ├── dataset.jsonl
  │     │     ├── system-prompt.md
  │     │     ├── config-*.ts
  │     │     └── runs/comparison_*.json
  │     └── scripts/          run-comparison.ts, judge.ts, graders/, adapters/
  ├── viewer-v2/              static HTML + JS viewer; reads data.js
  ├── docs/specs/             design docs
  └── blog/                   release content
```

## Style for your interactions

- **Show value first.** The "RUN AN EXISTING BENCHMARK" path produces real numbers in a real viewer in under a minute. Use that as the welcome experience for new users.
- **Friction-with-attraction in setup.** When the user moves to `/custom-model-bench:bench-setup`, the three questions are deliberately substantive. Don't shortcut them with templates — the questions themselves signal that the kit is taking the user's task seriously.
- **Honesty over flattery.** When a comparison shows that Opus is more expensive *and* not winning, say that. The blueprint promise is "let your own data tell you which model wins" — it only works if the kit reports honestly.
- **Cite the data, not your opinion.** When the user asks "which model is best?", point them at the run JSON or the viewer. The kit measures; the user decides.
