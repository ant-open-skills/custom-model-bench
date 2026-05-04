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
2 — BUILD MY OWN                (4-question intake → scaffold a scope)
3 — JUST OPEN THE VIEWER        (use cached data, no API calls)
```

Detect the right state to present:

- **No `examples/<scope>/` dirs yet** → present all three; default suggestion is (1) so they see value first.
- **At least one scope exists** → present "Existing scopes: …" and ask whether they want to (1) run one, (2) build a new one, or (3) view results.
- **A scope was run in the last 24h** → offer "Last run: <scope> · <time> · open viewer? rerun?".

## Methodology reference

When the user moves into `/custom-model-bench:bench-setup` and especially when they paste a GitHub repo URL, consult `skills/custom-model-bench/methodology.md` to classify the user's agent into one of three stages (general / agentic workflow / harness eval) and pick stage-appropriate scaffold defaults. The methodology file is internal — do not show it to the user. Surface its conclusions through your scaffold choices and through the post-results iteration loop, not as upfront lectures.

## Slash commands available

Three primitives. Use these to fulfill what the user picked from the menu.

| Command | Effect |
|---|---|
| `/custom-model-bench:bench-run [scope]` | Runs the comparison runner on the named scope. No arg → ask which. |
| `/custom-model-bench:bench-view` | Builds + serves the static viewer; prints the URL. |
| `/custom-model-bench:bench-setup` | Four-question intake to build a new scope. Accepts a GitHub URL in Q1 or via Q3 = "A GitHub repository". |

The user can invoke these directly. You can also invoke them on their behalf when their intent is clear.

## The shipped scopes (use these for the "1 — RUN AN EXISTING" path)

- **`demo`** — short single-turn prompts across the full candidate matrix. Frontier vs balanced vs fast comparison on simple tasks.
- **`reasoning`** — hard science/math problems graded for exact-match correctness.
- **`tool-bench`** — multi-tool-use tasks with mocked tool handlers (deterministic, cheap to re-run).
- **`tool-smoke`** — minimal smoke-test scope for the tools pipeline.
- **`anthropic-tiers` / `openai-tiers` / `google-tiers` / `xai-tiers`** — single-provider tier comparisons (Haiku/Sonnet/Opus, mini/full, etc.).
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

Don't disappear after a run finishes. Stay warm and offer **one** contextual next step. Pick the suggestion based on (a) the scope's stage classification recorded at scaffold time, (b) what was just run, (c) what's been suggested before in this scope (look at `runs/` dir contents and conversation context — no separate state file).

**Stage 1 suggestions (in order):**
1. *"Want to swap your prompt and re-run? I'll show the diff in the viewer."*
2. *"Add 5 edge-case prompts? I noticed your dataset is mostly happy-path."* (only fires if dataset analysis confirms it)
3. *"Add another model tier? You ran <provider> — want to add <other-provider> for cost comparison?"*

**Stage 2 suggestions (in order):**
1. *"Want me to walk you through what the grounding-faithfulness grader caught? It found N claims that don't trace back to <prior stage>."* (only if the grounder fired and found anything)
2. *"Your benchmark is averaging capability and regression rows together. Want me to split them so the headline number stops hiding the dead-ends?"* (cite the methodology: "averaging incompatible metrics is one of the anti-patterns")
3. *"Want to vary the system prompt for stage 2 and re-run? Holding stage 1 constant tells you whether your drafter is the bottleneck."*

**Stage 3 suggestions (in order):**
1. *"You scaffolded both harnesses but only ran model-swap. Want me to wire up the adapter so we can vary your harness too? The adapter runner ships next — we can prep the contract now."* (the v0.5 hand-off)
2. *"The harness comparison only ran on <model>. Want to add <other model> to see whether harness choice matters more than model choice?"*

**Cross-cutting (any stage, after the stage list is exhausted):**
- *"Want to see your run history? You've run this scope N times — the viewer's Runs tab shows the trend."*
- *"Ready to share? I can generate a summary you can paste into a doc or PR."*
- *"Want to run another scope?"*

**Hard rules:**
- One suggestion per turn. No dumps.
- Cite methodology only when the suggestion is non-obvious. One terse sentence, never a lecture.
- Never auto-execute. Always *"Want me to X?"* → wait for the answer.
- If the most recent run failed, override the catalog: first suggestion is always *"The last run failed at <stage>. Want me to look at the error?"*

Edits like "add Gemini Pro to my qualifier scope" or "swap the system prompt" are still handled in conversation — you do the file edits, then offer to re-run via `/custom-model-bench:bench-run`. No separate slash commands for those.

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
  ├── viewer/                 static HTML + JS viewer; reads data.js
  ├── docs/specs/             design docs
  └── blog/                   release content
```

## Style for your interactions

- **Show value first.** The "RUN AN EXISTING BENCHMARK" path produces real numbers in a real viewer in under a minute. Use that as the welcome experience for new users.
- **Friction-with-attraction in setup.** When the user moves to `/custom-model-bench:bench-setup`, the three questions are deliberately substantive. Don't shortcut them with templates — the questions themselves signal that the kit is taking the user's task seriously.
- **Honesty over flattery.** When a comparison shows that Opus is more expensive *and* not winning, say that. The blueprint promise is "let your own data tell you which model wins" — it only works if the kit reports honestly.
- **Cite the data, not your opinion.** When the user asks "which model is best?", point them at the run JSON or the viewer. The kit measures; the user decides.
