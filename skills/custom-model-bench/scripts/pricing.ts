/**
 * Per-model pricing in USD per million tokens.
 *
 * IMPORTANT: These values must be verified against the provider's current
 * published pricing before shipping or relying on cost metrics for real
 * decisions. They are rough approximations suitable for development.
 */

type Pricing = { input: number; output: number }; // USD per 1M tokens

export const PRICING: Record<string, Pricing> = {
  // Anthropic — https://www.anthropic.com/pricing
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-opus-4-7": { input: 15, output: 75 },
  "claude-haiku-4-5": { input: 1, output: 5 },
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
