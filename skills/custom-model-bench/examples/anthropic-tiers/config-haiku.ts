import type { CandidateConfig } from "../demo/config";

export const candidate: CandidateConfig = {
  provider: "anthropic",
  model: "claude-haiku-4-5",
  systemPrompt: "You are a concise assistant. Answer in one sentence.",
  temperature: 0,
  maxOutputTokens: 200,
};
