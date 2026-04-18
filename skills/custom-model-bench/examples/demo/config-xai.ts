import type { CandidateConfig } from "./config";

export const candidate: CandidateConfig = {
  provider: "xai",
  model: "grok-3-mini",
  systemPrompt: "You are a concise assistant. Answer in one sentence.",
  temperature: 0,
  maxOutputTokens: 200,
};
