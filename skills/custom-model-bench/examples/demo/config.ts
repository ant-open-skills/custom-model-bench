/**
 * Candidate config for the Phase 1 demo run.
 *
 * Phase 1 is Claude-only. In Phase 1.5 this same shape will also accept
 * openai, google, and xai as providers — swapping is a one-line change.
 */

export type CandidateConfig = {
  provider: "anthropic"; // more providers land in Phase 1.5
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxOutputTokens?: number;
};

export const candidate: CandidateConfig = {
  provider: "anthropic",
  model: "claude-haiku-4-5",
  systemPrompt: "You are a concise assistant. Answer in one sentence.",
  temperature: 0,
  maxOutputTokens: 200,
};
