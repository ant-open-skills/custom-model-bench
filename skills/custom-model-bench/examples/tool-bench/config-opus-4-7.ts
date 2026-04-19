import type { CandidateConfig } from "../../scripts/types";
import { TOOL_BENCH_TOOLS, TOOL_BENCH_SYSTEM } from "./tools";

export const candidate: CandidateConfig = {
  provider: "anthropic",
  model: "claude-opus-4-7",
  systemPrompt: TOOL_BENCH_SYSTEM,
  maxOutputTokens: 800,
  tools: TOOL_BENCH_TOOLS,
  maxTurns: 6,
};
