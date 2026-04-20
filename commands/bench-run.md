---
description: Run a benchmark comparison on the named scope. Without a scope, list available ones and ask.
argument-hint: [scope-name]
---

Run the comparison runner on the scope `$ARGUMENTS`.

All commands below run from the plugin's installed root via `${CLAUDE_PLUGIN_ROOT}` — that's where `package.json`, `scripts/`, and the `examples/<scope>/` directories live. The user's current working directory doesn't matter.

**Dependency check first.** If `${CLAUDE_PLUGIN_ROOT}/node_modules/` does not exist, run `cd "${CLAUDE_PLUGIN_ROOT}" && bun install` first. Tell the user "first-time setup — installing dependencies, ~30s." Otherwise skip.

**API key check.** If `${CLAUDE_PLUGIN_ROOT}/.env` does not exist OR doesn't contain `ANTHROPIC_API_KEY=`, tell the user to create it: `cp "${CLAUDE_PLUGIN_ROOT}/.env.example" "${CLAUDE_PLUGIN_ROOT}/.env"` and fill in at least the Anthropic key. Then stop and wait for them. (Mocked-tools runs still need the LLM keys.)

If `$ARGUMENTS` is empty, list the scopes that exist in `${CLAUDE_PLUGIN_ROOT}/skills/custom-model-bench/examples/` and ask the user which one to run. Don't guess.

If `$ARGUMENTS` is set, validate it exists at `${CLAUDE_PLUGIN_ROOT}/skills/custom-model-bench/examples/<scope>/dataset.jsonl`. If it doesn't, tell the user what scopes ARE available and stop.

To run:

- For the YC qualifier scope (real APIs, costs ~$5–80 depending on what's enabled): `cd "${CLAUDE_PLUGIN_ROOT}" && bun bench:yc-qualifier`.
- For the mocked-tools version: `cd "${CLAUDE_PLUGIN_ROOT}" && bun bench:yc-qualifier:mock` (cheap, deterministic).
- For other scopes, use the matching script in `package.json` (`bench:tools`, `bench:reasoning`, `bench:tiers:*`, etc.) or fall back to `cd "${CLAUDE_PLUGIN_ROOT}" && bun run skills/custom-model-bench/scripts/run-comparison.ts skills/custom-model-bench/examples/<scope>`.

Cost-control env flags (set before the command if the user hasn't asked for full pipeline):
- `MOCK_TOOLS=1` — use deterministic fixtures instead of real APIs
- `SKIP_JUDGE=1` — skip the 3-run Opus judge in Stage 2 pipelines (big saving)
- `SKIP_GROUNDING=1` — skip the Sonnet claim extractor in Stage 2 pipelines

If the scope has Stage 2 (`config-stage2*.ts` exists in the dir) and the user hasn't said "full pipeline", **ask before spending real Opus judge budget.**

Stream the runner's output so the user sees the leaderboard as it lands. When the run completes, tell the user the path to the new comparison JSON and offer `/custom-model-bench:bench-view` to inspect.
