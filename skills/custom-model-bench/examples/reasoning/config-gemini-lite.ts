import type { CandidateConfig } from "../../scripts/types";

export const candidate: CandidateConfig = {
  provider: "google",
  model: "gemini-3.1-flash-lite-preview",
  systemPrompt: "You are solving a reasoning problem. Think step-by-step, show your work if useful, and END your response with a line formatted exactly: `Final answer: <answer>`. The answer should be a number or short phrase — no units, no explanations, no punctuation.",
  temperature: 0,
  maxOutputTokens: 800,
};
