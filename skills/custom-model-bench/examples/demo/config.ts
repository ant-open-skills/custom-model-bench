/**
 * Default candidate: Claude Haiku 4.5.
 *
 * Other providers in this directory's sibling configs:
 *   - config-openai.ts  → GPT-4o mini
 *   - config-google.ts  → Gemini 2.0 Flash
 *   - config-xai.ts     → Grok 3 Mini
 */

export type CandidateConfig = {
  provider: "anthropic" | "openai" | "google" | "xai";
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxOutputTokens?: number;
};

export const candidate: CandidateConfig = {
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  systemPrompt: "You are a concise assistant. Answer in one sentence.",
  temperature: 0,
  maxOutputTokens: 200,
};
