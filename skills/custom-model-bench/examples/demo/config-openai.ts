import type { CandidateConfig } from "./config";

export const candidate: CandidateConfig = {
  provider: "openai",
  model: "gpt-4o-mini",
  systemPrompt: "You are a concise assistant. Answer in one sentence.",
  temperature: 0,
  maxOutputTokens: 200,
};
