/**
 * Stage 1 — Claude Haiku 4.5 (Vercel AI SDK runtime).
 * Same task, dataset, tools, and graders as config-stage1.ts; only the model
 * changes. Set MOCK_TOOLS=1 in the environment to use the deterministic fixtures.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CandidateConfig } from "../../scripts/types";
import { githubLookup } from "../../scripts/tools/github_lookup";
import { linkedinEnrich } from "../../scripts/tools/linkedin_enrich";
import { webFetch } from "../../scripts/tools/web_fetch";

const HERE = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = readFileSync(join(HERE, "system-prompt.md"), "utf8");

export const candidate: CandidateConfig = {
  provider: "anthropic",
  model: "claude-haiku-4-5",
  systemPrompt: SYSTEM_PROMPT,
  maxOutputTokens: 2000,
  tools: [githubLookup, linkedinEnrich, webFetch],
  maxTurns: 10,
};
