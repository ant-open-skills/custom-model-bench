# Phase G — DX design

**Date:** 2026-04-19
**Status:** Approved through Section 3 with provider-picker amendment. Sections 4 + 5 approved at speed. Implementation in progress (SKILL.md → /bench-view → /bench-run → /bench-setup).

## Goal

Make `custom-model-bench` usable by founders who install the plugin and don't know what they want to do yet. Two hard requirements driving the design:

1. **Show value in <30 seconds** — first action must produce real numbers in the viewer, no setup.
2. **Friction-with-attraction in the setup** — when the user does decide to build their own benchmark, the kit should ask thoughtful questions that make them feel taken seriously, not blast through with templates.

The brainstorming skill from `superpowers` is the explicit methodology reference for the question-asking style.

## Top-level architecture

The SKILL is the conductor. Slash commands are the primitives. The user mostly talks to the SKILL; commands are for power users who skip the conversation.

```
  custom-model-bench SKILL (activates on benchmark / evaluate / compare intent)
        │
   state-aware menu:
   ├── A · PREVIEW     →  /bench-run <existing-scope> + /bench-view
   ├── B · BUILD       →  /bench-setup
   └── C · WHAT NEXT   →  loop after A or B; contextual prompts
```

State tracking via filesystem — checks `examples/<scope>/runs/` and `examples/<scope>/config-*.ts`. No separate state file.

## Slash command surface (v1)

Three commands. Every command is a maintenance commitment kept small.

| Command | What it does |
|---|---|
| `/bench-setup` | Entry to the BUILD branch. Triggers the three-question intake. |
| `/bench-run [scope]` | Runs the comparison runner on the named scope. No arg → SKILL prompts which scope. |
| `/bench-view` | Builds + serves the viewer, prints the URL. |

**Deferred to v0.2:** `/bench-schedule` (recurring reruns when new models ship) and any explicit `/bench-add` commands. Adding-a-candidate / adding-dataset-rows is handled through SKILL conversation, not a separate command.

## `/bench-setup` flow

The locked three questions, exact wording from Hendrik's video script:

1. **What are you building?** — free text, 1-3 sentences. Captures task domain.
2. **What do you care about?** — multi-choice (speed / cost / reliability / balanced) plus free-text override. Maps to the viewer's fit-score profile.
3. **What do you already have?** — multi-choice:
   - I have a dataset (file path or paste)
   - I have a system prompt (paste)
   - I have nothing yet — generate it for me
   - I have all of the above

Plus a **Q4 — provider picker**: "Which providers do you want to compare? (Anthropic / OpenAI / Google / xAI — pick any subset, default Anthropic only.)" The 12-model lineup is the *demo* default; user setup picks subset to keep cost honest.

**Branching off Q3:**
- has dataset → validate (JSONL with `id` + `prompt` minimum) → scaffold scope → run
- has prompt only → kick dataset-synth sub-flow seeded with their prompt
- has nothing → kick dataset-synth sub-flow seeded with Q1 + Q2

**Scaffold output:**
```
examples/<scope-name>/
  ├── dataset.jsonl
  ├── system-prompt.md
  ├── config-<provider>-<tier>.ts   × N (per Q4 selection)
  ├── README.md                     (captures Q1/Q2 answers + how to re-run)
  └── runs/                         (empty until /bench-run fires)
```

After scaffold: SKILL says "scope ready — run it now? (yes / edit-first / show-me-the-files)". On yes → `/bench-run` → on completion → `/bench-view` → enters "what next" loop.

## Dataset-synth sub-flow

Only when Q3 is "I have nothing" (or "I have prompt only"). Brainstorming-skill methodology, 3-5 follow-up questions tailored to Q1:

1. *Give me 2-3 examples of inputs your agent should handle well.* (paste)
2. *Give me 1-2 tricky / edge-case inputs that should still work.* (paste, optional)
3. *What does a good output look like for input #1?* (paste)
4. *What does a bad output look like? (so the grader knows what to fail on)* (paste)
5. *Anything specific we should make sure the dataset covers?* (free text, optional)

Then SKILL fires one Sonnet 4.6 call → generates ~10-15 synthetic rows in JSONL with `id` + `prompt` + `expected_*` fields based on the task type. User reviews, can regenerate or accept. Estimated cost: ~$0.05 per generation.

## "What next?" loop

After `/bench-run` + `/bench-view` complete, SKILL stays warm and offers contextual next steps based on what just happened:

- Just previewed an existing scope → *"Want to set up your own?"*
- Just built + ran their own → *"Want to add another model? Tweak the system prompt and re-run? Add edge cases?"*
- Just iterated → *"Schedule reruns when new models ship? (v0.2 — coming)"* + *"Want to share the leaderboard?"*

All next-step actions are SKILL-mediated edits + re-runs of the existing primitives. No new commands needed.

## SKILL.md content shape

The current `SKILL.md` is Phase 0 scaffolding ("not yet implemented"). Replace with:

- One-line description of what the skill does
- Activation triggers: benchmark, evaluate, compare models, test prompts
- The three-state menu (A/B/C) the SKILL presents on activation
- Reference to the three slash commands
- Pointer to the four shipped scopes
- Reference to brainstorming-skill methodology for `/bench-setup`
- Pointer to documentation / repo

Target length: ~80 lines, well-formatted markdown. Short enough to load every response without bloat, long enough to give the model a clear job.

## Implementation order

1. `SKILL.md` rewrite (the conductor)
2. `commands/bench-view.md` (simplest primitive)
3. `commands/bench-run.md` (next simplest)
4. `commands/bench-setup.md` (most complex — captures three questions, branches to dataset-synth)
5. Iterate on dataset-synth sub-flow + "what next" loop in conversation as we use it

## What this design deliberately does not include

- `/bench-schedule` — deferred to v0.2.
- `/bench-add candidate|dataset` slash commands — handled through SKILL conversation instead.
- `/bench-list` — discoverability is the SKILL's job, not a separate command.
- A dedicated config UI / settings panel — viewer is read-only over local JSONs.
- Cross-model judge jury — flagged as future work (E roadmap).
- Persistence beyond filesystem — no DB, no accounts.
