/**
 * judge.ts — rubric scoring for Stage 2 EmailDrafts via Claude Agent SDK.
 *
 * Runs Opus 4.7 through the same CAgent adapter we use for candidates so the
 * judging side earns the SDK narrative too. Three independent sessions per
 * case — the variance across them IS the signal: low variance = reliable
 * rubric, high variance = ambiguous rubric or borderline case.
 *
 * Not wired into run-comparison.ts yet; E.4 does that. This module exposes
 * `runJudge(email, profile, options)` + `summarizeJudgeRuns(runs)` so E.3's
 * grounding-faithfulness grader and E.4's pipeline can call them directly.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { runCagentRow } from "./adapters/cagent";
import type { CandidateConfig } from "./types";

const HERE = dirname(fileURLToPath(import.meta.url));
// Rubric is per-scope for now. Long term this should come from the scope
// directory via an options arg; parametrize when we have a second scope that
// needs a judge.
const DEFAULT_RUBRIC_PATH = join(
  HERE,
  "..",
  "examples",
  "yc-qualifier",
  "judge-rubric.md",
);

export const DIMENSIONS = [
  "grounding",
  "specificity",
  "relevance",
  "call_to_action",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

const DimensionScoreSchema = z.object({
  score: z.number().int().min(1).max(5),
  rationale: z.string(),
});
export const JudgeScoresSchema = z.object({
  grounding: DimensionScoreSchema,
  specificity: DimensionScoreSchema,
  relevance: DimensionScoreSchema,
  call_to_action: DimensionScoreSchema,
});
export type JudgeScores = z.infer<typeof JudgeScoresSchema>;

export type SingleRun =
  | { ok: true; scores: JudgeScores; raw: string; latency_ms: number; cost_usd: number; input_tokens: number; output_tokens: number }
  | { ok: false; error: string; raw: string; latency_ms: number; cost_usd: number };

export type DimensionStats = {
  scores: number[];
  mean: number;
  min: number;
  max: number;
  std: number;
};
export type JudgeSummary = {
  runs: SingleRun[];
  n_successful_runs: number;
  dimensions: Record<Dimension, DimensionStats>;
  overall_mean: number;
  total_cost_usd: number;
  total_latency_ms: number;
};

export type JudgeOptions = {
  /** Defaults to Opus 4.7 via Claude Agent SDK. */
  model?: string;
  /** Number of independent judge calls per case. Defaults to 3. */
  n_runs?: number;
  /** Override the rubric path for other scopes. */
  rubricPath?: string;
};

function loadRubric(path = DEFAULT_RUBRIC_PATH): string {
  return readFileSync(path, "utf8");
}

