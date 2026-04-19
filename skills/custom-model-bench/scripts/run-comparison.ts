#!/usr/bin/env bun
/**
 * run-comparison.ts — head-to-head benchmark across all candidates in an
 * example directory.
 *
 * Auto-discovers every `config*.ts` file in the example dir, runs each
 * candidate against the shared dataset IN PARALLEL, and writes a single
 * unified comparison report to <example-dir>/runs/comparison_<ts>.json.
 *
 * The report shape is designed for front-end consumption: a `runs[]`
 * array (one entry per candidate) and a `leaderboard` object with the
 * headline metrics pre-sorted for chart rendering.
 *
 * Usage: bun run run-comparison.ts <example-dir>
 */

import "dotenv/config";
import { generateText, tool, stepCountIs, type LanguageModel } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { xai } from "@ai-sdk/xai";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { computeCost } from "./pricing";
import { gradeRow } from "./graders/exact_match";
import { runCagentRow } from "./adapters/cagent";
import type { CandidateConfig, ToolDefinition, TraceEntry } from "./types";

type Provider = CandidateConfig["provider"];

const DEFAULT_MAX_TURNS = 10;

/** Convert ToolDefinition[] into the Vercel AI SDK's keyed tools object.
 *  Returns undefined when the candidate has no tools; the call site uses
 *  conditional spread so `generateText` never sees a `tools: undefined` key. */
function toSdkTools(tools: ToolDefinition[] | undefined): Record<string, any> | undefined {
  if (!tools || tools.length === 0) return undefined;
  const out: Record<string, any> = {};
  for (const t of tools) {
    out[t.name] = tool({
      description: t.description,
      inputSchema: t.inputSchema,
      execute: async (input: any) => t.handler(input),
    } as any);
  }
  return out;
}

/** Flatten the SDK's steps[] into a linear TraceEntry[] for persistence.
 *  Handles minor field-name variance across SDK versions (args vs input,
 *  result vs output). */
function flattenTrace(steps: any[] | undefined): TraceEntry[] {
  if (!steps || steps.length === 0) return [];
  const trace: TraceEntry[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i] ?? {};
    const text: string = step.text ?? "";
    if (text.length > 0) {
      trace.push({ type: "assistant_text", step: i, text });
    }
    for (const tc of step.toolCalls ?? []) {
      trace.push({
        type: "tool_call",
        step: i,
        name: tc.toolName ?? tc.name ?? "?",
        input: tc.input ?? tc.args ?? null,
        id: tc.toolCallId ?? tc.id ?? String(i),
      });
    }
    for (const tr of step.toolResults ?? []) {
      trace.push({
        type: "tool_result",
        step: i,
        name: tr.toolName ?? tr.name ?? "?",
        output: tr.output ?? tr.result ?? null,
        id: tr.toolCallId ?? tr.id ?? String(i),
      });
    }
  }
  return trace;
}

type Row = {
  id: string;
  prompt: string;
  /** If present, the candidate's response is exact-match graded against this. */
  expected_answer?: string;
};

type RowResult = {
  id: string;
  prompt: string;
  response: string;
  turns: number;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  error: string | null;
  /** Set when the dataset row has `expected_answer`; null otherwise. */
  answer_extracted?: string | null;
  answer_correct?: boolean | null;
  /** Present only when the candidate ran with tools. Compact linearization
   *  of the SDK's `steps` array. See TraceEntry in ./types.ts. */
  trace?: TraceEntry[];
};

type Aggregate = {
  n: number;
  n_success: number;
  n_error: number;
  latency_ms: { p50: number; p95: number; p99: number; mean: number };
  cost_usd: {
    total: number;
    mean: number;
    per_1k_evals: number;
    /** Total cost across all rows (incl. failures) / # successful rows.
     *  Captures the blog-post claim "cost per successful task." */
    per_successful_task: number;
  };
  turns: { mean: number; max: number };
  /** Populated only when any dataset row carries `expected_answer`. */
  answer_accuracy?: {
    graded: number;   // rows that had expected_answer and didn't error
    correct: number;
    rate: number;     // correct / graded (0 when graded is 0)
  };
};

type CandidateRun = {
  config_file: string;
  provider: Provider;
  model: string;
  /** Only emitted when the config opts in to a non-default runtime, so
   *  existing comparison JSONs stay byte-identical. */
  runtime?: "vercel" | "cagent-sdk";
  systemPrompt?: string;
  temperature?: number;
  maxOutputTokens?: number;
  results: RowResult[];
  aggregate: Aggregate;
};

function modelFor(candidate: CandidateConfig): LanguageModel {
  switch (candidate.provider) {
    case "anthropic":
      return anthropic(candidate.model);
    case "openai":
      return openai(candidate.model);
    case "google":
      return google(candidate.model);
    case "xai":
      return xai(candidate.model);
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(i, sorted.length - 1))];
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

