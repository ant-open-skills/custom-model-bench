# GitHub-repo intake & smarter `/bench-setup` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/specs/2026-05-03-github-repo-intake-and-smarter-bench-setup-design.md`

**Goal:** Upgrade `/bench-setup` to accept a GitHub URL, classify the user's agent into the 3-stage methodology framework silently, and surface methodology-aware suggestions in the post-results iteration loop. Ship as v0.4.0.

**Architecture:** Pure prompt/skill upgrade. New `methodology.md` reference doc consulted by Claude during silent repo analysis. Edits to `bench-setup.md`, `bench-run.md`, `bench-view.md`, `SKILL.md`. No code changes — runner/viewer/scaffolding pipeline unchanged.

**Tech Stack:** Markdown. The harness is Claude Code itself + the `gh` CLI (already required by the kit) + the existing `AskUserQuestion` tool surfaced through `commands/bench-setup.md`.

**Validation:** Three manual walkthrough scenarios from spec §7. No automated tests — this is a prompt-engineering deliverable.

---

## File-change map

```
custom-model-bench/
├── .claude-plugin/
│   ├── plugin.json                 (modify)  version 0.3.1 → 0.4.0
│   └── marketplace.json            (modify)  version 0.3.1 → 0.4.0
├── commands/
│   ├── bench-setup.md              (modify)  URL detection + new Q3 option +
│   │                                          silent sub-flow + iteration loop
│   ├── bench-run.md                (modify)  multi-harness scope handling
│   └── bench-view.md               (modify)  refresh-without-restart
└── skills/custom-model-bench/
    ├── SKILL.md                    (modify)  bug fixes + framework citation +
    │                                          upgraded "what next?" examples
    └── methodology.md              (CREATE)  reference doc Claude consults
                                              during silent analysis
```

**Order of execution matters:** `methodology.md` first (other files reference it), then `SKILL.md` (now references methodology + describes upgraded loop), then `bench-setup.md` (the substantive change), then small edits to `bench-run.md` and `bench-view.md`. Version bump and walkthrough validation last.

---

## Task 1: Create `methodology.md`

**Files:**
- Create: `skills/custom-model-bench/methodology.md`

- [ ] **Step 1: Write the file with the full reference content.**

```markdown
# Methodology reference (internal)

This file is **for Claude, not for the user.** It encodes the 3-stage
benchmark framework, grader taxonomy, and anti-patterns the kit applies
during silent repo analysis. Consult it before scaffolding any new scope
when the user has provided a GitHub repo or a complex free-text task
description.

Source methodology: <https://www.krackedtools.dev>. Context-engineering
patterns: <https://rlancemartin.github.io/2026/01/09/agent_design/>.

---

## Quick decision tree (read this first)

```
URL given OR complex task description
  → fetch repo tree + metadata (or extract signals from prose)
  → harness signals?      → Stage 3 path (§A.3)
  → multi-stage signals?  → Stage 2 path (§A.2)
  → otherwise             → Stage 1 path (§A.1)

For chosen stage:
  → grader: §B (lookup by output shape)
  → patterns: §C (annotate scaffold metadata, do not change stage)
  → before scaffolding: §D (refuse anti-patterns)
