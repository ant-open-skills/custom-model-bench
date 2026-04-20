---
description: Run a benchmark comparison on the named scope. Without a scope, list available ones and ask.
argument-hint: [scope-name]
---

Run the comparison runner on the scope `$ARGUMENTS`.

If `$ARGUMENTS` is empty, list the scopes that exist in `skills/custom-model-bench/examples/` and ask the user which one to run. Don't guess.

If `$ARGUMENTS` is set, validate it exists at `skills/custom-model-bench/examples/<scope>/dataset.jsonl`. If it doesn't, tell the user what scopes ARE available and stop.

To run:

- For the YC qualifier scope (real APIs, costs ~$5–80 depending on what's enabled), use `bun bench:yc-qualifier`.
- For the mocked-tools version, use `bun bench:yc-qualifier:mock` (cheap, deterministic).
- For other scopes, use the matching script in `package.json` (`bench:tools`, `bench:reasoning`, `bench:tiers:*`, etc.) or fall back to `bun run skills/custom-model-bench/scripts/run-comparison.ts skills/custom-model-bench/examples/<scope>`.

Cost-control env flags (set before the command if the user hasn't asked for full pipeline):
- `MOCK_TOOLS=1` — use deterministic fixtures instead of real APIs
- `SKIP_JUDGE=1` — skip the 3-run Opus judge in Stage 2 pipelines (big saving)
- `SKIP_GROUNDING=1` — skip the Sonnet claim extractor in Stage 2 pipelines

If the scope has Stage 2 (`config-stage2*.ts` exists in the dir) and the user hasn't said "full pipeline", **ask before spending real Opus judge budget.**

Stream the runner's output so the user sees the leaderboard as it lands. When the run completes, tell the user the path to the new comparison JSON and offer `/custom-model-bench:bench-view` to inspect.
