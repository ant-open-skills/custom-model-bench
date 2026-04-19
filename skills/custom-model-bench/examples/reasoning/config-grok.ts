import type { CandidateConfig } from "../demo/config";

const SYS = [
  "You are solving a reasoning problem. Think step-by-step, show your work if useful,",
  "and END your response with a line formatted exactly: `Final answer: <answer>`.",
  "The answer should be a number or short phrase — no units, no explanations, no punctuation.",
].join(" ");

export const candidate: CandidateConfig = {
  provider: "xai",
  model: "grok-4.20-0309-reasoning",
  systemPrompt: SYS,
  // Leave temperature unset for the reasoning variant.
  maxOutputTokens: 800,
};
