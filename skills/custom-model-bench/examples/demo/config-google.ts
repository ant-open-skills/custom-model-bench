import type { CandidateConfig } from "./config";

export const candidate: CandidateConfig = {
  provider: "google",
  model: "gemini-2.5-flash",
  systemPrompt: "You are a concise assistant. Answer in one sentence.",
  temperature: 0,
  maxOutputTokens: 200,
};
