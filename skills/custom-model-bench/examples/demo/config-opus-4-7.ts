import type { CandidateConfig } from "../../scripts/types";

export const candidate: CandidateConfig = {
  provider: "anthropic",
  model: "claude-opus-4-7",
  systemPrompt: "You are a concise assistant. Answer in one sentence.",
  maxOutputTokens: 200,
};
