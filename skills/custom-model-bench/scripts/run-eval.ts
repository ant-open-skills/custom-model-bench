#!/usr/bin/env bun
/**
 * run-eval.ts — eval runner.
 *
 * Loads a candidate config + dataset.jsonl from an example directory, runs
 * each row via the Vercel AI SDK, and writes a run report to
 * <example-dir>/runs/<run-id>.json.
 *
 * Supports Anthropic, OpenAI, Google, and xAI via provider dispatch.
 *
 * Usage:
 *   bun run run-eval.ts <example-dir> [config-filename]
 *
 * Default config-filename is "config.ts". Pass e.g. "config-openai.ts" to
 * run the same dataset against a different candidate.
 */

import "dotenv/config";
import { generateText, tool, stepCountIs, type LanguageModel } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { xai } from "@ai-sdk/xai";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { computeCost } from "./pricing";
import type { CandidateConfig, ToolDefinition, TraceEntry } from "./types";

type Provider = CandidateConfig["provider"];

const DEFAULT_MAX_TURNS = 10;

/**
 * Convert our simple ToolDefinition[] into the Vercel AI SDK's keyed tools
 * object. Returns undefined when the candidate has no tools — the caller uses
 * conditional spread so `generateText` never sees a `tools: undefined` key
 * (which some providers treat differently than "not set").
 */
function toSdkTools(tools: ToolDefinition[] | undefined): Record<string, any> | undefined {
  if (!tools || tools.length === 0) return undefined;
  const out: Record<string, any> = {};
  for (const t of tools) {
    // Each tool is an independent schema/handler pairing. The SDK's tool()
    // helper infers a tight generic per call, which doesn't compose over a
    // heterogeneous array — casting through `any` is the idiomatic escape.
    // Phase A.3 adds the tool-calling loop on top of this adapter.
    out[t.name] = tool({
      description: t.description,
      inputSchema: t.inputSchema,
      execute: async (input: any) => t.handler(input),
    } as any);
  }
  return out;
}

type Row = { id: string; prompt: string };

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
  /** Present only when the candidate ran with tools. Compact linearization
   *  of the SDK's `steps` array: assistant text, tool calls, tool results
   *  in order. See TraceEntry in ./types.ts. */
  trace?: TraceEntry[];
};

/** Flatten the Vercel AI SDK's steps[] into a linear TraceEntry[]. Handles
 *  minor field-name variance across SDK versions (args vs input, result vs
 *  output). Returns an empty array for runs with no steps. */
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
      // until the model returns a turn with no tool calls OR we hit maxTurns.
      // Handlers are invoked by the SDK; results are fed back as tool_result
      // messages in the provider's native format.
      ...(sdkTools
        ? { tools: sdkTools, stopWhen: stepCountIs(maxTurns) }
        : {}),
    });
    const latency_ms = Math.round(performance.now() - startedAt);
    const input_tokens = out.usage?.inputTokens ?? 0;
    const output_tokens = out.usage?.outputTokens ?? 0;
    const cost_usd = computeCost(candidate.model, input_tokens, output_tokens);
    // With tools, turns = number of model rounds (each may carry ≥1 tool calls).
    // Without tools, always 1.
    const turns = sdkTools ? (out.steps?.length ?? 1) : 1;
    const trace = sdkTools ? flattenTrace(out.steps as any[]) : undefined;
    return {
      id: row.id,
      prompt: row.prompt,
      response: out.text,
      turns,
      latency_ms,
      input_tokens,
      output_tokens,
      cost_usd,
      error: null,
      ...(trace && trace.length > 0 ? { trace } : {}),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      id: row.id,
      prompt: row.prompt,
      response: "",
      turns: 0,
      latency_ms: Math.round(performance.now() - startedAt),
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      error: msg,
    };
  }
}

async function main() {
  const exampleDirArg = process.argv[2];
  const configFilename = process.argv[3] ?? "config.ts";
  if (!exampleDirArg) {
    console.error("Usage: bun run run-eval.ts <example-dir> [config-filename]");
    process.exit(1);
  }
  const exampleDir = resolve(exampleDirArg);
  const configPath = join(exampleDir, configFilename);
  const datasetPath = join(exampleDir, "dataset.jsonl");

  const mod = (await import(configPath)) as { candidate: CandidateConfig };
  const candidate = mod.candidate;

  const datasetRaw = await readFile(datasetPath, "utf8");
  const rows: Row[] = datasetRaw
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));

  console.log(
    `Running ${rows.length} rows with ${candidate.provider}/${candidate.model}\n`,
  );

  const results: RowResult[] = [];
  for (const row of rows) {
    const r = await runRow(candidate, row);
    const tag = r.error ? "ERROR" : `${r.latency_ms}ms  $${r.cost_usd.toFixed(6)}`;
    console.log(`  ${r.id}  ${tag}${r.error ? "  " + r.error : ""}`);
    results.push(r);
  }

  const ok = results.filter((r) => r.error === null);
  const latencies = ok.map((r) => r.latency_ms).sort((a, b) => a - b);
  const costs = ok.map((r) => r.cost_usd);
  const turns = ok.map((r) => r.turns);
  const totalCost = costs.reduce((a, b) => a + b, 0);

  // Run ID includes provider + config filename stem so multi-provider runs
  // don't collide on the same timestamp second.
  const configStem = basename(configFilename, ".ts");
  const runId = `run_${candidate.provider}_${configStem}_${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}`;
  const report = {
    run_id: runId,
    candidate,
    dataset_path: datasetPath,
    results,
    aggregate: {
      n: rows.length,
      n_success: ok.length,
      n_error: rows.length - ok.length,
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
      },
      turns: {
        mean: mean(turns),
        max: turns.length ? Math.max(...turns) : 0,
      },
    },
  };

  const runsDir = join(exampleDir, "runs");
  await mkdir(runsDir, { recursive: true });
  const outPath = join(runsDir, `${runId}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2));

  console.log(
    `\nWrote ${outPath}` +
      `\nAggregate: p50=${report.aggregate.latency_ms.p50}ms  ` +
      `p95=${report.aggregate.latency_ms.p95}ms  ` +
      `total=$${totalCost.toFixed(6)}  ` +
      `(${ok.length}/${rows.length} ok)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
