---
description: Build and serve the custom-model-bench viewer; print the URL.
---

Build the viewer data file and start the local web server so the user can see the latest comparison results.

Steps:

1. Run `bun viewer-v2:build` to regenerate `viewer-v2/data.js` from the latest `comparison_*.json` files in every scope.
2. Run `bun viewer-v2:serve` in the background (it stays running until killed).
3. Tell the user the URL the viewer is serving at (printed in the serve output, typically `http://localhost:4041`).
4. Briefly summarize which scopes the viewer is showing and how many history points each has, sourced from the build-data.ts output.

If `bun` isn't installed or the project isn't `cd`'d into `custom-model-bench/`, surface that clearly rather than silently failing.

If the user wants the v1 viewer instead of v2, use `bun viewer:build` and `bun viewer:serve` (typically `http://localhost:4040`). Default is always v2.
