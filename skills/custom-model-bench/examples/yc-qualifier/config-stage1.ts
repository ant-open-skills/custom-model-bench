/**
 * Stage 1 of the YC prospect qualifier — research-only pass.
 * Default candidate: Claude Sonnet 4.6 (strong balanced-tier agentic model).
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
  temperature: 0,
  maxOutputTokens: 2000,
  tools: [githubLookup, linkedinEnrich, webFetch],
  maxTurns: 10,
};
