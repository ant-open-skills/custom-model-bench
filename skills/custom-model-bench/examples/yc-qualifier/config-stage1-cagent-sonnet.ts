/**
 * Stage 1 — Claude Sonnet 4.6 driven by the Claude Agent SDK runtime.
 * Same task, dataset, tools, and graders as config-stage1.ts; the only thing
 * that changes is how the model is invoked (CAgent SDK vs. Vercel AI SDK).
 * Set MOCK_TOOLS=1 in the environment to use the deterministic fixtures.
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
  model: "claude-sonnet-4-6",
  systemPrompt: SYSTEM_PROMPT,
  maxOutputTokens: 2000,
  tools: [githubLookup, linkedinEnrich, webFetch],
  maxTurns: 10,
  runtime: "cagent-sdk",
};
