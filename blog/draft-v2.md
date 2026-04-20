<!--
custom-model-bench — v2 blog draft
Written: 2026-04-18
Status: DRAFT v2. Phase E.4 numbers from
examples/yc-qualifier/runs/comparison_2026-04-19T23-50-28-504Z.json (4-candidate, full pipeline).
Wider lineup framing references comparison_2026-04-19T23-12-16-823Z.json (15-candidate, Stage 1 only).
-->

# Same model, two SDKs, two different right answers

I ran Claude Sonnet 4.6 through two different SDKs on the same task, with the same tools, against the same 15-case dataset. One run was 3.5x cheaper. The other produced slightly better-rated emails. Both findings are real. Picking between them is the actual job.

That's the headline I almost wrote, and the one v1 of this post almost shipped: "same model, two runtimes, the Claude Agent SDK costs ~3.6x more, here are the receipts." That story is still half-true. The Vercel AI SDK path on Sonnet 4.6 finished in 5.5 turns at $0.026 per task. The Claude Agent SDK path on the same model took 10.7 turns at $0.091 per task. Same model. Same dataset. Same tools. Different orchestration layer. The cost spread is real.

But when I looked at the rubric scores and the grounding grader together, the cleaner story fell apart. The Claude Agent SDK's extra turns *do* buy slightly higher rubric scores — the judge gave the CAgent emails 4.84 overall vs. 4.68 for Vercel, with most of the gap on the *relevance* dimension (4.64 vs. 4.22). At the same time, the deterministic grounding grader caught CAgent making up *more* facts: 6.0% fabrication rate vs. 3.9%, and 9 perfectly-grounded rows out of 15 vs. 11. So the extra turns and tokens buy you softer wins (specificity, "this email feels more thoughtful") and lose you a measurable amount of factual reliability.

There is no clean winner here. There is a tradeoff. That tradeoff is exactly what `custom-model-bench` is designed to surface — and exactly what a flat leaderboard would average into mush.

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

**Speed bench**: 12 candidates on single-turn trivia. Raw latency and $/task, no tools.
**Reasoning bench**: 12 candidates on hard science and math. Exact-match grader. Where reasoning tiers earn their price tag.
**Tool bench**: 12 candidates on mocked multi-tool tasks — `github_lookup`, `linkedin_enrich`, `web_fetch` — with deterministic fixtures behind a `MOCK_TOOLS=1` flag. Grader checks whether `expected_tools` appeared in the trace.

And then the flagship.

## The flagship: a YC-style prospect qualifier

The agentic scope runs a two-stage workflow. Stage 1 researches a prospect company and emits a structured `ProspectProfile` (GitHub org, tech stack overlap, contacts, fit score). Stage 2 drafts a tailored outreach email grounded in the Stage 1 output, with a schema that requires explicit `grounding_references` back to specific profile fields. Then the kit runs an Opus 4.7 rubric judge and a separate deterministic grounding-faithfulness grader against both outputs.

The voiceover for the demo promises four metrics most benchmarks don't measure:

- **Task completion.** Did the agent actually produce the required output, or bail halfway?
- **Recovery rate.** When a tool call failed, did the agent pivot and succeed through another path, or dead-end?
- **Cost per successful task.** Not $/M tokens — $/task that actually got there.
- **Grounding faithfulness.** Are the claims in the final email actually in the research output, or invented?

The aggregate JSON carries 11 agentic metrics on top of the 4 baseline ones. The Phase E.4 run pushed four candidates through the entire pipeline end-to-end on real APIs — Stage 1 research, Stage 2 drafting, judge, grounding grader. Total spend: **$8.91** across 60 prospect cases (15 per candidate).

| Candidate | Turns (mean) | $/task | Task completion | Judge overall | Fabrication rate | Perfect-grounded rows |
|---|---|---|---|---|---|---|
| Sonnet 4.6 — Vercel AI SDK | 5.5 | $0.026 | 1.00 | 4.68 | 3.9% | 11/15 |
| Sonnet 4.6 — CAgent SDK | 10.7 | $0.091 | 1.00 | 4.84 | 6.0% | 9/15 |
| Opus 4.7 — CAgent SDK | 4.7 | $0.084 | 1.00 | 4.87 | 6.5% | 9/15 |
| Haiku 4.5 — CAgent SDK | 9.7 | $0.030 | 0.93 (14/15) | 4.71 | 15.7% | 7/14 |

