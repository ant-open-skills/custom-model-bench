import type { CandidateConfig } from "../demo/config";
import { TOOL_BENCH_TOOLS, TOOL_BENCH_SYSTEM } from "./tools";

export const candidate: CandidateConfig = {
  provider: "xai",
  model: "grok-4",
  systemPrompt: TOOL_BENCH_SYSTEM,
  temperature: 0,
  maxOutputTokens: 800,
  tools: TOOL_BENCH_TOOLS,
  maxTurns: 6,
};
