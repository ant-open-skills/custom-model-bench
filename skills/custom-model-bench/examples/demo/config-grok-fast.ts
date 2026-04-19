import type { CandidateConfig } from "../../scripts/types";

export const candidate: CandidateConfig = {
  provider: "xai",
  model: "grok-4-1-fast-non-reasoning",
  systemPrompt: "You are a concise assistant. Answer in one sentence.",
  temperature: 0,
  maxOutputTokens: 200,
};
