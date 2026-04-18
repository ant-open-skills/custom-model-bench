/**
 * Per-model pricing in USD per million tokens.
 *
 * Sources (April 2026):
 *   Anthropic — https://www.anthropic.com/pricing + docs.claude.com
 *   OpenAI    — https://openai.com/api/pricing/ (GPT-5.4 family, Mar 2026)
 *   Google    — https://ai.google.dev/gemini-api/docs/pricing
 *   xAI       — https://docs.x.ai/developers/models
 *
 * Verify before shipping. Preview-tier models can change pricing without notice.
 */

type Pricing = { input: number; output: number }; // USD per 1M tokens

export const PRICING: Record<string, Pricing> = {
  // Anthropic — flagship / balanced / fastest
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },

  // OpenAI — GPT-5.4 family (Mar 2026). Latency ordering: nano > mini > full.
  "gpt-5.4": { input: 2.5, output: 15 },
  "gpt-5.4-mini": { input: 0.75, output: 4.5 },
  "gpt-5.4-nano": { input: 0.2, output: 1.25 },
  // Legacy / still-available
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },

  // Google — Gemini 3 series. Pro pricing is the <200K-context tier.
  "gemini-3.1-pro-preview": { input: 2, output: 12 },
  "gemini-3-flash-preview": { input: 0.5, output: 3 },
  "gemini-3.1-flash-lite-preview": { input: 0.25, output: 1.5 },
  // Older generation, still available
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },

  // xAI — all Grok 4.20 variants share $2/$6. Fast-tier variants are cheaper.
  "grok-4.20-0309-reasoning": { input: 2, output: 6 },
  "grok-4.20-0309-non-reasoning": { input: 2, output: 6 },
  "grok-4.20-multi-agent-0309": { input: 2, output: 6 },
  "grok-4-1-fast-reasoning": { input: 0.2, output: 0.5 },
  "grok-4-1-fast-non-reasoning": { input: 0.2, output: 0.5 },
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
