<!--
custom-model-bench — v1 blog draft
Written: 2026-04-18
Status: DRAFT. Main thread to edit and ship. Numbers checked against
examples/yc-qualifier/runs/comparison_2026-04-19T21-18-09-646Z_D_reaggregated.json.
-->

# Same model, two SDKs, 3.6x the cost

I ran Claude Sonnet 4.6 through two different SDKs on the same task, with the same tools, against the same 15-case dataset. The Vercel AI SDK version finished in 4.8 turns and cost $0.026 per task on average. The Claude Agent SDK version finished in 9.7 turns and cost $0.095 per task. Same model. Same task. Same tools. Different orchestration layer.

If you're about to pick an agent framework for production, that spread matters. It's also not a story about one SDK being better — they're optimized for different jobs. The point is that *you cannot see this kind of tradeoff from a model leaderboard.* You have to measure it on your task.

That's what `custom-model-bench` is for. It's a benchmarking kit you run against your own workflow, not another public ranking of LLMs in the abstract. The code is open, the install is two commands, and this post walks through what it does and what I found with it.

```
claude plugin marketplace add ant-open-skills/custom-model-bench
claude plugin install custom-model-bench@ant-open-skills
```

Repo: `github.com/ant-open-skills/custom-model-bench`.

---

## What this kit is, and what it isn't

It is:

- A plugin for Claude Code that ships four benchmark scopes out of the box: **Speed bench** (single-turn trivia), **Reasoning bench** (hard science/math), **Tool bench** (mocked multi-tool calls), and an **agentic flagship** (a YC-style prospect qualifier that researches a company, drafts outreach, and gets judged on grounding).
- A way to run *your own* task across 4 providers (Anthropic, OpenAI, Google, xAI) via the Vercel AI SDK adapter, and across a second runtime — the Claude Agent SDK — for the Anthropic tiers. Same pipeline, swap provider via config file.
- A viewer that shows the tradeoffs with a re-weightable fit score: balanced, speed, cost, reliability. Different weighting, different winner. That's on purpose.

It is not:

- Another public leaderboard. The datasets are starter material. The point is you bring yours.
- A claim that the right model is the one that wins my demo. Your task is probably different.

## Architecture

```
 dataset.jsonl
      |
      v
 run-comparison.ts  ──►  [ Vercel AI SDK runtime ]  ──┐
      │                    (Anthropic/OpenAI/             │
      │                     Google/xAI)                   │
      │                                                   │
      └────────────────►  [ Claude Agent SDK runtime ]  ──┤
                            (Anthropic tiers only)        │
                                                          v
                         shared tools  +  graders  ──►  comparison_*.json
                                                          │
                                                          v
                                                        viewer-v2
```

Each candidate is a TypeScript config file. Each scope is a directory with a dataset, a set of configs, and (for agentic scopes) system prompts and a grading rubric. The runner parallelizes candidates, captures traces, and writes a single JSON that the viewer reads.

## Three scopes plus a flagship

**Speed bench** is 12 candidates answering single-turn trivia. It measures raw latency and $/task with no tool use or agent loop. It's the "how fast is this model on easy stuff" view.

**Reasoning bench** is 12 candidates on hard science and math. Exact-match grader. This is where reasoning tiers earn their price tag.

**Tool bench** is 12 candidates on mocked multi-tool tasks — `github_lookup`, `linkedin_enrich`, `web_fetch` — with deterministic fixtures behind a `MOCK_TOOLS=1` flag. The grader checks whether `expected_tools` appeared in the trace. This is where provider tool-calling quality diverges.

And then the flagship.

## The flagship: a YC-style prospect qualifier

The agentic scope runs a two-stage workflow: Stage 1 researches a prospect company and emits a structured `ProspectProfile` (GitHub org, tech stack overlap, contacts, fit score). Stage 2 drafts a tailored outreach email grounded in the Stage 1 output, with a schema that requires explicit `grounding_references` back to specific profile fields. Then the kit runs the rubric judge and a separate grounding-faithfulness grader against both outputs.

The voiceover for the demo promises four metrics most benchmarks don't measure:

- **Task completion.** Did the agent actually produce the required output, or bail halfway?
- **Recovery rate.** When a tool call failed, did the agent pivot and succeed through another path, or dead-end?
- **Cost per successful task.** Not $/M tokens — $/task that actually got there.
- **Grounding faithfulness.** Are the claims in the final email actually in the research output, or invented?

