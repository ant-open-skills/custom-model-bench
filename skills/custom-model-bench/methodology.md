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
