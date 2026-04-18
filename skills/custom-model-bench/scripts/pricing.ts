/**
 * Per-model pricing in USD per million tokens.
 *
 * IMPORTANT: These values are approximate snapshots suitable for development.
 * Verify against each provider's published pricing before relying on cost
 * metrics for real decisions. Keys must match the model strings you pass to
 * the Vercel AI SDK.
 */

type Pricing = { input: number; output: number }; // USD per 1M tokens

export const PRICING: Record<string, Pricing> = {
  // Anthropic — https://www.anthropic.com/pricing
  "claude-opus-4-7": { input: 15, output: 75 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },

  // OpenAI — https://openai.com/api/pricing/
  // GPT-5.4 family released Mar 2026; nano undercuts everything at $0.20 input.
  "gpt-5.4": { input: 30, output: 180 },
  "gpt-5.4-mini": { input: 0.75, output: 3 },
  "gpt-5.4-nano": { input: 0.2, output: 1 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },

  // Google — https://ai.google.dev/gemini-api/docs/pricing
  // Gemini 3.1 Pro is paid-only as of April 2026. Pricing tiers by context size;
  // values below are the <200K tier. Flash variants keep a free tier.
  "gemini-3.1-pro-preview": { input: 2, output: 12 },
  "gemini-3.1-flash-lite-preview": { input: 0.1, output: 0.4 },
  "gemini-3-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },

  // xAI — https://docs.x.ai/developers/models
  "grok-4": { input: 2, output: 6 },
  "grok-4-fast": { input: 0.2, output: 0.5 },
  "grok-3-mini": { input: 0.3, output: 0.5 },
};

export function computeCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = PRICING[model];
  if (!p) {
    // Unknown model — return NaN so aggregates surface the gap instead of
    // silently reporting $0.00.
    return NaN;
  }
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
