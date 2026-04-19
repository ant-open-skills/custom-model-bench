/**
 * Default candidate: Claude Sonnet 4.6.
 *
 * Other providers in this directory's sibling configs:
 *   - config-openai.ts  → GPT-5.4 mini
 *   - config-google.ts  → Gemini 3.1 Pro
 *   - config-xai.ts     → Grok 4
 */

import type { ToolDefinition } from "../../scripts/types";

export type CandidateConfig = {
  provider: "anthropic" | "openai" | "google" | "xai";
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxOutputTokens?: number;
  /**
   * Tools the candidate may call during execution. When empty or undefined,
   * the run is a plain single-turn call.
   */
  tools?: ToolDefinition[];
  /** Max tool-use rounds before the loop terminates. Only meaningful when
   *  `tools` is set. Defaults to 10 in run-eval.ts. */
  maxTurns?: number;
};

export const candidate: CandidateConfig = {
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  systemPrompt: "You are a concise assistant. Answer in one sentence.",
  temperature: 0,
  maxOutputTokens: 200,
};
