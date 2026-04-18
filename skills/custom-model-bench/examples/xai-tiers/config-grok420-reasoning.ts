import type { CandidateConfig } from "../demo/config";

export const candidate: CandidateConfig = {
  provider: "xai",
  model: "grok-4.20-0309-reasoning",
  systemPrompt: "You are a concise assistant. Answer in one sentence.",
  temperature: 0,
  maxOutputTokens: 200,
};
