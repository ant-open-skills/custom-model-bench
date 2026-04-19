import type { CandidateConfig } from "../../scripts/types";
import { TOOL_BENCH_TOOLS, TOOL_BENCH_SYSTEM } from "./tools";

export const candidate: CandidateConfig = {
  provider: "anthropic",
  model: "claude-haiku-4-5",
  systemPrompt: TOOL_BENCH_SYSTEM,
  temperature: 0,
  maxOutputTokens: 800,
  tools: TOOL_BENCH_TOOLS,
  maxTurns: 6,
};