```

---

## §A — The 3-stage framework

### A.1 — Stage 1: General benchmark (single-shot)

**Definition.** Single prompt → single output. No multi-stage chaining,
no agent loop. Most "prompt eval" use cases.

**Detection signals.**
- Single prompt file (`system_prompt.md`, `prompt.txt`, etc.)
- Code chains exactly one LLM call per input
- Outputs are short (< ~500 tokens) and shape-constrained
- Repo has < ~10 source files total

**Recommended grader.** Deterministic when output is structured or
enumerable; LLM-judge (3-run protocol) when output is open prose. Pick
from §B based on detected output shape.

**Default scaffold shape.**
- ~15 dataset rows in `dataset.jsonl` with `id` + `prompt` + (if
  applicable) `expected_output` or `expected_class`
- Single `system-prompt.md` extracted from the repo (or synthesized
  from README + Q1 if no prompt file detected)
- One `config-stage1-<provider>-<tier>.ts` per (provider, tier) the
  user picked
- No judge file unless output is open prose

**Anti-patterns to refuse.**
- Don't add a stage-2 grounding-faithfulness grader to a Stage 1
  scaffold (it has nothing to ground against).
- Don't propose > 30 prompts unless the user asks — Stage 1 benchmarks
  earn their value from focused regression coverage, not bulk.

### A.2 — Stage 2: Agentic workflow (multi-stage)

**Definition.** Two or more LLM calls chained, where intermediate
artifacts feed later stages. Examples: research → draft, retrieve →
judge, plan → execute, classify → respond.

**Detection signals.**
- Multiple prompt files named per stage (`system-prompt-stage1.md`,
  `system-prompt-stage2.md`)
- Code passes outputs from one LLM call into the next
- README mentions "pipeline", "stages", "first ... then ..."
- Intermediate-artifact files exist (e.g., `research.json`, `draft.md`)

**Recommended grader.** Hybrid: deterministic per-stage grader where
output shape allows, plus a cross-stage grounding-faithfulness check
that extracts factual claims from the final output and verifies them
against the intermediate artifacts.

**Default scaffold shape.**
- ~15 dataset rows with `id` + `prompt` + (per stage) expected
  artifacts where applicable
- One prompt file per stage
- One `config-stage1-*.ts` and `config-stage2-*.ts` per (provider,
  tier) combo
- Judge files: `judge-rubric.md` (per-stage) + grounding-faithfulness
  check enabled

**Anti-patterns to refuse.**
- Don't grade only the final output. That misses cross-stage
  hallucinations — the whole reason Stage 2 needs hybrid grading.
- Don't average a rubric score against a fabrication-rate against a
  cost number into a single "overall quality" score.

### A.3 — Stage 3: Harness eval (compare implementations)

**Definition.** Two or more parallel implementations of the same task,
varying prompt + tool definitions + orchestration + retry policy while
holding the model constant (or sweeping the model as a secondary axis).

**Detection signals.**
- Parallel sibling directories with similar entry-point files
  (e.g., `agent_sdk/reviewer.py` and `client_sdk/reviewer.py`)
- Naming patterns: `*_sdk/`, `*_v[0-9]/`, `harness*/`, `variants/`
- Sibling comparison code (`compare.py`, `bench*.py`) at top level

**Recommended grader.** Same as the underlying task's stage (Stage 1
grader if each harness is single-shot; Stage 2 grader if each is a
pipeline). Stage 3 doesn't change *what* you grade, it changes the
candidate matrix to include (harness × model) instead of just (model).

**Default scaffold shape.**
- All of the Stage 1 or Stage 2 scaffolding above
- Plus: one stub `bench-adapter.{py,ts}` per detected harness, with
  the comment `# TODO: wire entry point — adapter runner ships in v0.5`
- The stub names the detected entry-point file so v0.5's runner has
  clear targets

**Anti-patterns to refuse.**
- Don't scaffold a Stage 3 comparison without recording each harness's
  configuration (prompt file, tool list, runtime knobs) in the scope's
  README. Reproducibility is the whole point of harness eval.

---

## §B — Grader taxonomy by output type

| Output shape | Grader type | Tooling | Notes |
|---|---|---|---|
| Structured JSON | Deterministic / schema-validation | code-based | Cheapest, most reliable |
| Short prose / classification | Deterministic / regex-or-exact | code-based | If answers enumerable |
| Long prose | LLM-judge | Sonnet 4.6 + 3-run protocol | Report mean ± stddev |
| Multi-stage outputs | Hybrid: deterministic per-stage + LLM grounding | code + Sonnet | §A.2 default |

When picking: detect output shape from the deepest available signal
(test fixtures > prompt-file instructions > README description > Q1
free-text). Default to LLM-judge only when nothing more deterministic
fits.

---

## §C — Context-engineering patterns