The aggregate JSON carries 11 agentic metrics on top of the 4 baseline ones. Here's what four candidates looked like on the Phase D re-aggregation — three via Claude Agent SDK (Haiku / Opus / Sonnet) and Sonnet 4.6 one more time via Vercel AI SDK:

| Candidate | Turns (mean) | $/task | Task completion | Recovery rate | Fit-score accuracy |
|---|---|---|---|---|---|
| Haiku 4.5 — CAgent SDK | 10.5 | $0.031 | 1.00 | 0.93 | 0.53 |
| Opus 4.7 — CAgent SDK | 4.3 | $0.077 | 0.93 | 0.33 | 0.20 |
| Sonnet 4.6 — CAgent SDK | 9.7 | $0.095 | 1.00 | 1.00 | 0.40 |
| Sonnet 4.6 — Vercel AI SDK | 4.8 | $0.026 | 1.00 | 1.00 | 0.40 |

(n=15 per candidate. Real API calls, not mocked. Source: `comparison_2026-04-19T21-18-09-646Z_D_reaggregated.json`.)

## The surprise: same model, two runtimes

Look at the two Sonnet 4.6 rows.

|  | Turns | $/task | Latency p50 |
|---|---|---|---|
| Sonnet 4.6 — Vercel AI SDK | 4.8 | $0.026 | 32.0s |
| Sonnet 4.6 — Claude Agent SDK | 9.7 | $0.095 | 78.9s |

**~2x the turns, ~3.6x the cost, ~2.5x the latency — same model.**

That's not an apples-to-oranges mix-up. Both runs use Sonnet 4.6 as the decision-making model. Both run the same 15 prospect-research cases. Both have the same tools wired in. The difference is entirely the orchestration layer.

The Claude Agent SDK is built around subagent dispatch, session persistence, and a richer system context that includes tool schemas as part of a deliberative loop. It's optimized for the kind of tasks where the agent has to plan, delegate to specialized subagents, recover from interleaved failures, and maintain state across a long workflow. That overhead — more tokens in the system prompt, more turns spent reasoning between tool calls, MCP-style tool-protocol framing — is real, and on a single-stage research task with deterministic tools, it doesn't buy much. Hence the extra turns and cost.

The Vercel AI SDK runs a flat tool loop: model call, tool calls, tool results, model call, final answer. Leaner, faster, cheaper on this kind of task.

On a single-stage research workflow, the Vercel path is plainly more efficient. That doesn't make it the right default. The Claude Agent SDK's orchestration earns its keep when the workflow is multi-stage, when you want subagent specialization, when session state across hours matters, or when you're building something closer to a coding agent than a form-filler. The calculus flips — and the judge side of this kit already runs on the CAgent SDK for exactly that reason (the Opus 4.7 judge uses the SDK because rubric-scoring benefits from the deliberative loop).

The number I'd want before picking either for production is this one: on *my* task, with *my* tools, what's the turns/cost/recovery tradeoff? That's the question the kit answers.

One caveat worth flagging: the Opus 4.7 row shows only 4.3 turns but 0.33 recovery rate and 0.93 task completion. Opus resolves faster on average but dead-ends more often when a tool misbehaves. Fewer turns is not automatically better — it can also mean giving up earlier. The viewer surfaces this by showing turns alongside recovery, not alone.

## Grounding faithfulness: catching fabrication by name

The grounding grader is the piece I'm most confident in. It's deterministic, claim-extraction-based, and it catches fabrication by name rather than by vibe.

To prove it works I hand-crafted a deliberately-fabricated outreach email for Supabase: a made-up "$80M Series C", an invented Adobe partnership, a fake "12M developers" statistic, a fabricated LLaMA-3 finetune, a fictional Snowflake integration. All of these are things Stage 1's real research did not surface.

The grader is a two-stage thing: Sonnet 4.6 extracts every factual claim from the email as a JSON array (named entities, numbers, URLs, tech terms, specific events). Each claim is checked against the `ProspectProfile` via normalized substring plus entity match. Prose paraphrasing is ignored. Named-entity claims that don't match the profile get flagged.

The results on the TDD fixture:

- **Well-grounded Supabase email:** 0% fabrication rate. All 8 extracted claims grounded.
- **Fabricated Supabase email:** 100% fabrication rate. **11/11 hallucinations named by the grader** — "$80M Series C", "Adobe", "12M developers", "LLaMA-3", "Snowflake", and the rest, each surfaced by name in `hallucinated_claims`.

Cost to run: $0.09 for the two extractions. Worth it.

