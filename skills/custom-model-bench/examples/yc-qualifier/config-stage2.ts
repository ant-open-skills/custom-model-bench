/**
 * Stage 2 of the YC prospect qualifier — email drafter.
 *
 * Takes a ProspectProfile JSON (the output of Stage 1) as the user prompt
 * and produces an EmailDraft JSON. Single-turn, no tools — the prompt is
 * the only source of truth, and the never-fabricate rule in the system
 * prompt is what we lean on (and what Phase E.3's grounding faithfulness
 * grader verifies).
 *
 * Default candidate: Sonnet 4.6 via Vercel — cheap baseline. CAgent SDK
 * variants can be added for the same head-to-head story we ran on Stage 1.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CandidateConfig } from "../../scripts/types";

const HERE = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = readFileSync(join(HERE, "system-prompt-stage2.md"), "utf8");

export const candidate: CandidateConfig = {
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  systemPrompt: SYSTEM_PROMPT,
  maxOutputTokens: 1500,
};