async function runRow(
  candidate: CandidateConfig,
  row: Row,
): Promise<RowResult> {
  const runtime = candidate.runtime ?? "vercel";
  if (runtime === "cagent-sdk") {
    return runCagentRow(candidate, row);
  }
  const startedAt = performance.now();
  try {
    const sdkTools = toSdkTools(candidate.tools);
    const maxTurns = candidate.maxTurns ?? DEFAULT_MAX_TURNS;
    const out = await generateText({
      model: modelFor(candidate),
      system: candidate.systemPrompt,
      prompt: row.prompt,
      // Spread only params that are actually set — some models (e.g. Opus 4.7)
      // reject an explicit `temperature` even when it's `undefined`.
      ...(candidate.temperature !== undefined
        ? { temperature: candidate.temperature }
        : {}),
      ...(candidate.maxOutputTokens !== undefined
        ? { maxOutputTokens: candidate.maxOutputTokens }
        : {}),
      // With tools, enable the SDK's auto-loop. It keeps calling the model
      // until the model returns a turn with no tool calls OR maxTurns is
      // reached. Handlers execute in-process and their outputs are fed back
      // as tool_result messages in the provider's native format.
      ...(sdkTools
        ? { tools: sdkTools, stopWhen: stepCountIs(maxTurns) }
        : {}),
    });
    const latency_ms = Math.round(performance.now() - startedAt);
    const input_tokens = out.usage?.inputTokens ?? 0;
    const output_tokens = out.usage?.outputTokens ?? 0;
    const { extracted, correct } = gradeRow(out.text, row.expected_answer);
    // With tools, turns = # of model rounds (each may carry ≥1 tool calls).
    // Without tools, always 1.
    const turns = sdkTools ? ((out as any).steps?.length ?? 1) : 1;
    const trace = sdkTools ? flattenTrace((out as any).steps) : undefined;
    return {
      id: row.id,
      prompt: row.prompt,
      response: out.text,
      turns,
      latency_ms,
      input_tokens,
      output_tokens,
      cost_usd: computeCost(candidate.model, input_tokens, output_tokens),
      error: null,
      answer_extracted: row.expected_answer != null ? extracted : null,
      answer_correct: row.expected_answer != null ? correct : null,
      ...(trace && trace.length > 0 ? { trace } : {}),
    };
  } catch (e: unknown) {
    return {
      id: row.id,
      prompt: row.prompt,
      response: "",
      turns: 0,
      latency_ms: Math.round(performance.now() - startedAt),
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function aggregate(results: RowResult[]): Aggregate {
  const ok = results.filter((r) => r.error === null);
  const latencies = ok.map((r) => r.latency_ms).sort((a, b) => a - b);
  const costs = ok.map((r) => r.cost_usd);
  const turns = ok.map((r) => r.turns);
  const totalCost = costs.reduce((a, b) => a + b, 0);
  // Numerator is ALL rows' cost — including failed attempts — because the
  // agentic question "what did it cost me to get a successful task done"
  // must account for tokens burned on failures. Denominator is successes only.
  const totalCostAllRows = results.reduce((a, r) => a + r.cost_usd, 0);
  const per_successful_task = ok.length ? totalCostAllRows / ok.length : 0;

  const graded = results.filter((r) => r.answer_correct !== null && r.answer_correct !== undefined);
  const correct = graded.filter((r) => r.answer_correct === true).length;
  const answer_accuracy = graded.length > 0
    ? { graded: graded.length, correct, rate: correct / graded.length }
    : undefined;

  return {
    n: results.length,
    n_success: ok.length,
    n_error: results.length - ok.length,
    latency_ms: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      mean: Math.round(mean(latencies)),
    },
    cost_usd: {
      total: totalCost,
      mean: ok.length ? totalCost / ok.length : 0,
      per_1k_evals: ok.length ? (totalCost / ok.length) * 1000 : 0,
      per_successful_task,
    },
    turns: {
      mean: mean(turns),
      max: turns.length ? Math.max(...turns) : 0,
    },
    ...(answer_accuracy ? { answer_accuracy } : {}),
  };
}

async function runCandidate(
  configFile: string,
  candidate: CandidateConfig,
  rows: Row[],
): Promise<CandidateRun> {
  // Rows serialized per-candidate so latency isn't polluted by parallelism
  // within a single provider; candidates still run in parallel with each other.
  const results: RowResult[] = [];
  for (const row of rows) {
    results.push(await runRow(candidate, row));
  }
  return {
    config_file: configFile,
    provider: candidate.provider,
    model: candidate.model,
    // Conditional spread keeps comparison JSONs for vercel-only scopes
    // byte-identical to the pre-C.5.1 output.
    ...(candidate.runtime ? { runtime: candidate.runtime } : {}),
    systemPrompt: candidate.systemPrompt,
    temperature: candidate.temperature,
    maxOutputTokens: candidate.maxOutputTokens,
    results,
    aggregate: aggregate(results),
  };
}

async function main() {
  const exampleDirArg = process.argv[2];
  if (!exampleDirArg) {
    console.error("Usage: bun run run-comparison.ts <example-dir>");
    process.exit(1);
  }
  const exampleDir = resolve(exampleDirArg);
  const datasetPath = join(exampleDir, "dataset.jsonl");

  // Auto-discover config*.ts files
  const dirEntries = await readdir(exampleDir);
  const configFiles = dirEntries
    .filter((f) => /^config.*\.ts$/.test(f))
    .sort();
  if (configFiles.length === 0) {
    console.error(`No config*.ts files found in ${exampleDir}`);
    process.exit(1);
  }

  // Load dataset
  const datasetRaw = await readFile(datasetPath, "utf8");
  const rows: Row[] = datasetRaw
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));

  // Load every candidate config
  const candidates: { configFile: string; candidate: CandidateConfig }[] =
    await Promise.all(
      configFiles.map(async (f) => {
        const mod = (await import(join(exampleDir, f))) as {
          candidate: CandidateConfig;
        };
        return { configFile: f, candidate: mod.candidate };
      }),
    );

  console.log(
    `Comparison: ${rows.length} rows × ${candidates.length} candidates (parallel)\n`,
  );
  for (const { candidate, configFile } of candidates) {
    console.log(`  - ${candidate.provider}/${candidate.model}  (${configFile})`);
  }
  console.log();

  const started_at = new Date().toISOString();
  const runs = await Promise.all(
    candidates.map(({ configFile, candidate }) =>
      runCandidate(configFile, candidate, rows),
    ),
  );
  const completed_at = new Date().toISOString();

  // Leaderboards — pre-sorted, lowest-is-best unless noted
  const leaderboard = {
    latency_p50_ms: runs
      .filter((r) => r.aggregate.n_success > 0)
      .map((r) => ({
        provider: r.provider,
        model: r.model,
        value: r.aggregate.latency_ms.p50,
      }))
      .sort((a, b) => a.value - b.value),
    latency_p95_ms: runs
      .filter((r) => r.aggregate.n_success > 0)
      .map((r) => ({
        provider: r.provider,
        model: r.model,
        value: r.aggregate.latency_ms.p95,
      }))
      .sort((a, b) => a.value - b.value),
    cost_per_1k_evals_usd: runs
      .filter((r) => r.aggregate.n_success > 0)
      .map((r) => ({
        provider: r.provider,
        model: r.model,
        value: r.aggregate.cost_usd.per_1k_evals,
      }))
      .sort((a, b) => a.value - b.value),
    success_rate: runs
      .map((r) => ({
        provider: r.provider,
        model: r.model,
        value: r.aggregate.n / r.aggregate.n === 0 ? 0 : r.aggregate.n_success / r.aggregate.n,
      }))
      .sort((a, b) => b.value - a.value), // higher is better
  };

  const comparison_id = `comparison_${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}`;
  const report = {
    comparison_id,
    dataset_path: datasetPath,
    n_rows: rows.length,
    n_candidates: candidates.length,
    started_at,
    completed_at,
    runs,
    leaderboard,
  };

  const runsDir = join(exampleDir, "runs");
  await mkdir(runsDir, { recursive: true });
  const outPath = join(runsDir, `${comparison_id}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2));

  // Summary table
  const anyGraded = runs.some((r) => r.aggregate.answer_accuracy);
  console.log("=== Results ===\n");
  const col = (s: string, w: number) => s.padEnd(w);
  console.log(
    col("provider/model", 38) +
      col("p50 ms", 10) +
      col("p95 ms", 10) +
      col("$/1k", 12) +
      col("ok", 8) +
      (anyGraded ? col("accuracy", 12) : ""),
  );
  console.log("─".repeat(anyGraded ? 90 : 78));
  for (const r of runs) {
    const label = `${r.provider}/${r.model}`;
    const p50 = r.aggregate.latency_ms.p50.toString();
    const p95 = r.aggregate.latency_ms.p95.toString();
    const cost = `$${r.aggregate.cost_usd.per_1k_evals.toFixed(4)}`;
    const ok = `${r.aggregate.n_success}/${r.aggregate.n}`;
    const acc = r.aggregate.answer_accuracy
      ? `${r.aggregate.answer_accuracy.correct}/${r.aggregate.answer_accuracy.graded}  ${(r.aggregate.answer_accuracy.rate * 100).toFixed(0)}%`
      : "";
    console.log(
      col(label, 38) + col(p50, 10) + col(p95, 10) + col(cost, 12) + col(ok, 8)
        + (anyGraded ? col(acc, 12) : ""),
    );
  }

  console.log(`\nWrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
