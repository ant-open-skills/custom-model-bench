# Design — GitHub-repo intake & smarter `/bench-setup`

**Status:** design approved through brainstorming on 2026-05-03. Pending user review of this spec before the implementation plan.

**Version target:** `0.4.0` (minor — additive, no breaking changes).

---

## 1. Problem

The current `/bench-setup` is a four-question intake that scaffolds a generic-shape benchmark. It's fine, but:

- It can't accept the most natural input mode for someone with a real agent — **a link to their GitHub repo.**
- It scaffolds the same dataset/grader shape regardless of whether the user is benchmarking a single-shot prompt or a multi-stage pipeline.
- The methodology that justifies its choices (the 3-stage framework documented at krackedtools.dev) is never surfaced to a user building their own scope.
- For a repo like [`Hendrik040/code-review-agent`](https://github.com/Hendrik040/code-review-agent) — two harnesses implementing the same task — there's no path to recognize *"you have two harnesses, want me to compare them?"*

This is a plugin, not a perfectionist eval framework. The fix should make the kit feel *attentive*, not exhaustive.

## 2. Goals

1. Accept a GitHub repo URL as a first-class input in `/bench-setup` (auto-detected in Q1, explicit option in Q3).
2. Classify the user's agent (silently) into Stage 1 / 2 / 3 from the krackedtools.dev framework, and use that to pick scaffold defaults.
3. Surface methodology *after* results, not before — keep the locked four-question intake light.
4. Detect multi-harness repos and offer the comparison pitch directly, even though the actual harness-invocation runner ships in v0.5.
5. Stay agnostic. Don't overfit to one example.

### Non-goals

- Adapter invocation runner (v0.5).
- Polyglot adapter machinery (v0.5).
- Viewer-side changes (auto-discovery of user scopes; capability/regression rendering; judge rationales) — separately queued.
- Replacing the locked four-question intake with adaptive open-ended dialogue.

## 3. File changes

```
custom-model-bench/
├── commands/
│   ├── bench-setup.md          (edit)  URL detection in Q1; new "GitHub repository"
│   │                                   option in Q3; silent repo-analysis sub-flow;
│   │                                   methodology-aware iteration loop
│   ├── bench-run.md            (edit)  small additions for multi-harness scopes
│   └── bench-view.md           (edit)  refresh-without-restart behavior
└── skills/custom-model-bench/
    ├── SKILL.md                (edit)  fix two existing bugs; reference the
    │                                   3-stage framework; upgrade "what next?"
    │                                   examples
    └── methodology.md          (NEW)   internal reference Claude consults during
                                        silent analysis. Not user-facing.
```

No code changes — runner, viewer, scaffolding stay as they are.

**Two existing `SKILL.md` bugs to fix in this cycle:**
- Line 16 says "3-question intake"; line 47 says "four locked questions." Fix line 16.
- Lines 40-43 list shipped scopes (`speed-bench`, `reasoning-bench`) that don't exist. Update to match reality: `anthropic-tiers`, `demo`, `google-tiers`, `openai-tiers`, `reasoning`, `tool-bench`, `tool-smoke`, `xai-tiers`, `yc-qualifier`.

## 4. Silent repo-analysis sub-flow

Activates when a GitHub URL lands. Goal: produce a sensibly-shaped scaffold with **at most one user-facing follow-up** before the run kicks off.

### 4.1 Behavior

1. **Lightweight first fetch** — `gh api repos/<owner>/<repo>` for metadata + tree. No clone.
2. **Surface-scan for agent signals** — SDK indicators in lockfiles, parallel sibling dirs that look like alternate harnesses, prompt files (`system_prompt*`, `prompt*.md`), tool-definition code, existing test fixtures.
3. **Selective deep-fetch** — pull contents of 5-10 most-likely-signal files (README, prompt files, one entry point, one fixture). Budget: ≤ 50 KB.
4. **Classify into a stage:**
   - **Stage 1** — single-shot prompt → output. Small repo, single prompt file.
   - **Stage 2** — multi-stage pipeline. Multiple prompt files, named stages, intermediate artifacts.
   - **Stage 3** — multiple parallel harnesses implementing the same task.
5. **Pick scaffold defaults silently** — dataset shape (~15 rows), grader type by output shape, grounding-faithfulness check if Stage 2, system prompt extracted from detected files (or synthesized from README + Q1).
6. **One conditional follow-up — only when needed:**
   - Stage 3 detected → *"I found N harnesses (`X/`, `Y/`). Compare all N across the providers you picked, or just one?"*
   - Ambiguous classification → *"This could be a single-step prompt or a multi-stage pipeline — which fits?"*
   - Otherwise: skip, scaffold directly.
7. **Scaffold the scope.** For Stage 3, also write a stub `bench-adapter.{py,ts}` with `TODO: wire entry point — adapter runner ships in v0.5`.
8. **Show one-line decision summary** before kicking off the run — so silent choices aren't invisible:
   > *"Classified as Stage 2 (research → email pipeline). 15 prompts synthesized from your README. Grounding-faithfulness grader enabled. 6 candidates wiring up across Anthropic + OpenAI. Running now."*

### 4.2 When things don't fit

Three fallbacks, that's it — don't try to cover everything:
- **Can't read the repo** (private, 404, too large) → ask for a local path or fall back to free-text Q1.
- **No agent signal at all** → tell the user honestly and fall back to free-text Q1.
- **Classification confidence low** → default to Stage 1, note it in the summary so the user can correct.

Other failures degrade to "describe what you want to benchmark in 1-2 sentences" — same fallback as the existing flow.

### 4.3 Budget

≤ 12 `gh api` calls per repo. ≤ 1 added Sonnet call beyond the existing dataset-synth call (used only when surface-scan signals conflict). Target ≤ 15 seconds from URL paste to "running now."

## 5. `methodology.md` reference content

New file at `skills/custom-model-bench/methodology.md`. Internal reference Claude consults during silent analysis. **Not shown to users.**

Target: dense reference, not docs prose. Roughly 200-400 lines.

### Structure

**Top-of-file decision tree** — compact text flowchart so Claude can hit the right section fast.

**Section A — The 3-stage framework.** For each stage: definition (1-2 sentences), detection signals, recommended grader, default scaffold shape, one or two anti-patterns.

**Section B — Grader taxonomy by output type.** Lookup table:

| Output shape | Grader | Notes |
|---|---|---|
| Structured JSON | Schema-validation | Cheapest, most reliable |
| Short prose / classification | Regex / exact-match | If answers enumerable |
| Long prose | LLM-judge (Sonnet 4.6, 3 runs) | Report mean ± stddev |
| Multi-stage outputs | Hybrid (deterministic per-stage + LLM grounding) | Stage 2 default |

**Section C — Context-engineering patterns.** *Single paragraph* referencing Lance Martin's 7 patterns. Patterns inform what's worth measuring (e.g., "if Cache Context is detected, surface cache hit rate") but don't change the stage classification. Annotated as scaffold metadata only.

**Section D — Hard "do not scaffold" rules.** Initial four anti-patterns Claude must refuse:
1. Don't average across grader categories into a single "overall quality" number.
2. Don't use single-pass holistic grading on Stage 2 pipelines.
3. Don't omit harness configuration from scaffold metadata.
4. Don't propose <10 or >30 dataset rows without an explicit user reason.

Expandable in iteration as new footguns surface — start small.

## 6. Smart iteration loop

Where methodology actually surfaces — *after* the user has seen results. Upgrades the existing "what next?" loop in `SKILL.md` to be **methodology-aware and stage-aware**.

After every run, Claude picks **one** contextual next step from a stage-keyed catalog. Stateless tracking — looks at the runs/ dir and conversation context, not a separate state file.

### Catalog (initial set, expandable)

**Stage 1:** swap prompt and re-run · add edge-case prompts · add another model tier.

**Stage 2:** walk through what the grounding grader caught · split capability vs. regression rows · vary the stage-2 prompt while holding stage-1 constant.

**Stage 3:** wire up the adapter so we can vary harness too (the v0.5 hand-off — Claude says *"adapter runner ships next, but we can prep the contract now"*) · add more models to surface harness-vs-model effect.

**Cross-cutting:** show run history · generate a shareable summary · run another scope.

### Style

- One suggestion per turn. No dumps.
- Cite methodology only when the suggestion is non-obvious — terse one-liner, not a lecture.
  > *"Stage 2 pipelines tend to hide hallucinations between stages — that's what the grounding-faithfulness grader is for."*
- Never auto-execute. Always *"Want me to X?"* → wait.
- Failed-run case: first suggestion is always *"The last run failed at <stage>. Want me to look at the error?"*

## 7. How we know it's working

Three walkthrough scenarios — not five, not exhaustive. Pick the most informative cases:

1. **`code-review-agent`** (Stage 3). Must classify correctly, detect both harnesses, ask the one targeted follow-up, scaffold both with stub adapters, run model-swap, offer the v0.5 hand-off in the iteration loop. **The headline pitch *"I see two harnesses, want to compare them?"* must surface on first contact.**
2. **A simple Stage 1 repo** (any small Anthropic-SDK example). Must classify as Stage 1, scaffold without follow-ups, run, offer the "swap prompt" suggestion afterward.
3. **A non-agent repo** (e.g., a static-site generator). Must fail gracefully with the "describe what you want to benchmark" fallback. Must NOT autoscaffold garbage.

A "passed" walkthrough means the conversation shape matches what this spec describes.

## 8. Decisions worth remembering

| # | Decision | Why |
|---|---|---|
| D1 | v0.4 ships task-extraction (model-swap) only; harness-invocation runner is v0.5. | Keeps v0.4 shippable; v0.5 commits to the contract once we have evidence. |
| D2 | Keep the four locked questions. | They're deliberate friction-with-attraction. Smart part lives behind, not instead. |
| D3 | Methodology surfaces *after* results, not before. | Per user feedback: too much upfront friction loses people before they see value. |
| D4 | At most one user-facing follow-up during silent analysis. | Same friction principle, applied to the repo path. |
| D5 | `methodology.md` is separate from `SKILL.md` and not user-facing. | Reusable across commands, improvable in isolation. |
| D6 | Stateless suggestion tracking in the iteration loop. | Simpler. Add state later if repetition becomes a real problem. |
| D7 | Stage 3 stub adapter is a TODO marker, not a contract. | Punt the contract to v0.5 — avoid over-specifying ahead of evidence. |
