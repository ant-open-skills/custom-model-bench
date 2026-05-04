---
description: Build a new benchmark scope tailored to the user's task. Four-question intake plus a provider picker; accepts a GitHub repository URL.
---

Build a new benchmark scope from scratch, tailored to what the user is actually working on. Take the user through a deliberate intake — friction-with-attraction, not a template wizard. The questions themselves should signal that the kit is taking their task seriously.

All file operations below write into `${CLAUDE_PLUGIN_ROOT}/skills/custom-model-bench/examples/<scope-name>/`. That's where the plugin is installed, regardless of the user's current working directory.

**Dependency check first.** If `${CLAUDE_PLUGIN_ROOT}/node_modules/` does not exist, run `cd "${CLAUDE_PLUGIN_ROOT}" && bun install` before proceeding with scaffolding. One-time setup, ~30s.

## The four intake questions

Ask **one at a time**, in order. Wait for the user's answer before moving to the next. Do not batch them.

**CRITICAL — how to ask Q2, Q3, and Q4:** You MUST call the `AskUserQuestion` tool for each of Q2, Q3, and Q4. Do NOT write the options out as a text message, markdown bullet list, or numbered list. Do NOT paraphrase the options into prose. The interactive picker UI (arrow-key nav, space to toggle, auto "Other" field) is the whole point of this flow — falling back to text bullets defeats it. If you find yourself about to type "pick one:" or "options:" in a chat message for Q2/Q3/Q4, stop and call `AskUserQuestion` instead.

Q1 is the only free-text question.

### Q1 — What are you building?

Free text, 1–3 sentences. Capture the task domain — what does the agent do, who's it for, what shape of input does it take. Use the answer to derive the scope name (slugified, ≤30 chars; let the user override) and to seed the system prompt.

**URL detection.** If the user's answer contains a GitHub repository reference in any of these forms, treat the URL as the input and skip ahead — branch into the silent repo-analysis sub-flow at the end of this file *before* asking Q2:

- `https://github.com/<owner>/<repo>` (with or without trailing `.git`)
- `github.com/<owner>/<repo>`
- `git@github.com:<owner>/<repo>.git`
- A bare `<owner>/<repo>` reference where `<owner>` and `<repo>` look like GitHub identifiers

When this triggers, say one line ("I see a GitHub repo — let me take a quick look before we keep going") and run the **silent repo-analysis sub-flow** described at the bottom of this file. Anything not matching the above is treated as normal free text.

### Q2 — What do you care about?

Call `AskUserQuestion` now (not as a text message — as a tool call) with these exact parameters:

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

Call `AskUserQuestion` now (not as a text message — as a tool call) with these exact parameters:

- `question`: `"What do you already have?"`
- `header`: `"Starting kit"`
- `multiSelect`: `false`
- `options`:
  - `{ label: "A GitHub repository", description: "Point me at the repo and I'll classify the agent and scaffold a benchmark for it" }`
  - `{ label: "A dataset", description: "JSONL file path, or paste the contents after selecting" }`
  - `{ label: "A system prompt", description: "Evaluate your existing prompt — we'll synth a dataset around it" }`
  - `{ label: "Nothing yet", description: "Claude generates a starter dataset from a conversation" }`
  - `{ label: "Demo first", description: "Skip setup, run one of the shipped example scopes instead" }`

These five options are genuinely mutually exclusive paths through the rest of the flow — that's why this question is single-select (unlike Q2 and Q4). After the picker returns, branch:

