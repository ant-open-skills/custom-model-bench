import type { CandidateConfig } from "../../scripts/types";

export const candidate: CandidateConfig = {
  provider: "openai",
  model: "gpt-5.4-nano",
  systemPrompt: "You are a concise assistant. Answer in one sentence.",
  temperature: 0,
  maxOutputTokens: 200,
};
