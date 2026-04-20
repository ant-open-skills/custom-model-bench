---
description: Build and serve the custom-model-bench viewer; print the URL.
---

Build the viewer data file and start the local web server so the user can see the latest comparison results.

All commands below run from the plugin's installed root via `${CLAUDE_PLUGIN_ROOT}` — that's where `package.json`, `viewer-v2/`, and the `examples/<scope>/runs/` directories live. The user's current working directory doesn't matter.

Steps:

1. **Dependency check.** If `${CLAUDE_PLUGIN_ROOT}/node_modules/` does not exist, run `cd "${CLAUDE_PLUGIN_ROOT}" && bun install` first. Tell the user "first-time setup — installing dependencies, ~30s." Otherwise skip.
2. Build the viewer data: `cd "${CLAUDE_PLUGIN_ROOT}" && bun viewer-v2:build`.
3. Start the viewer server in the background: `cd "${CLAUDE_PLUGIN_ROOT}" && bun viewer-v2:serve` (detached — it stays running until killed).
4. Tell the user the URL the viewer is serving at (printed in the serve output, typically `http://localhost:4041`).
5. Briefly summarize which scopes the viewer is showing and how many history points each has, sourced from the build-data.ts output.

If `bun` isn't installed at all, surface that clearly — the user needs to `brew install bun` or equivalent.

If the user wants the v1 viewer instead of v2, use `bun viewer:build` and `bun viewer:serve` (typically `http://localhost:4040`). Default is always v2.
