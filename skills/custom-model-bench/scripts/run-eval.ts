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
import { generateText, type LanguageModelV1 } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { xai } from "@ai-sdk/xai";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { computeCost } from "./pricing";

type Provider = "anthropic" | "openai" | "google" | "xai";

type CandidateConfig = {
  provider: Provider;
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxOutputTokens?: number;
};

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
};

function modelFor(candidate: CandidateConfig): LanguageModelV1 {
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
    const out = await generateText({
      model: modelFor(candidate),
      system: candidate.systemPrompt,
      prompt: row.prompt,
      temperature: candidate.temperature,
      maxTokens: candidate.maxOutputTokens,
    });
    const latency_ms = Math.round(performance.now() - startedAt);
    const input_tokens = out.usage?.promptTokens ?? 0;
    const output_tokens = out.usage?.completionTokens ?? 0;
    const cost_usd = computeCost(candidate.model, input_tokens, output_tokens);
    return {
      id: row.id,
      prompt: row.prompt,
      response: out.text,
      turns: 1,
      latency_ms,
      input_tokens,
      output_tokens,
      cost_usd,
      error: null,
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
