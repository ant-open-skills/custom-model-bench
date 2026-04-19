---
description: Build a new benchmark scope tailored to the user's task. Three-question intake plus a provider picker.
---

Build a new benchmark scope from scratch, tailored to what the user is actually working on. Take the user through a deliberate intake — friction-with-attraction, not a template wizard. The questions themselves should signal that the kit is taking their task seriously.

## The four intake questions

Ask **one at a time**, in order. Wait for the user's answer before moving to the next. Do not batch them.

1. **What are you building?**
   Free text, 1–3 sentences. Capture the task domain — what does the agent do, who's it for, what shape of input does it take. Use the answer to derive the scope name (slugified, ≤30 chars; let the user override) and to seed the system prompt.

2. **What do you care about?**
   Multi-choice — they pick one:
   - speed (latency-sensitive — the user is waiting in a UI)
   - cost (high-volume — every dollar counts)
   - reliability (won't ship if it fails sometimes)
   - balanced (no strong preference)
   - free text — "tell me what matters most"

   Map this to the viewer's fit-score profile so the leaderboard is sorted by what the user actually cares about. Also use it to pick which metrics get headlined later.

3. **What do you already have?**
   Multi-choice:
   - I have a dataset (file path, or paste the JSONL)
   - I have a system prompt (paste it)
   - I have nothing yet — generate it for me
   - I have all of the above

   This branches the rest of the flow:

   - **has dataset** → validate (must be JSONL with at least `id` + `prompt` per row; other fields optional). On validation failure, surface the issue and offer to fix or regenerate.
   - **has prompt only** → kick the dataset-synth sub-flow (below), seeded with their prompt.
   - **has nothing** → kick the dataset-synth sub-flow, seeded with Q1 + Q2.
   - **has all** → use both, validate the dataset, use their prompt verbatim.

4. **Which providers do you want to compare?**
   Multi-select: Anthropic / OpenAI / Google / xAI. Default Anthropic only. Tell the user the default is conservative — the demo scopes use all 12, but for their own benchmark we keep it lean unless they pick more.

## Dataset-synth sub-flow (only if Q3 = "I have nothing" or "prompt only")

This is the brainstorming part. Ask **3–5 follow-up questions** tailored to their Q1 answer — not a fixed list. The goal: collect enough material to generate a real, idiosyncratic dataset, not a stock template. Suggested:

- *Give me 2-3 examples of inputs your agent should handle well.* (paste)
- *Give me 1-2 tricky / edge-case inputs that should still work.* (paste, optional)
- *What does a good output look like for input #1?* (paste — this becomes the grading anchor)
- *What does a bad output look like? So the grader knows what to fail on.* (paste)
- *Anything specific we should make sure the dataset covers?* (free text, optional)

Then make **one Sonnet 4.6 call** through the existing `runCagentRow` adapter (or `generateText` if simpler) with a prompt that requests 10–15 synthetic test rows in JSONL format with `id`, `prompt`, and any `expected_*` fields appropriate for the task type. Show the generated dataset to the user for review. Offer to regenerate (whole batch or specific rows) if anything's off.

Estimated cost per generation: ~$0.05.

## Scaffold the scope

Once you have a valid dataset + system prompt + provider list, write these files into `skills/custom-model-bench/examples/<scope-name>/`:

- `dataset.jsonl` — the validated or generated dataset
- `system-prompt.md` — from Q1 (or user's paste)
- `config-<provider>-<tier>.ts` — one per (provider, tier) the user selected. Mirror the structure of `examples/yc-qualifier/config-stage1.ts` (load system prompt from disk, declare provider + model + maxTurns + maxOutputTokens + tools + runtime). For now, no tools wired by default — ask if they want to add some, otherwise scaffold tool-free configs.
- `README.md` — capture Q1 + Q2 + Q3 + Q4 answers, the date, and a snippet showing how to re-run.

## After scaffold

Tell the user:

> Scope `<name>` ready — `<N>` candidates wired, `<M>`-row dataset in place, system prompt at `<path>`. Run it now? (yes / show-me-the-files / edit-first)

If yes: invoke `/bench-run <scope-name>`, then on completion auto-suggest `/bench-view`.

After the user has seen the results (or skipped the run), enter the SKILL's "what next?" loop and offer one contextual next step (add a model, tweak the prompt, add edge cases, etc.).

## Style

- Don't fire all four questions in one message. One at a time, wait for a real answer.
- Don't paraphrase the questions. The wording is deliberate — Hendrik's video script uses the exact phrasing.
- Don't moralize about cost or model choice. Surface tradeoffs, let the user decide.
- If the user pastes garbage instead of an answer, ask once for clarification, then move on with a sensible default if they refuse.