- **A GitHub repository** → prompt for the URL, then run the **silent repo-analysis sub-flow** at the bottom of this file. (If Q1 already triggered URL detection, skip this branch — you're already in the sub-flow.)
- **A dataset** → prompt for the file path or pasted JSONL, then validate (must be JSONL with at least `id` + `prompt` per row; other fields optional). On validation failure, surface the issue and offer to fix or regenerate. System prompt is derived from Q1.
- **A system prompt** → prompt for the pasted prompt text, then kick the dataset-synth sub-flow (below), seeded with their prompt. The user gets to evaluate the prompt they already wrote — not a synthesized one.
- **Nothing yet** → kick the dataset-synth sub-flow, seeded with Q1 + Q2. System prompt is derived from Q1.
- **Demo first** → do not scaffold a new scope and do not ask the user to run more commands. Immediately invoke `/custom-model-bench:bench-view` on their behalf. That builds the static viewer from the shipped comparison JSONs (no API calls, instant) and opens the leaderboard on the yc-qualifier scope by default. Say one line before invoking: "Opening the viewer on the shipped benchmarks — 15 candidates across four scopes. Come back to `/custom-model-bench:bench-setup` when you're ready to wire up your own." Then call the command. Exit the setup flow.

### Q4 — Which providers do you want to compare?

Call `AskUserQuestion` now (not as a text message — as a tool call) with these exact parameters:

- `question`: `"Which providers do you want to compare?"`
- `header`: `"Providers"`
- `multiSelect`: `true`
- `options`:
  - `{ label: "Anthropic", description: "Claude Haiku 4.5, Sonnet 4.6, Opus 4.7" }`
  - `{ label: "OpenAI", description: "GPT-5.4 nano / mini / full" }`
  - `{ label: "Google", description: "Gemini 3.1 Flash Lite / Flash / Pro" }`
  - `{ label: "xAI", description: "Grok 4.1 Fast / 4.20 non-reasoning / 4.20 reasoning" }`

Default to Anthropic-only if the user picks nothing. Tell them the default is conservative — the demo scopes use all 12, but for their own benchmark we keep it lean unless they pick more.

## Dataset-synth sub-flow (only if Q3 == "Nothing yet" or Q3 == "A system prompt")

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

## Silent repo-analysis sub-flow (Q1 URL detection or Q3 = "A GitHub repository")

This sub-flow replaces the dataset-synth sub-flow when the user gives a GitHub URL. **Goal:** produce a sensibly-shaped scaffold with at most ONE user-facing follow-up before the run kicks off. Consult `skills/custom-model-bench/methodology.md` for stage classification, grader selection, and anti-patterns throughout.

**Steps:**

1. **Lightweight first fetch.** Run `gh api repos/<owner>/<repo>` for metadata (description, default branch, language, topics) and `gh api repos/<owner>/<repo>/contents` for the top-level tree. No clone. ~1-2 API calls.

2. **Surface-scan for agent signals.** From the tree, detect:
   - **SDK indicators** in lockfiles (`package.json`, `pyproject.toml`, `requirements.txt`, `bun.lock`, `uv.lock`): look for `anthropic`, `@anthropic-ai/sdk`, `openai`, `langchain`, `llama-index`, `mastra`, `vercel/ai`, etc.
   - **Harness indicators**: parallel sibling dirs that look like alternate implementations (`*_sdk/`, `*_v[0-9]/`, `harness*/`, `variants/`); sibling files like `compare.py`, `bench*.py` at the top level.
   - **Prompt artifacts**: files matching `system_prompt*`, `prompt*.md`, `prompts/`, `instructions*`.
   - **Tool surface**: code files referencing `tool_use`, `tools=[`, `@tool`, `defineTool`.
   - **Existing test/eval fixtures**: `tests/`, `evals/`, `fixtures/`, `examples/`, `golden*`.

3. **Selective deep-fetch.** For 5-10 most-likely-signal files (README, top-level entry points, detected prompt files, one example test fixture), pull contents via `gh api repos/<owner>/<repo>/contents/<path>` raw. **Budget: ≤ 50 KB total file contents.**

4. **Classify into a stage.** Apply the decision tree in `methodology.md`:
   - **Stage 1** if signals indicate single-shot prompt → output, no tools, no multi-stage pipeline.
   - **Stage 2** if multi-stage pipeline detected (multiple prompt files, named stages, intermediate artifacts).
   - **Stage 3** if multiple parallel harnesses implementing the same task.

5. **Pick scaffold defaults silently.** Per the chosen stage's "Default scaffold shape" in `methodology.md` §A:
   - Dataset shape (~15 rows; structured-output JSONL if a Findings-like schema is detected, prose-only otherwise)
   - Grader type (deterministic / LLM-judge / hybrid based on output shape — see `methodology.md` §B)
   - Cross-stage grounding-faithfulness check enabled if Stage 2
   - System prompt extracted from detected prompt files; if none found, synthesized from README + Q1

6. **One conditional follow-up — only when needed:**
   - **Stage 3 detected** → call `AskUserQuestion`:
     - `question`: `"I found multiple harnesses in your repo — how should I compare them?"`
     - `header`: `"Harness comparison"`
     - `multiSelect`: `false`
     - `options`: list each detected harness as one option ("Compare all N", "Just <harness-name-1>", "Just <harness-name-2>", etc.)
   - **Ambiguous classification** (signals split between stages) → call `AskUserQuestion`:
     - `question`: `"Is this a single-step prompt or a multi-stage pipeline?"`
     - `header`: `"Pipeline shape"`
     - `multiSelect`: `false`
     - `options`: `[{ label: "Single-step", description: "One prompt → one output" }, { label: "Multi-stage", description: "Two or more LLM calls chained together" }]`
   - **Otherwise**: skip, scaffold directly. No question.

7. **Scaffold the scope.** Write to `${CLAUDE_PLUGIN_ROOT}/skills/custom-model-bench/examples/<scope-name>/`:
   - `dataset.jsonl` — synthesized from repo signals + README + Q1
   - `system-prompt.md` — extracted or synthesized
   - `config-stage1-<provider>-<tier>.ts` per (provider, tier) the user picked in Q4
   - For Stage 2: also `config-stage2-*.ts`, `judge-rubric.md`, grounding grader configuration
   - For Stage 3: **also write a stub `bench-adapter.{py,ts}` per detected harness** with the comment `# TODO: wire entry point — adapter runner ships in v0.5 / harness wrapping is not yet implemented`. The stub must name the detected entry-point file so v0.5's runner has a clear target.
   - `README.md` — capture Q1 + Q2 + Q4 answers, the date, the URL, the detected stage, the silent decisions made, and a snippet showing how to re-run.

8. **Show a one-line decision summary before kicking off the run.** Example phrasings:
   > "Classified as Stage 2 (research → email pipeline). 15 prompts synthesized from your README. Grounding-faithfulness grader enabled. 6 candidates wiring up across Anthropic + OpenAI. Running now."
   >
   > "Found two harnesses (`agent_sdk/`, `client_sdk/`). Scaffolding model-swap on both across Sonnet + Opus + GPT-5 — 6 candidates total. Adapter runner ships in v0.5; for now we measure the model dimension, not the harness dimension. Running now."

9. **Then invoke `/custom-model-bench:bench-run <scope-name>`** as the existing flow does, and on completion enter the "what next?" loop in `SKILL.md` (which is now stage-aware).

**Failure modes & fallbacks (only three — don't try to cover everything):**

- **Can't read the repo** (private, 404, or > 100 top-level files): tell the user *"I can't read this repo (private, not found, or too large to scan). Paste a local path, or describe the agent in 1-2 sentences."* Fall back to free-text Q1.
- **No agent signal at all** (it's a library, frontend-only project, etc.): tell the user honestly *"I don't see an obvious agent in this repo — describe what you want to benchmark in 1-2 sentences instead?"* and fall back to free-text Q1.
- **Classification confidence too low** (no clear stage signal): default to Stage 1, note it in the decision summary so the user can correct (*"I wasn't sure of the stage — defaulted to Stage 1, single-shot. If your agent has multiple stages, tell me and I'll re-scaffold."*).

**Budget:**

- ≤ 12 `gh api` calls per repo
- ≤ 50 KB of file contents fetched
- Target ≤ 15 seconds from URL paste to "running now"

## Style

- Don't fire all four questions in one message. One at a time, wait for a real answer.
- Don't paraphrase the questions. The wording is deliberate — Hendrik's video script uses the exact phrasing.
- Don't moralize about cost or model choice. Surface tradeoffs, let the user decide.
- If the user pastes garbage instead of an answer, ask once for clarification, then move on with a sensible default if they refuse.
- For Q2/Q3/Q4 the picker is non-negotiable. Never render those options as chat-message bullets — always use the `AskUserQuestion` tool. If the tool is genuinely unavailable in your environment, say so explicitly before falling back to text; don't silently downgrade the UX.
