import type { CandidateConfig } from "../../scripts/types";

export const candidate: CandidateConfig = {
  provider: "google",
  model: "gemini-3.1-flash-lite-preview",
  systemPrompt: "You are a concise assistant. Answer in one sentence.",
  temperature: 0,
  maxOutputTokens: 200,
};