function extractJudgeJson(responseText: string): { ok: true; value: JudgeScores } | { ok: false; error: string } {
  if (!responseText) return { ok: false, error: "empty response" };
  // Walk balanced braces — same pattern used by schema.ts. Judges sometimes
  // preface with reasoning despite the "final JSON only" instruction.
  let depth = 0;
  let start = -1;
  let end = -1;
  let inStr = false;
  let escape = false;
  for (let i = 0; i < responseText.length; i++) {
    const ch = responseText[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\" && inStr) { escape = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{") { if (depth === 0) start = i; depth++; }
    else if (ch === "}") { depth--; if (depth === 0) end = i; }
  }
  if (start < 0 || end < 0) return { ok: false, error: "no balanced { }" };
  let parsed: unknown;
  try { parsed = JSON.parse(responseText.slice(start, end + 1)); }
  catch (e) { return { ok: false, error: `JSON.parse: ${(e as Error).message}` }; }
  const r = JudgeScoresSchema.safeParse(parsed);
  if (!r.success) {
    return {
      ok: false,
      error: `Zod: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    };
  }
  return { ok: true, value: r.data };
}

/**
 * Run the judge once on an (email, profile) pair. On non-JSON / schema-fail
 * output, retries a single time with a terser prompt. Returns a SingleRun
 * with `ok: false` if both attempts fail.
 */
async function runJudgeOnce(
  email: unknown,
  profile: unknown,
  rubric: string,
  model: string,
): Promise<SingleRun> {
  const userPrompt =
    `## ProspectProfile\n\n\`\`\`json\n${JSON.stringify(profile, null, 2)}\n\`\`\`\n\n` +
    `## EmailDraft\n\n\`\`\`json\n${JSON.stringify(email, null, 2)}\n\`\`\`\n\n` +
    `Score the EmailDraft against the ProspectProfile using the rubric. Output only the final JSON.`;

  const candidate: CandidateConfig = {
    provider: "anthropic",
    model,
    systemPrompt: rubric,
    runtime: "cagent-sdk",
    maxTurns: 3,
    maxOutputTokens: 1500,
  };

  let raw = "";
  let totalLatency = 0;
  let totalCost = 0;
  let inTokens = 0;
  let outTokens = 0;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await runCagentRow(candidate, {
      id: `judge-a${attempt}`,
      prompt: attempt === 1
        ? userPrompt
        : userPrompt +
          "\n\nReminder: respond with ONLY the JSON object — no preamble, no code fences.",
    });
    raw = r.response;
    totalLatency += r.latency_ms;
    totalCost += r.cost_usd;
    inTokens += r.input_tokens ?? 0;
    outTokens += r.output_tokens ?? 0;

    if (r.error) {
      // If the adapter itself errored, skip retry — likely a durable failure
      // (auth, rate limit) that won't fix itself on a second try.
      return { ok: false, error: r.error, raw, latency_ms: totalLatency, cost_usd: totalCost };
    }
    const parsed = extractJudgeJson(raw);
    if (parsed.ok) {
      return {
        ok: true,
        scores: parsed.value,
        raw,
        latency_ms: totalLatency,
        cost_usd: totalCost,
        input_tokens: inTokens,
        output_tokens: outTokens,
      };
    }
    // Non-JSON / schema mismatch — loop once for a retry with the stricter reminder.
  }
  return {
    ok: false,
    error: "judge output did not parse as JudgeScores after 2 attempts",
    raw,
    latency_ms: totalLatency,
    cost_usd: totalCost,
  };
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
  return Math.sqrt(v);
}

/** Aggregate an array of SingleRuns into per-dimension {scores, mean, min, max, std}. */
export function summarizeJudgeRuns(runs: SingleRun[]): JudgeSummary {
  const successes = runs.filter((r): r is SingleRun & { ok: true } => r.ok === true);
  const dims: Partial<Record<Dimension, DimensionStats>> = {};
  for (const d of DIMENSIONS) {
    const scores = successes.map((s) => s.scores[d].score);
    if (scores.length === 0) {
      dims[d] = { scores: [], mean: 0, min: 0, max: 0, std: 0 };
    } else {
      dims[d] = {
        scores,
        mean: scores.reduce((a, b) => a + b, 0) / scores.length,
        min: Math.min(...scores),
        max: Math.max(...scores),
        std: std(scores),
      };
    }
  }
  const dimMeans = DIMENSIONS.map((d) => dims[d]!.mean);
  const overall_mean = successes.length > 0
    ? dimMeans.reduce((a, b) => a + b, 0) / dimMeans.length
    : 0;
  return {
    runs,
    n_successful_runs: successes.length,
    dimensions: dims as Record<Dimension, DimensionStats>,
    overall_mean,
    total_cost_usd: runs.reduce((a, r) => a + r.cost_usd, 0),
    total_latency_ms: runs.reduce((a, r) => a + r.latency_ms, 0),
  };
}

/**
 * Main entry point. Runs the judge `n_runs` times (default 3) on a single
 * (email, profile) pair. Runs serially — parallelism across judge calls
 * inflates rate-limit pressure without meaningfully reducing wall time
 * because each call is already a slow multi-turn CAgent session.
 */
export async function runJudge(
  email: unknown,
  profile: unknown,
  options: JudgeOptions = {},
): Promise<JudgeSummary> {
  const model = options.model ?? "claude-opus-4-7";
  const n_runs = options.n_runs ?? 3;
  const rubric = loadRubric(options.rubricPath);
  const runs: SingleRun[] = [];
  for (let i = 0; i < n_runs; i++) {
    runs.push(await runJudgeOnce(email, profile, rubric, model));
  }
  return summarizeJudgeRuns(runs);
}
