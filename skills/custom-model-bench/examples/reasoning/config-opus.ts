import type { CandidateConfig } from "../demo/config";

const SYS = [
  "You are solving a reasoning problem. Think step-by-step, show your work if useful,",
  "and END your response with a line formatted exactly: `Final answer: <answer>`.",
  "The answer should be a number or short phrase — no units, no explanations, no punctuation.",
].join(" ");

export const candidate: CandidateConfig = {
  provider: "anthropic",
  model: "claude-opus-4-7",
  systemPrompt: SYS,
  // Opus 4.7 deprecates the `temperature` parameter — leave it unset.
  maxOutputTokens: 800,
};