(n=15 per candidate, real API calls. Source: `comparison_2026-04-19T23-50-28-504Z.json`. A wider 15-candidate Stage-1-only run across Anthropic, OpenAI, Google, and xAI is in `comparison_2026-04-19T23-12-16-823Z.json` — same kit, same dataset, broader provider sweep.)

## The bidirectional tradeoff: same model, two runtimes

Look at the two Sonnet 4.6 rows.

|  | Turns | $/task | Latency p50 | Judge overall | Fabrication |
|---|---|---|---|---|---|
| Sonnet 4.6 — Vercel AI SDK | 5.5 | $0.026 | 33.8s | 4.68 | 3.9% |
| Sonnet 4.6 — CAgent SDK | 10.7 | $0.091 | 73.7s | 4.84 | 6.0% |

That's roughly **2x the turns, 3.5x the cost, 2.2x the latency** on the CAgent path — same model, same dataset, same tools, different orchestration. Under the simple "cost spread" framing this looks like a clean indictment. The judge column complicates that.

The CAgent run scores +0.16 higher overall on the rubric, and the per-dimension breakdown shows where:

| Dimension | Vercel | CAgent | Δ |
|---|---|---|---|
| Grounding (judge's read) | 4.98 | 4.96 | -0.02 |
| Specificity | 4.60 | 4.82 | +0.22 |
| Relevance | 4.22 | 4.64 | **+0.42** |
| Call to action | 4.91 | 4.93 | +0.02 |

Almost the entire gap is in *relevance* — the judge consistently feels the CAgent emails fit the prospect better. That's plausibly the extra turns at work: more time spent re-reading the profile, more passes at tying the message to specific stack facts. The richer system context, the deliberative loop, the planning overhead — on this scope it doesn't just burn tokens, it produces a draft the judge prefers.

Now look at the deterministic grounding column. The CAgent emails fabricate facts at **6.0% vs. 3.9%** for Vercel, and only **9 of 15** rows come back with zero hallucinations vs. **11 of 15** for Vercel. The same extra turns that give the judge a more "thoughtful" feel are also giving the model more chances to invent things — a stack detail it half-remembers, a customer logo not in the profile, a partnership it interpolated.

So: CAgent buys softer wins (specificity, relevance, judged polish) and loses on factual grounding. Vercel buys cost, latency, and a tighter grip on what's actually in the source material. Neither is universally better. If you're sending sales emails where the bar is "no made-up facts about the prospect, ever," the Vercel/Sonnet path is the safer default. If your output is judged on perceived relevance and specificity and a small fabrication rate is acceptable, the CAgent path earns its overhead.

The Claude Agent SDK is built around subagent dispatch, session persistence, and a richer system context that includes tool schemas as part of a deliberative loop. On a single-stage research task with deterministic tools, that overhead is real and visible — and on this scope, the rubric/grounding tradeoff is what it buys you. The calculus flips on multi-stage workflows or anything closer to a coding agent than a form-filler. The kit's own Opus 4.7 judge runs on the CAgent SDK because rubric scoring benefits from the deliberative loop.

## Opus is the rubric champion. Whether to pay for it depends.

Opus 4.7 via CAgent comes in as the highest-scoring candidate on the judge (4.87 overall, perfect 5.00 on grounding) and does it in the fewest turns (4.7). It also fabricates at 6.5% — slightly worse than CAgent Sonnet on the deterministic grader, despite the perfect judge-grounding score. (That tension between "judge says grounding is perfect" and "deterministic grader counts fabricated claims" is exactly why I keep both.)

The cost story:

- Opus / CAgent: $0.084/task, judge 4.87
- Vercel Sonnet:  $0.026/task, judge 4.68

That's **3.2x the cost for a +0.19 rubric gain.** Worth it if you're judge-quality-sensitive. Not worth it if the bar is "no hallucinations and ship." This is the kind of question every team gets asked once a quarter and never has the data to answer cleanly.

Haiku 4.5 / CAgent rounds out the lineup at $0.030/task — competitive on cost with Vercel Sonnet — but its grounding numbers are the worst of the four (15.7% fabrication, 7 of 14 perfect rows, and one row failed outright). The cheaper price comes with measurably more invention.

## What the new metrics caught that a leaderboard wouldn't

This is the part I want to underline, because it's the actual point of the kit.

A typical model leaderboard reports an overall score per candidate. If you ran one against the four candidates above, you'd get something like a single column with values around 4.7–4.9, and the leaderboard would tell you Opus wins by a hair. Done.

What that leaderboard would *not* tell you:

- That the +0.16 the judge gives CAgent Sonnet over Vercel Sonnet is concentrated almost entirely in one dimension (relevance, +0.42) and is roughly zero on grounding and call-to-action.
- That on the *same* email pair, the deterministic grounding grader points the other way — CAgent fabricates 1.5x more often.
- That the average hides a per-row pattern: Vercel produces more perfect-grounded rows (11/15) than any other candidate, including Opus (9/15).

A flat overall score would average all of that into a number that says "they're basically the same, pick whichever." The kit's per-axis honest reporting says: they're *not* the same, they're trading different things off, and the right pick depends on whether your product cares more about judged relevance or about a deterministic guarantee that nothing was made up.

Same for cost. A leaderboard might rank by $/task and crown Vercel Sonnet. The kit shows you the $0.026 number alongside the rubric and grounding numbers, so you can see what you're trading for the savings.

That's the value the kit is built around. Not a scoreboard. A diagnostic.

## Grounding faithfulness: catching fabrication by name

The grounding grader is the piece I'm most confident in. It's deterministic, claim-extraction-based, and it catches fabrication by name rather than by vibe.

The grader is two-stage: Sonnet 4.6 extracts every factual claim from the email as a JSON array (named entities, numbers, URLs, tech terms, specific events). Each claim is checked against the `ProspectProfile` via normalized substring plus entity match. Prose paraphrasing is ignored. Named-entity claims that don't match the profile get flagged.

To prove it works I hand-crafted a deliberately-fabricated outreach email for Supabase: a made-up "$80M Series C", an invented Adobe partnership, a fake "12M developers" stat, a fabricated LLaMA-3 finetune, a fictional Snowflake integration. The TDD result:

- **Well-grounded Supabase email:** 0% fabrication. All 8 claims grounded.
- **Fabricated Supabase email:** 100% fabrication. **11/11 hallucinations named** — "$80M Series C", "Adobe", "12M developers", "LLaMA-3", "Snowflake", and the rest, each surfaced by name in `hallucinated_claims`.

Cost on the full Phase E.4 pipeline: $0.28–$0.30 per candidate for extractions. Cheap, and worth it. That's the guarantee most "LLM judges" can't give you: when the output is making things up, you get back a list of the specific claims that were made up. The "CAgent fabricates more than Vercel" finding above only exists because this grader exists.

## Honest findings that don't flatter the story

A benchmark post that only shows flattering results isn't a benchmark post, it's marketing. Three things that came out of the Phase E.4 run that I'm obligated to name:

**1. Every candidate is bad at predicting fit score.** The `fit_score` ground-truth check has accuracy in the **0.20–0.53** range across the four runs. Best case is Sonnet/CAgent at 0.53. Opus is the worst at 0.20. Even the best candidate is essentially a coin flip on "is this prospect actually a good fit for the product." Every model — every runtime — struggles here. My read: fit score is a judgment call that depends on soft signals the research step doesn't reliably surface, and the current Stage 1 prompt doesn't push the model hard enough toward grounded scoring. Next iteration will tighten the scoring rubric and the system prompt. For now, the kit surfaces the weakness instead of hiding it.

**2. Tool-call budgets get blown by almost everyone.** The `efficiency.rate` — the fraction of cases that stayed inside the configured `max_tool_calls` budget — was **0.13 for Vercel Sonnet, 0.20 for Haiku/CAgent, and 0.07 for Sonnet/CAgent**. Only Opus/CAgent stayed within budget every time (1.00), and that was driven by the same aggressive early termination that hurt its recovery rate (0.40 — when a tool misbehaved, Opus tended to stop trying instead of pivoting). The honest read: my `max_tool_calls` defaults are too tight for how Sonnet actually explores a prospect. Either the defaults need to be raised or the prompt needs to push for more focused searching. Probably both. This is real signal, not a bug.

**3. The judge variance came back at 15-row scale, and that's a relief.** The Opus 4.7 rubric judge runs three independent sessions per case and reports `std` across them. On the early 3-row smoke tests, std came back as 0 on every dimension. Read one way that meant the judge was reliable; read another, it meant I couldn't tell "reliable" from "stuck." On the full 15-row run, the std opens up — relevance shows std-of-means up to 0.80 on the Vercel run, specificity around 0.36–0.44 across candidates, grounding stays tight at 0–0.17. So the judge *is* reliable on the dimensions where it should be (grounding is nearly deterministic, call-to-action close behind) and *does* spread on the more subjective dimensions (relevance, specificity), which is what you'd want a working rubric to do. The "low std = reliable rubric" hypothesis was right — but only when you actually have the sample size to tell. Three rows wasn't enough to know.

That said, the judge is still single-family: an Opus 4.7 judge scoring outputs that include other Anthropic models. I cannot rule out systematic favoritism toward Anthropic-generated emails. The next phase adds a cross-model jury — three independent judges from different providers, majority vote. Until that ships, treat the rubric scores as directional and the deterministic grounding numbers as the harder evidence.

If you're reading this wanting a kit that will confirm your prior, look elsewhere. This one is designed to surface the places your model is weak.

## The fit score, re-weighted

The viewer has a composite fit score over (accuracy, speed, cost, reliability) with four built-in profiles — balanced, speed, cost, reliability. Change the profile, change the winner. This is deliberate. Different teams care about different things, and the point of the viewer is to let you put your thumb on the scale you actually care about, not to pretend there's one right answer.

On the Phase E.4 flagship today: speed-weighted favors **Opus / CAgent** (fewest turns, lowest latency). Cost-weighted favors **Vercel Sonnet** ($0.026/task, the cheapest path that completes 100%). Reliability-weighted is the interesting one — it splits between **Vercel Sonnet** (best deterministic grounding, fewest fabrications) and **Sonnet / CAgent** (highest task completion with perfect recovery rate and best fit-score accuracy). Balanced is closer than any single column would suggest, and the viewer shows it as such.

## Beyond the four — a wider lineup

The Phase E.4 numbers above come from a focused 4-candidate full-pipeline run. The kit has also been pointed at **12 models across 4 providers** (Anthropic Sonnet/Opus/Haiku, three Gemini tiers, three GPT-5.4 tiers, three Grok 4 tiers) on the Stage 1 research scope — `comparison_2026-04-19T23-12-16-823Z.json`. I'm holding the rubric and grounding numbers in this post to the 4-candidate full-pipeline run, because those are the candidates that went through every grader end-to-end. A full 15-candidate end-to-end run is queued; v3 will refresh with the wider numbers.

## Install and run your own scope

The interactive setup — `/bench-setup` — walks you through picking a use case, choosing bring-your-own-dataset or a template, and scaffolding a scope directory. Ships in 0.2. Today, drop a `dataset.jsonl` and one or more `config-*.ts` files into `examples/<your-scope>/` and run:

```
bun run scripts/run-comparison.ts examples/<your-scope>
```

Viewer is `bun viewer-v2`. To add a candidate: copy a `config-*.ts`, change the provider/model/runtime field. `runtime` is `"vercel"` (default) or `"cagent-sdk"`. The Vercel path gets you all 4 providers; the CAgent path gets you the Anthropic tiers with the full Claude Agent SDK orchestration. Real API keys in `.env`. Mocked tool handlers behind `MOCK_TOOLS=1`.

## What's next

Cross-model jury for the rubric judge (three providers, majority vote) to break the single-family bias on the grounding rubric. The full 15-candidate end-to-end run, so the bidirectional tradeoff story can be tested across providers, not just across runtimes. More scopes. A slash-command suite (`/bench-setup`, `/bench-run`, `/bench-view`, `/bench-add-candidate`, `/bench-add-dataset`) in 0.2. A workflow-diagram view in the viewer so the shape of an agentic pipeline is legible at a glance, not just the traces.

If you're picking a model or an SDK for production, the ask is the same as it was in v1, with a sharper edge: run your task through this, look at turns and recovery and grounding *alongside* cost and rubric, and don't trust the leaderboard that averages them into a single number. The cost spread is real. So is the quality spread. They point in different directions. That's the finding.

The kit is at `github.com/ant-open-skills/custom-model-bench`. PRs and issues welcome.

— Hendrik