That's the guarantee most "LLM judges" can't give you: when the output is making things up, you get back a list of the specific claims that were made up, and you can read them. No rubric-scoring ambiguity.

## Honest findings that don't flatter the story

A benchmark post that only shows flattering results isn't a benchmark post, it's marketing. Three things that came out of this run that I'm obligated to name:

**1. All four candidates are bad at predicting fit score.** The `fit_score` ground-truth check has accuracy in the 0.20–0.53 range across the four runs. Best case is Haiku 4.5 at 0.53. Even the best candidate is basically a coin flip on "is this prospect actually a good fit for the product." Every model — every runtime — struggles here. My read: fit score is a judgment call that depends on soft signals the research step doesn't reliably surface, and the current Stage 1 prompt doesn't push the model hard enough toward grounded scoring. Next iteration will tighten the scoring rubric and the system prompt. For now, the kit surfaces the weakness instead of hiding it.

**2. Tool-call budgets get blown 87% of the time.** The `efficiency.rate` on Sonnet/Haiku via CAgent SDK and Sonnet via Vercel is **0.13** — only 2 of 15 cases stayed within the configured `max_tool_calls`. Opus via CAgent was the exception at 1.00 but that was driven by aggressive early termination (the same behavior that tanked its recovery rate). The honest read: my `max_tool_calls` defaults are too tight for how Sonnet actually explores a prospect. Either the defaults need to be raised or the prompt needs to push for more focused searching. Probably both.

**3. The judge has zero variance. That's a red flag *and* a green flag.** The Opus 4.7 rubric judge runs three independent sessions per case and reports `std` across them. The result: std = 0 on every dimension. Read one way: the rubric is reliable, the judge is consistent, three runs are giving the same answer. Read another way: I can't distinguish "reliable" from "biased." The judge is Anthropic's flagship evaluating outputs that include Anthropic-model-generated emails. With a single-family judge I cannot rule out that the judge is systematically favorable to CAgent-SDK-generated emails. Next phase adds a cross-model jury — three independent judges from different providers, majority vote. Until that ships, treat the rubric scores as directional.

If you're reading this wanting a kit that will confirm your prior, look elsewhere. This one is designed to surface the places your model is weak.

## The fit score, re-weighted

The viewer has a composite fit score over (accuracy, speed, cost, reliability) with four built-in profiles — balanced, speed, cost, reliability. Change the profile, change the winner. This is deliberate. Different teams care about different things, and the point of the viewer is to let you put your thumb on the scale you actually care about, not to pretend there's one right answer.

On the flagship scope today: speed-weighted favors Opus via CAgent SDK (fewest turns). Cost-weighted favors Sonnet via Vercel AI SDK ($0.026/task). Reliability-weighted favors Sonnet via CAgent SDK (perfect task completion + recovery). Balanced is a closer call, and the viewer shows it as such.

## Install and run your own scope

The two-command install puts the plugin in place:

```
claude plugin marketplace add ant-open-skills/custom-model-bench
claude plugin install custom-model-bench@ant-open-skills
```

The interactive setup — `/bench-setup` — walks you through picking a use case, choosing bring-your-own-dataset or a template, and scaffolding a scope directory. Ships in 0.2. Today, you drop a `dataset.jsonl` and one or more `config-*.ts` files into `examples/<your-scope>/` and run:

```
bun run scripts/run-comparison.ts examples/<your-scope>
```

Viewer is `bun viewer-v2`.

To add a candidate: copy one of the existing `config-*.ts` files, change the provider/model/runtime field, done. `runtime` is `"vercel"` (default) or `"cagent-sdk"`. The Vercel path gets you all 4 providers; the CAgent path gets you the Anthropic tiers with the full Claude Agent SDK orchestration.

Real API keys in `.env` (one per provider you want to benchmark). Mocked tool handlers behind `MOCK_TOOLS=1` for reproducibility.

## What's next

Cross-model jury for the rubric judge (three providers, majority vote) to break the single-family bias on the grounding rubric. More scopes. More providers. A slash-command suite (`/bench-setup`, `/bench-run`, `/bench-view`, `/bench-add-candidate`, `/bench-add-dataset`) in 0.2. A workflow-diagram view in the viewer so the shape of an agentic pipeline is legible at a glance, not just the traces.

If you're picking a model or an SDK for production, the ask is simple: run your task through this, look at turns and recovery alongside cost, and don't trust the leaderboard that only shows you accuracy.

The kit is at `github.com/ant-open-skills/custom-model-bench`. PRs and issues welcome.

— Hendrik
