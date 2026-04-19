import type { CandidateConfig } from "../demo/config";

const SYS = [
  "You are solving a reasoning problem. Think step-by-step, show your work if useful,",
  "and END your response with a line formatted exactly: `Final answer: <answer>`.",
  "The answer should be a number or short phrase — no units, no explanations, no punctuation.",
].join(" ");

export const candidate: CandidateConfig = {
  provider: "openai",
  model: "gpt-5.4",
  systemPrompt: SYS,
  // GPT-5.4 is a reasoning model — temperature is ignored by the API. Leave unset.
  maxOutputTokens: 800,
};
