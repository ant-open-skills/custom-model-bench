---
description: Build a new benchmark scope tailored to the user's task. Three-question intake plus a provider picker.
---

Build a new benchmark scope from scratch, tailored to what the user is actually working on. Take the user through a deliberate intake — friction-with-attraction, not a template wizard. The questions themselves should signal that the kit is taking their task seriously.

All file operations below write into `${CLAUDE_PLUGIN_ROOT}/skills/custom-model-bench/examples/<scope-name>/`. That's where the plugin is installed, regardless of the user's current working directory.

**Dependency check first.** If `${CLAUDE_PLUGIN_ROOT}/node_modules/` does not exist, run `cd "${CLAUDE_PLUGIN_ROOT}" && bun install` before proceeding with scaffolding. One-time setup, ~30s.

## The four intake questions

Ask **one at a time**, in order. Wait for the user's answer before moving to the next. Do not batch them.

Q2, Q3, and Q4 are multi-choice with multi-select — use the `AskUserQuestion` tool for those so the user gets the arrow-nav / space-to-toggle picker instead of typing option names. Q1 is open-ended and stays free-text.

### Q1 — What are you building?

Free text, 1–3 sentences. Capture the task domain — what does the agent do, who's it for, what shape of input does it take. Use the answer to derive the scope name (slugified, ≤30 chars; let the user override) and to seed the system prompt.

### Q2 — What do you care about?

Invoke `AskUserQuestion` with:

- `question`: `"What do you care about?"`
- `header`: `"Priorities"`
- `multiSelect`: `true`
- `options`:
  - `{ label: "Speed", description: "Latency-sensitive — the user is waiting in a UI" }`
  - `{ label: "Cost", description: "High-volume — every dollar counts" }`
  - `{ label: "Reliability", description: "Won't ship if it fails sometimes" }`
  - `{ label: "Balanced", description: "No strong preference" }`

The `AskUserQuestion` tool automatically offers an "Other" free-text option — don't add one yourself. The user can pick multiple (e.g. Speed + Reliability) because real founders have more than one priority; map the combination to the viewer's fit-score profile, lexicographically prioritizing the first non-Balanced pick.

### Q3 — What do you already have?

Invoke `AskUserQuestion` with:

- `question`: `"What do you already have?"`
- `header`: `"Starting kit"`
- `multiSelect`: `true`
- `options`:
  - `{ label: "A dataset", description: "JSONL file path, or paste the contents after selecting" }`
  - `{ label: "A system prompt", description: "You'll paste it after selecting" }`
  - `{ label: "Nothing yet", description: "Claude generates a starter dataset from a conversation" }`

After the picker returns, handle the combination:

- **dataset only** → prompt for the file path or pasted JSONL, then validate (must be JSONL with at least `id` + `prompt` per row; other fields optional). On validation failure, surface the issue and offer to fix or regenerate.
- **prompt only** → prompt for the pasted prompt text, then kick the dataset-synth sub-flow (below), seeded with their prompt.
- **dataset + prompt** → gather both, validate the dataset, use their prompt verbatim.
- **nothing** (whether alone or selected alongside others — treat as dominant if alone, otherwise ignore) → kick the dataset-synth sub-flow, seeded with Q1 + Q2.

### Q4 — Which providers do you want to compare?

Invoke `AskUserQuestion` with:

- `question`: `"Which providers do you want to compare?"`
- `header`: `"Providers"`
- `multiSelect`: `true`
- `options`:
  - `{ label: "Anthropic", description: "Claude Haiku 4.5, Sonnet 4.6, Opus 4.7" }`
  - `{ label: "OpenAI", description: "GPT-5.4 nano / mini / full" }`
  - `{ label: "Google", description: "Gemini 3.1 Flash Lite / Flash / Pro" }`
  - `{ label: "xAI", description: "Grok 4.1 Fast / 4.20 non-reasoning / 4.20 reasoning" }`

Default to Anthropic-only if the user picks nothing. Tell them the default is conservative — the demo scopes use all 12, but for their own benchmark we keep it lean unless they pick more.

## Dataset-synth sub-flow (only if Q3 includes "Nothing yet", or selected "A system prompt" without "A dataset")

This is the brainstorming part. Ask **3–5 follow-up questions** tailored to their Q1 answer — not a fixed list. The goal: collect enough material to generate a real, idiosyncratic dataset, not a stock template. Suggested:

- *Give me 2-3 examples of inputs your agent should handle well.* (paste)
- *Give me 1-2 tricky / edge-case inputs that should still work.* (paste, optional)
- *What does a good output look like for input #1?* (paste — this becomes the grading anchor)
- *What does a bad output look like? So the grader knows what to fail on.* (paste)
- *Anything specific we should make sure the dataset covers?* (free text, optional)

Then make **one Sonnet 4.6 call** through the existing `runCagentRow` adapter (or `generateText` if simpler) with a prompt that requests 10–15 synthetic test rows in JSONL format with `id`, `prompt`, and any `expected_*` fields appropriate for the task type. Show the generated dataset to the user for review. Offer to regenerate (whole batch or specific rows) if anything's off.

Estimated cost per generation: ~$0.05.

## Scaffold the scope

Once you have a valid dataset + system prompt + provider list, write these files into `${CLAUDE_PLUGIN_ROOT}/skills/custom-model-bench/examples/<scope-name>/`:

- `dataset.jsonl` — the validated or generated dataset
- `system-prompt.md` — from Q1 (or user's paste)
- `config-<provider>-<tier>.ts` — one per (provider, tier) the user selected. Mirror the structure of `examples/yc-qualifier/config-stage1.ts` (load system prompt from disk, declare provider + model + maxTurns + maxOutputTokens + tools + runtime). For now, no tools wired by default — ask if they want to add some, otherwise scaffold tool-free configs.
- `README.md` — capture Q1 + Q2 + Q3 + Q4 answers, the date, and a snippet showing how to re-run.

## After scaffold

Tell the user:

> Scope `<name>` ready — `<N>` candidates wired, `<M>`-row dataset in place, system prompt at `<path>`. Run it now? (yes / show-me-the-files / edit-first)

If yes: invoke `/custom-model-bench:bench-run <scope-name>`, then on completion auto-suggest `/custom-model-bench:bench-view`.

After the user has seen the results (or skipped the run), enter the SKILL's "what next?" loop and offer one contextual next step (add a model, tweak the prompt, add edge cases, etc.).

## Style

- Don't fire all four questions in one message. One at a time, wait for a real answer.
- Don't paraphrase the questions. The wording is deliberate — Hendrik's video script uses the exact phrasing.
- Don't moralize about cost or model choice. Surface tradeoffs, let the user decide.
- If the user pastes garbage instead of an answer, ask once for clarification, then move on with a sensible default if they refuse.
