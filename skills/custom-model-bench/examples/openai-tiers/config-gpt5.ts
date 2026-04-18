import type { CandidateConfig } from "../demo/config";

export const candidate: CandidateConfig = {
  provider: "openai",
  model: "gpt-5.4",
  systemPrompt: "You are a concise assistant. Answer in one sentence.",
  temperature: 0,
  maxOutputTokens: 200,
};