The following patterns from <https://rlancemartin.github.io/2026/01/09/agent_design/>
inform *what's worth measuring* but do **not** change the stage
classification: Give Computer · Multi-Layer Action Space · Progressive
Disclosure · Offload Context · Cache Context · Isolate Context · Evolve
Context. When detected, annotate them as scaffold metadata in the
scope README (e.g., "uses Cache Context — surface cache hit rate as
a tracked metric"). Never the primary driver.

---

## §D — Hard "do not scaffold" rules

These are refusals during silent analysis. If a scaffold would violate
any of them, fall back to asking the user one targeted question rather
than scaffolding the offending shape.

1. **Don't average across grader categories** into a single "overall
   quality" number. Report rubric, fabrication-rate, and cost as
   separate axes; let the viewer compose them.
2. **Don't use single-pass holistic grading on Stage 2 pipelines.**
   Always decompose into per-stage graders + cross-stage grounding.
3. **Don't omit harness configuration from the scaffold metadata.**
   The scope README must record system prompt path, tool list, and
   runtime knobs for every candidate config — otherwise results aren't
   reproducible.
4. **Don't propose < 10 or > 30 dataset rows** without an explicit
   user reason. The framework's empirical sweet spot is 15-20 rows
   with 3-4 graders.

(Initial set; expandable as new footguns surface.)
```

- [ ] **Step 2: Verify the file exists and has the expected sections.**

Run: `wc -l skills/custom-model-bench/methodology.md && grep -E "^#{1,3} " skills/custom-model-bench/methodology.md`

Expected: file is ~200-300 lines; section headers include "Quick decision tree", "§A — The 3-stage framework", "A.1 — Stage 1", "A.2 — Stage 2", "A.3 — Stage 3", "§B — Grader taxonomy", "§C — Context-engineering patterns", "§D — Hard"

- [ ] **Step 3: Commit.**

```bash
git add skills/custom-model-bench/methodology.md
git commit -m "$(cat <<'EOF'
methodology.md: add internal reference for 3-stage framework

Encodes the krackedtools.dev 3-stage framework (general / agentic
workflow / harness eval), grader taxonomy by output type, and
hard-coded anti-patterns Claude consults during silent repo analysis
in /bench-setup. Internal reference only — not user-facing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Update `SKILL.md` — bug fixes + framework citation + upgraded "what next?" loop

**Files:**
- Modify: `skills/custom-model-bench/SKILL.md`

- [ ] **Step 1: Read current `SKILL.md`** to confirm line numbers haven't drifted.

Run: `head -60 skills/custom-model-bench/SKILL.md`

Expected: line 16 still has "3-question intake"; lines 38-43 still list shipped scopes including stale `speed-bench` and `reasoning-bench`.

- [ ] **Step 2: Fix bug #1 (3 vs 4 questions).**

In `SKILL.md`, replace the line:

```markdown
2 — BUILD MY OWN                (3-question intake → scaffold a scope)
```

with:

```markdown
2 — BUILD MY OWN                (4-question intake → scaffold a scope)
```

- [ ] **Step 3: Fix bug #2 (stale scope list).**

In `SKILL.md`, find the section "## The shipped scopes" and replace the bulleted list (currently `speed-bench`, `reasoning-bench`, `tool-bench`, `yc-qualifier`) with the actual current scopes:

```markdown
## The shipped scopes (use these for the "1 — RUN AN EXISTING" path)

- **`demo`** — short single-turn prompts across the full candidate matrix. Frontier vs balanced vs fast comparison on simple tasks.
- **`reasoning`** — hard science/math problems graded for exact-match correctness.
- **`tool-bench`** — multi-tool-use tasks with mocked tool handlers (deterministic, cheap to re-run).
- **`tool-smoke`** — minimal smoke-test scope for the tools pipeline.
- **`anthropic-tiers` / `openai-tiers` / `google-tiers` / `xai-tiers`** — single-provider tier comparisons (Haiku/Sonnet/Opus, mini/full, etc.).
- **`yc-qualifier`** (the agentic flagship) — Stage 1 prospect research → Stage 2 email drafter → grounding-faithfulness grader → 3-run Opus 4.7 rubric judge. The full pipeline.
```

- [ ] **Step 4: Add a brief reference to `methodology.md` and the 3-stage framework.**

Insert this paragraph immediately after the "## What to do when activated" section's three-option menu and detection rules (around the existing line 25, before "## Slash commands available"):

```markdown
## Methodology reference

When the user moves into `/custom-model-bench:bench-setup` and especially when they paste a GitHub repo URL, consult `skills/custom-model-bench/methodology.md` to classify the user's agent into one of three stages (general / agentic workflow / harness eval) and pick stage-appropriate scaffold defaults. The methodology file is internal — do not show it to the user. Surface its conclusions through your scaffold choices and through the post-results iteration loop, not as upfront lectures.
```

- [ ] **Step 5: Upgrade the "what next?" loop section.**

Find the section "## After every run completes — the 'what next?' loop" and replace its body with:

```markdown
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
```

- [ ] **Step 6: Verify and commit.**

Run: `git diff skills/custom-model-bench/SKILL.md | head -120`

Confirm: the four edits appear (3-vs-4 fix; scope list refresh; methodology reference paragraph; iteration loop body replacement).

```bash
git add skills/custom-model-bench/SKILL.md
git commit -m "$(cat <<'EOF'
SKILL.md: fix bugs, reference methodology, upgrade iteration loop

- Fix 3-question vs 4-question discrepancy (line 16)
- Replace stale scope list with actual examples directory contents
- Add brief reference to methodology.md for stage classification
- Replace generic "what next?" loop with stage-aware suggestion catalog

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Upgrade `bench-setup.md` — URL detection + new Q3 option + silent sub-flow

**Files:**
- Modify: `commands/bench-setup.md`

This is the biggest single edit. Break into three sub-edits, commit after the whole task.

- [ ] **Step 1: Read current `bench-setup.md`** to confirm structure.

Run: `head -120 commands/bench-setup.md`

Expected: the file currently has Q1-Q4 in order; Q3 has four options (A dataset / A system prompt / Nothing yet / Demo first).

- [ ] **Step 2: Add URL detection to Q1.**

Find the "### Q1 — What are you building?" section. Replace its body with:

```markdown
### Q1 — What are you building?

Free text, 1–3 sentences. Capture the task domain — what does the agent do, who's it for, what shape of input does it take. Use the answer to derive the scope name (slugified, ≤30 chars; let the user override) and to seed the system prompt.

**URL detection.** If the user's answer contains a GitHub repository reference in any of these forms, treat the URL as the input and skip ahead — branch into the silent repo-analysis sub-flow at the end of this file *before* asking Q2:

- `https://github.com/<owner>/<repo>` (with or without trailing `.git`)
- `github.com/<owner>/<repo>`
- `git@github.com:<owner>/<repo>.git`
- A bare `<owner>/<repo>` reference where `<owner>` and `<repo>` look like GitHub identifiers

When this triggers, say one line ("I see a GitHub repo — let me take a quick look before we keep going") and run the **silent repo-analysis sub-flow** described at the bottom of this file. Anything not matching the above is treated as normal free text.
```

- [ ] **Step 3: Update Q3 options (add "A GitHub repository" as the new first option).**

Find the "### Q3 — What do you already have?" section. Replace its body with:

```markdown
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
```

- [ ] **Step 4: Append the silent repo-analysis sub-flow at the end of the file** (before the existing "## Style" section).

Insert this new section between "## After scaffold" and "## Style":

```markdown
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
```

- [ ] **Step 5: Verify and commit.**

Run: `git diff commands/bench-setup.md | wc -l`

Expected: a substantial diff (300+ lines added/changed).

```bash
git add commands/bench-setup.md
git commit -m "$(cat <<'EOF'
bench-setup: GitHub URL intake + silent repo-analysis sub-flow

- Q1 now detects GitHub URLs and triggers silent analysis directly
- Q3 adds 'A GitHub repository' as the new first option
- New silent repo-analysis sub-flow: tree scan + selective deep-fetch
  + stage classification + scaffold + one-line decision summary
- At most one user-facing follow-up (Stage 3 detection or ambiguous
  classification); otherwise scaffold directly
- For Stage 3, writes stub bench-adapter files per harness with
  TODO markers pointing at v0.5

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Update `bench-run.md` — multi-harness scope handling

**Files:**
- Modify: `commands/bench-run.md`

- [ ] **Step 1: Read current `bench-run.md`.**

Run: `cat commands/bench-run.md`

Confirm the existing structure (~30 lines: dependency check, API key check, scope listing, run dispatch, cost-control flags, completion message).

- [ ] **Step 2: Add a section about multi-harness scopes.**

Append this section to the end of `bench-run.md`:

```markdown
## Multi-harness scopes (scaffolded by `/bench-setup` from a GitHub repo)

If the scope's directory contains one or more `bench-adapter.{py,ts}` files (Stage 3 scopes scaffolded from a multi-harness GitHub repo), the harness-invocation runner is **not yet wired up — that ships in v0.5.** For now:

- Run the model-swap dimension as usual using the existing `config-stage1-*.ts` candidates.
- Tell the user explicitly: *"I'm running the model-swap dimension only. Harness comparison (varying `agent_sdk/` vs `client_sdk/`) is staged in the adapter stubs but not yet executed — that ships next."*
- Do not error out or skip the run. The model-swap results are still useful on their own.

When the v0.5 runner lands, this section will get replaced with the actual harness-invocation flow.
```

- [ ] **Step 3: Verify and commit.**

```bash
git add commands/bench-run.md
git commit -m "$(cat <<'EOF'
bench-run: handle multi-harness scopes gracefully

When a scope contains bench-adapter stub files (Stage 3 scaffold from
GitHub repo intake), run the model-swap dimension and tell the user
explicitly that harness-invocation lands in v0.5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Update `bench-view.md` — refresh-without-restart

**Files:**
- Modify: `commands/bench-view.md`

- [ ] **Step 1: Read current `bench-view.md`.**

Run: `cat commands/bench-view.md`

Confirm: the file currently rebuilds data and starts the server unconditionally on every invocation.

- [ ] **Step 2: Add server-already-running detection.**

Replace step 3 of the existing numbered list ("Start the viewer server in the background...") with:

```markdown
3. **Check whether the viewer server is already running.** Run `lsof -i :4040 -sTCP:LISTEN -t` (or the configured `PORT`). If the command returns a PID, the server is already up — skip the serve step and just tell the user "Refreshed `viewer/data.js` — reload http://localhost:4040 in your browser to see the new run." If the command returns nothing, start the server in the background with `cd "${CLAUDE_PLUGIN_ROOT}" && bun viewer:serve` (detached — it stays running until killed).
```

Renumber the subsequent steps accordingly.

- [ ] **Step 3: Verify and commit.**

```bash
git add commands/bench-view.md
git commit -m "$(cat <<'EOF'
bench-view: skip server start if already running on the configured port

Detect existing listener via lsof; if present, just rebuild data.js and
tell the user to refresh their browser. Otherwise start the server as
before. Avoids redundant server processes on repeat /bench-view calls.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Walkthrough validation

**Files:** none — this is a manual validation pass against the upgraded skill.

For each scenario, the implementer (or the user, if doing the walkthrough together) invokes `/bench-setup` against the target repo and confirms the conversation shape matches what spec §7 describes. Mark each scenario passed only when its specific success condition holds.

- [ ] **Step 1: Walkthrough scenario 1 — `code-review-agent` (Stage 3).**

Run `/bench-setup`. Answer Q1 with: `https://github.com/Hendrik040/code-review-agent`.

**Expected conversation shape:**
- Claude says one line ("I see a GitHub repo — let me take a quick look before we keep going") then runs the silent sub-flow.
- Claude classifies as Stage 3 (multi-harness).
- Claude asks the **one** targeted follow-up about which harnesses to compare (not generic Q3 starting-kit picker).
- After Q2 + Q4 are answered, Claude scaffolds the scope including stub `bench-adapter.{py,ts}` files for both `agent_sdk/` and `client_sdk/`.
- Claude shows a one-line decision summary mentioning "two harnesses" and the v0.5 caveat.
- Run completes. Iteration loop's first suggestion is the v0.5 hand-off (*"You scaffolded both harnesses but only ran model-swap — want me to wire up the adapter so we can vary your harness too?"*).

**Pass criterion:** the headline pitch *"I see two harnesses, want to compare them?"* surfaces on first contact, no manual prompting from the user.

- [ ] **Step 2: Walkthrough scenario 2 — simple Stage 1 repo.**

Pick any small Anthropic-SDK example repo (e.g., a single-file prompt-and-response script). Run `/bench-setup`, paste the URL in Q1.

**Expected conversation shape:**
- Silent sub-flow runs, classifies as Stage 1.
- No follow-up beyond the standard Q2 + Q4. Q3 is skipped (URL already provided in Q1).
- Scaffold proceeds directly. Decision summary mentions "Stage 1, single-shot."
- Run completes. Iteration loop's first suggestion is *"Want to swap your prompt and re-run?"*

**Pass criterion:** zero follow-ups beyond the locked Q2/Q4 questions.

- [ ] **Step 3: Walkthrough scenario 3 — non-agent repo.**

Pick a clearly non-agent repo (e.g., a static-site generator, a JS library with no LLM code). Run `/bench-setup`, paste the URL in Q1.

**Expected conversation shape:**
- Silent sub-flow runs, finds no agent signal.
- Claude tells the user honestly: *"I don't see an obvious agent in this repo — describe what you want to benchmark in 1-2 sentences instead?"*
- Falls back to free-text Q1 path.

**Pass criterion:** no scaffold gets written, no garbage benchmark gets created. The user is invited back into the normal flow.

- [ ] **Step 4: If any walkthrough fails, fix the issue in the relevant command/skill file** and re-run that specific walkthrough. Do not move to Task 7 until all three pass.

---

## Task 7: Version bump + push

**Files:**
- Modify: `.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`

- [ ] **Step 1: Bump `plugin.json`.**

Edit `.claude-plugin/plugin.json`: change `"version": "0.3.1"` → `"version": "0.4.0"`.

- [ ] **Step 2: Bump `marketplace.json`.**

Edit `.claude-plugin/marketplace.json`: change `"version": "0.3.1"` → `"version": "0.4.0"` (the version inside the `plugins` array entry).

- [ ] **Step 3: Verify.**

Run: `grep '"version"' .claude-plugin/plugin.json .claude-plugin/marketplace.json`

Expected output:
```
.claude-plugin/plugin.json:  "version": "0.4.0",
.claude-plugin/marketplace.json:      "version": "0.4.0",
```

- [ ] **Step 4: Commit.**

```bash
git add .claude-plugin/plugin.json .claude-plugin/marketplace.json
git commit -m "$(cat <<'EOF'
v0.4.0 — GitHub repo intake + smarter /bench-setup

/bench-setup now accepts a GitHub URL (auto-detected in Q1 or chosen
explicitly in Q3), classifies the user's agent into the krackedtools.dev
3-stage framework via a silent repo-analysis sub-flow, and surfaces
methodology-aware suggestions in the post-results iteration loop.

New: skills/custom-model-bench/methodology.md (internal reference)
Edit: bench-setup.md (URL intake + silent sub-flow)
Edit: bench-run.md (multi-harness scope handling)
Edit: bench-view.md (refresh-without-restart)
Edit: SKILL.md (bug fixes + framework citation + iteration loop catalog)

Adapter invocation runner deferred to v0.5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Push to ant-open-skills.**

```bash
gh auth switch -u ant-open-skills && git push origin main && gh auth switch -u Hendrik040
```

Confirm the push lands and the active gh account is restored to Hendrik040.

---

## Self-review (run by the implementer before declaring done)

Spec coverage:
- [x] §1 Problem — addressed by Tasks 1-3
- [x] §2 Goals 1 (URL intake) — Task 3 step 2 + step 3
- [x] §2 Goals 2 (stage classification) — Tasks 1 + 3 step 4
- [x] §2 Goals 3 (methodology surfaces *after* results) — Task 2 step 5
- [x] §2 Goals 4 (multi-harness detection) — Task 3 step 4 + Task 4
- [x] §2 Goals 5 (stays agnostic) — methodology.md is generic; walkthrough scenario 3 verifies non-agent fallback
- [x] §3 File changes — exact mapping in this plan's file-change map
- [x] §4 Silent sub-flow — Task 3 step 4
- [x] §5 methodology.md content — Task 1
- [x] §6 Iteration loop — Task 2 step 5
- [x] §7 Walkthroughs — Task 6
- [x] §8 Decisions — implicit in Tasks 1-7 (no decision-level changes needed in code; the spec records them)

Placeholder scan:
- All "what to write" steps include the actual content. No "fill in details" or "implement appropriate handling."

Type / name consistency:
- `methodology.md` is referenced by name and path in Tasks 2, 3
- `bench-adapter.{py,ts}` naming used consistently (Tasks 3, 4, 6)
- Stage 1/2/3 terminology used consistently throughout
