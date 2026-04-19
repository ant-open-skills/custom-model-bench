import type { CandidateConfig } from "../../scripts/types";

export const candidate: CandidateConfig = {
  provider: "xai",
  model: "grok-4.20-0309-reasoning",
  systemPrompt: "You are a concise assistant. Answer in one sentence.",
  maxOutputTokens: 200,
};
