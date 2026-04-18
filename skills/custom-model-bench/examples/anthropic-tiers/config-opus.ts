import type { CandidateConfig } from "../demo/config";

export const candidate: CandidateConfig = {
  provider: "anthropic",
  model: "claude-opus-4-7",
  systemPrompt: "You are a concise assistant. Answer in one sentence.",
  // Opus 4.7 deprecates the `temperature` parameter, so leave it unset.
  maxOutputTokens: 200,
};
