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
import { checkSchema } from "./graders/schema";
import {
  checkToolCallAccuracy,
  checkEfficiency,
  countToolCalls,
} from "./graders/tool_calls";
import {
  checkGithubOrg,
  checkTechStackOverlap,
  checkTechStackOverlapPctInRange,
  checkContactsInRange,
  checkFitScoreInRange,
} from "./graders/ground_truth";
import { isRecovery, p50Sorted } from "./graders/trace_metrics";
import { runCagentRow } from "./adapters/cagent";
import { runJudge, type JudgeSummary, DIMENSIONS as JUDGE_DIMENSIONS } from "./judge";
import { scoreGroundingFaithfulness, type GroundingResult } from "./graders/grounding_faithfulness";
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
  /** D.1/D.3 ground-truth fields (yc-qualifier scope; optional for others). */
  expected_github_org?: string | null;
  /** Array form (per task spec) — intersection / expected size. */
  expected_tech_stack_overlap?: string[];
  /** Range form (as authored in yc-qualifier dataset.jsonl). Checked against
   *  the model's predicted `tech_stack_overlap_pct`. */
  expected_tech_stack_overlap_range?: [number, number];
  expected_contacts_count_range?: [number, number];
  expected_fit_score_range?: [number, number];
  /** D.1 tool-call accuracy (spec field; yc-qualifier dataset does not ship
   *  this today — gated cleanly when absent). */
  expected_tools?: string[];
  /** D.1 efficiency — total tool calls ≤ max_tool_calls. */
  max_tool_calls?: number;
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
  /** E.4 — Stage 2 pipeline result. Set only when the scope has a Stage 2
   *  config and Stage 1 succeeded. Even on Stage 2 failure we attach a
   *  `stage2_error` so the row's pipeline state is fully visible. */
  stage2?: {
    config_file: string;
    email_text: string;            // raw drafter response
    email_valid: boolean;          // did it parse as EmailDraft?
    email_error?: string;
    email_recipient_name?: string;
    email_subject?: string;
    email_body_word_count?: number;
    email_grounding_refs?: string[];
    drafter_latency_ms: number;
    drafter_cost_usd: number;
    grounding?: GroundingResult;   // grounding faithfulness — set if email parsed
    judge?: JudgeSummary;          // 3-run judge — set if email parsed
    pipeline_total_cost_usd: number;
    pipeline_total_latency_ms: number;
  };
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
  turns: { mean: number; max: number; p50: number };
  /** Populated only when any dataset row carries `expected_answer`. */
  answer_accuracy?: {
    graded: number;   // rows that had expected_answer and didn't error
    correct: number;
    rate: number;     // correct / graded (0 when graded is 0)
  };
  /** D.1 — schema compliance. Populated when an `extractProfile` helper was
   *  supplied (i.e. the scope has a schema.ts). */
  schema_compliance?: {
    graded: number;
    valid: number;
    rate: number;
  };
  /** D.1 — tool-call accuracy vs. row.expected_tools. */
  tool_call_accuracy?: {
    graded: number;
    expected_total: number;
    seen_total: number;
    rate: number;
  };
  /** D.1 — efficiency: fraction of rows with total tool calls ≤ max_tool_calls. */
  efficiency?: {
    graded: number;
    within_budget: number;
    rate: number;
  };
  /** D.2 — recovery rate: rows that bounced back from a tool error to succeed. */
  recovery_rate?: {
    eligible: number;
    recovered: number;
    rate: number;
  };
  /** D.2 — dead-end rate: 1 - task_completion. Gated on schema-check availability. */
  dead_end_rate?: number;
  /** D.2 — task completion: fraction of rows with schema-valid ProspectProfile. */
  task_completion?: number;
  /** D.3 — ground truth per-field accuracy. */
  ground_truth?: {
    github_org?: { graded: number; correct: number; rate: number };
    tech_stack?: {
      graded: number;
      /** Mean overlap (array form) or in-range fraction (range form). */
      rate: number;
      mode: "array_overlap" | "pct_range";
    };
    contacts?: { graded: number; correct: number; rate: number };
    fit_score?: { graded: number; correct: number; rate: number };
  };
  /** E.4 — Stage 2 pipeline aggregates. Populated only when the scope ran a
   *  Stage 2 config and at least one row produced a parsed EmailDraft. */
  stage2?: {
    n_eligible: number;          // rows where Stage 1 succeeded → Stage 2 attempted
    n_drafts_valid: number;      // EmailDraft parsed cleanly
    drafter_total_cost_usd: number;
    judge?: {
      n_judged: number;          // rows where the judge produced ≥1 successful run
      overall_mean: number;      // mean of per-row overall_mean
      dimensions: Record<string, { mean: number; std_of_means: number }>;
      total_cost_usd: number;
    };
    grounding_faithfulness?: {
      n_scored: number;
      mean_fabrication_rate: number;     // 0 = perfect, 1 = total fabrication
      total_claims: number;
      total_hallucinated: number;
      n_perfect_rows: number;            // rows with fabrication_rate == 0
      total_extraction_cost_usd: number;
    };
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

type ExtractProfileFn = (text: string) =>
  | { ok: true; value: unknown }
  | { ok: false; error: string };

function aggregate(
  results: RowResult[],
  rows?: Row[],
  extractProfile?: ExtractProfileFn,
): Aggregate {
  const ok = results.filter((r) => r.error === null);
  const latencies = ok.map((r) => r.latency_ms).sort((a, b) => a - b);
  const costs = ok.map((r) => r.cost_usd);
  const turns = ok.map((r) => r.turns);
  const turnsSorted = [...turns].sort((a, b) => a - b);
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

  // --- D.1 / D.2 / D.3 ---
  // Zip results with the source row so we can read expected_* fields.
  const rowById = new Map<string, Row>();
  for (const r of rows ?? []) rowById.set(r.id, r);

  // schema compliance — one pass so we can reuse per-row profiles in D.3.
  type PerRow = {
    row?: Row;
    result: RowResult;
    schemaValid: boolean | null; // null = no extractor
    profile: any | null;
  };
  const perRow: PerRow[] = results.map((r) => {
    const row = rowById.get(r.id);
    if (!extractProfile || r.error !== null) {
      return { row, result: r, schemaValid: null, profile: null };
    }
    const check = checkSchema(r.response, extractProfile);
    return {
      row,
      result: r,
      schemaValid: check.valid,
      profile: check.valid ? (check.value as any) : null,
    };
  });

  let schema_compliance: Aggregate["schema_compliance"];
  if (extractProfile) {
    const schemaGraded = perRow.filter((p) => p.schemaValid !== null);
    const schemaValid = schemaGraded.filter((p) => p.schemaValid).length;
    if (schemaGraded.length > 0) {
      schema_compliance = {
        graded: schemaGraded.length,
        valid: schemaValid,
        rate: schemaValid / schemaGraded.length,
      };
    }
  }

  // tool_call_accuracy — only for rows that carry expected_tools.
  const toolAcc = perRow
    .map((p) => {
      if (!p.row?.expected_tools) return null;
      return checkToolCallAccuracy(p.result.trace, p.row.expected_tools);
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const tool_call_accuracy =
    toolAcc.length > 0
      ? {
          graded: toolAcc.length,
          expected_total: toolAcc.reduce((a, b) => a + b.expected, 0),
          seen_total: toolAcc.reduce((a, b) => a + b.seen, 0),
          rate: mean(toolAcc.map((a) => a.rate)),
        }
      : undefined;

  // efficiency — only rows with max_tool_calls defined.
  const effResults = perRow
    .map((p) => {
      if (p.row?.max_tool_calls == null) return null;
      return checkEfficiency(p.result.trace, p.row.max_tool_calls);
    })
    .filter((x): x is boolean => x !== null);
  const efficiency =
    effResults.length > 0
      ? {
          graded: effResults.length,
          within_budget: effResults.filter(Boolean).length,
          rate: effResults.filter(Boolean).length / effResults.length,
        }
      : undefined;

  // recovery_rate — requires a trace. "Eligible" = rows that succeeded (so
  // a recovery was possible in principle). False negatives preferred.
  let recovery_rate: Aggregate["recovery_rate"];
  const eligibleRecovery = perRow.filter(
    (p) => p.result.error === null && p.result.trace && p.result.trace.length > 0,
  );
  if (eligibleRecovery.length > 0) {
    const recovered = eligibleRecovery.filter((p) =>
      isRecovery(p.result.trace, true),
    ).length;
    recovery_rate = {
      eligible: eligibleRecovery.length,
      recovered,
      rate: recovered / eligibleRecovery.length,
    };
  }

  // task_completion + dead_end_rate — only when a schema extractor is present.
  let task_completion: number | undefined;
  let dead_end_rate: number | undefined;
  if (extractProfile) {
    const total = perRow.length;
    if (total > 0) {
      const completed = perRow.filter((p) => p.schemaValid === true).length;
      task_completion = completed / total;
      dead_end_rate = 1 - task_completion;
    }
  }

  // --- D.3 ground truth ---
  let ground_truth: Aggregate["ground_truth"];
  const buildGT = () => {
    const gt: NonNullable<Aggregate["ground_truth"]> = {};

    // github_org
    const ghPairs = perRow
      .filter((p) => p.row?.expected_github_org !== undefined)
      .map((p) => checkGithubOrg(p.profile, p.row!.expected_github_org));
    const ghGraded = ghPairs.filter((v): v is boolean => v !== null);
    if (ghGraded.length > 0) {
      const correct = ghGraded.filter(Boolean).length;
      gt.github_org = {
        graded: ghGraded.length,
        correct,
        rate: correct / ghGraded.length,
      };
    }

    // tech_stack — prefer array form when present, else fall back to the
    // numeric-range form shipped in yc-qualifier.
    const arrayPairs = perRow
      .filter((p) => Array.isArray(p.row?.expected_tech_stack_overlap))
      .map((p) =>
        checkTechStackOverlap(p.profile, p.row!.expected_tech_stack_overlap),
      )
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (arrayPairs.length > 0) {
      gt.tech_stack = {
        graded: arrayPairs.length,
        rate: mean(arrayPairs.map((a) => a.overlap_pct)),
        mode: "array_overlap",
      };
    } else {
      const rangePairs = perRow
        .filter((p) => p.row?.expected_tech_stack_overlap_range !== undefined)
        .map((p) =>
          checkTechStackOverlapPctInRange(
            p.profile,
            p.row!.expected_tech_stack_overlap_range,
          ),
        )
        .filter((x): x is boolean => x !== null);
      if (rangePairs.length > 0) {
        const correct = rangePairs.filter(Boolean).length;
        gt.tech_stack = {
          graded: rangePairs.length,
          rate: correct / rangePairs.length,
          mode: "pct_range",
        };
      }
    }

    // contacts
    const contactsPairs = perRow
      .filter((p) => p.row?.expected_contacts_count_range !== undefined)
      .map((p) =>
        checkContactsInRange(p.profile, p.row!.expected_contacts_count_range),
      )
      .filter((x): x is boolean => x !== null);
    if (contactsPairs.length > 0) {
      const correct = contactsPairs.filter(Boolean).length;
      gt.contacts = {
        graded: contactsPairs.length,
        correct,
        rate: correct / contactsPairs.length,
      };
    }

    // fit_score
    const fitPairs = perRow
      .filter((p) => p.row?.expected_fit_score_range !== undefined)
      .map((p) =>
        checkFitScoreInRange(p.profile, p.row!.expected_fit_score_range),
      )
      .filter((x): x is boolean => x !== null);
    if (fitPairs.length > 0) {
      const correct = fitPairs.filter(Boolean).length;
      gt.fit_score = {
        graded: fitPairs.length,
        correct,
        rate: correct / fitPairs.length,
      };
    }

    return gt;
  };
  const gtBuilt = buildGT();
  if (Object.keys(gtBuilt).length > 0) ground_truth = gtBuilt;

  // --- E.4 Stage 2 aggregates — only when any row has stage2 data ---
  let stage2: Aggregate["stage2"];
  const rowsWithStage2 = results.filter((r) => r.stage2 !== undefined);
  if (rowsWithStage2.length > 0) {
    const drafterCost = rowsWithStage2.reduce(
      (a, r) => a + (r.stage2!.drafter_cost_usd ?? 0),
      0,
    );
    const validDrafts = rowsWithStage2.filter((r) => r.stage2!.email_valid);

    // Judge aggregate — average per-row overall_mean; per-dim take the mean of
    // per-row means and the std *of those means* (not the within-row std).
    const judged = validDrafts.filter((r) => r.stage2!.judge && r.stage2!.judge.n_successful_runs > 0);
    let judgeAgg: NonNullable<Aggregate["stage2"]>["judge"];
    if (judged.length > 0) {
      const perRowOverall = judged.map((r) => r.stage2!.judge!.overall_mean);
      const overall_mean = perRowOverall.reduce((a, b) => a + b, 0) / perRowOverall.length;
      const dims: Record<string, { mean: number; std_of_means: number }> = {};
      for (const d of JUDGE_DIMENSIONS) {
        const perRowDimMeans = judged.map((r) => r.stage2!.judge!.dimensions[d].mean);
        const dMean = perRowDimMeans.reduce((a, b) => a + b, 0) / perRowDimMeans.length;
        const variance = perRowDimMeans.length > 1
          ? perRowDimMeans.reduce((a, x) => a + (x - dMean) ** 2, 0) / perRowDimMeans.length
          : 0;
        dims[d] = { mean: dMean, std_of_means: Math.sqrt(variance) };
      }
      const judgeCost = judged.reduce((a, r) => a + (r.stage2!.judge!.total_cost_usd ?? 0), 0);
      judgeAgg = {
        n_judged: judged.length,
        overall_mean,
        dimensions: dims,
        total_cost_usd: judgeCost,
      };
    }

    // Grounding faithfulness aggregate.
    const grounded = validDrafts.filter((r) => r.stage2!.grounding !== undefined);
    let groundingAgg: NonNullable<Aggregate["stage2"]>["grounding_faithfulness"];
    if (grounded.length > 0) {
      const totalClaims = grounded.reduce((a, r) => a + r.stage2!.grounding!.claims_total, 0);
      const totalHall = grounded.reduce((a, r) => a + r.stage2!.grounding!.hallucinated, 0);
      const rowFabRates = grounded.map((r) => r.stage2!.grounding!.fabrication_rate);
      const meanFabRate = rowFabRates.reduce((a, b) => a + b, 0) / rowFabRates.length;
      const perfect = grounded.filter((r) => r.stage2!.grounding!.fabrication_rate === 0).length;
      const extractionCost = grounded.reduce((a, r) => a + (r.stage2!.grounding!.extraction_cost_usd ?? 0), 0);
      groundingAgg = {
        n_scored: grounded.length,
        mean_fabrication_rate: meanFabRate,
        total_claims: totalClaims,
        total_hallucinated: totalHall,
        n_perfect_rows: perfect,
        total_extraction_cost_usd: extractionCost,
      };
    }

    stage2 = {
      n_eligible: rowsWithStage2.length,
      n_drafts_valid: validDrafts.length,
      drafter_total_cost_usd: drafterCost,
      ...(judgeAgg ? { judge: judgeAgg } : {}),
      ...(groundingAgg ? { grounding_faithfulness: groundingAgg } : {}),
    };
  }

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
      p50: p50Sorted(turnsSorted),
    },
    ...(answer_accuracy ? { answer_accuracy } : {}),
    ...(schema_compliance ? { schema_compliance } : {}),
    ...(tool_call_accuracy ? { tool_call_accuracy } : {}),
    ...(efficiency ? { efficiency } : {}),
    ...(recovery_rate ? { recovery_rate } : {}),
    ...(task_completion !== undefined ? { task_completion } : {}),
    ...(dead_end_rate !== undefined ? { dead_end_rate } : {}),
    ...(ground_truth ? { ground_truth } : {}),
    ...(stage2 ? { stage2 } : {}),
  };
}

async function runCandidate(
  configFile: string,
  candidate: CandidateConfig,
  rows: Row[],
  extractProfile?: ExtractProfileFn,
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
    aggregate: aggregate(results, rows, extractProfile),
  };
}

type ExtractEmailDraftFn = (text: string) =>
  | { ok: true; value: { recipient?: { name: string }; subject: string; body: string; grounding_references: string[] } }
  | { ok: false; error: string };

type Stage2Options = {
  /** Skip the Opus 4.7 judge (3 calls per row). Big cost lever. */
  skipJudge?: boolean;
  /** Skip the grounding faithfulness grader (1 Sonnet extraction per row). */
  skipGrounding?: boolean;
};

/**
 * Pipeline: Stage 2 drafter → grounding faithfulness → rubric judge.
 * Called for each row where Stage 1 produced a schema-valid ProspectProfile.
 * Returns an artifact ready to attach to the RowResult.
 */
async function runStage2Pipeline(
  stage2: { configFile: string; candidate: CandidateConfig },
  profile: any,
  extractEmailDraft: ExtractEmailDraftFn | undefined,
  options: Stage2Options = {},
): Promise<NonNullable<RowResult["stage2"]>> {
  const draftPrompt =
    `Here is the Stage 1 ProspectProfile:\n\n` +
    JSON.stringify(profile, null, 2);
  const draft = await runRow(stage2.candidate, {
    id: "stage2-draft",
    prompt: draftPrompt,
  });

  const base = {
    config_file: stage2.configFile,
    email_text: draft.response,
    email_valid: false,
    drafter_latency_ms: draft.latency_ms,
    drafter_cost_usd: draft.cost_usd,
    pipeline_total_cost_usd: draft.cost_usd,
    pipeline_total_latency_ms: draft.latency_ms,
  };

  if (draft.error) {
    return { ...base, email_error: draft.error };
  }
  if (!extractEmailDraft) {
    // No scope schema for EmailDraft — preserve the raw text but skip
    // downstream stages that need the structured form.
    return base;
  }
  const parsed = extractEmailDraft(draft.response);
  if (!parsed.ok) {
    return { ...base, email_error: `extract: ${parsed.error}` };
  }
  const email = parsed.value;
  const bodyText = email.body ?? "";
  const wordCount = bodyText.trim().split(/\s+/).filter(Boolean).length;

  let grounding: GroundingResult | undefined;
  let groundingCost = 0;
  let groundingLatency = 0;
  if (!options.skipGrounding) {
    grounding = await scoreGroundingFaithfulness(bodyText, profile);
    groundingCost = grounding.extraction_cost_usd;
    groundingLatency = grounding.extraction_latency_ms;
  }

  let judge: JudgeSummary | undefined;
  let judgeCost = 0;
  let judgeLatency = 0;
  if (!options.skipJudge) {
    judge = await runJudge(email, profile);
    judgeCost = judge.total_cost_usd;
    judgeLatency = judge.total_latency_ms;
  }

  return {
    ...base,
    email_valid: true,
    email_recipient_name: email.recipient?.name,
    email_subject: email.subject,
    email_body_word_count: wordCount,
    email_grounding_refs: email.grounding_references,
    ...(grounding ? { grounding } : {}),
    ...(judge ? { judge } : {}),
    pipeline_total_cost_usd: draft.cost_usd + groundingCost + judgeCost,
    pipeline_total_latency_ms: draft.latency_ms + groundingLatency + judgeLatency,
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

  // Auto-discover config*.ts files. Stage 2 configs (config-stage2*.ts)
  // are pipeline stages, not candidates — they get loaded separately and
  // run AFTER each Stage 1 candidate's row to produce drafts, then judged.
  const dirEntries = await readdir(exampleDir);
  const allConfigFiles = dirEntries
    .filter((f) => /^config.*\.ts$/.test(f))
    .sort();
  const configFiles = allConfigFiles.filter((f) => !/^config-stage2/.test(f));
  const stage2ConfigFiles = allConfigFiles.filter((f) => /^config-stage2/.test(f));
  if (configFiles.length === 0) {
    console.error(`No Stage 1 config*.ts files found in ${exampleDir}`);
    process.exit(1);
  }

  // Load dataset
  const datasetRaw = await readFile(datasetPath, "utf8");
  const rows: Row[] = datasetRaw
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));

  // Load every Stage 1 candidate config
  const candidates: { configFile: string; candidate: CandidateConfig }[] =
    await Promise.all(
      configFiles.map(async (f) => {
        const mod = (await import(join(exampleDir, f))) as {
          candidate: CandidateConfig;
        };
        return { configFile: f, candidate: mod.candidate };
      }),
    );

  // Load Stage 2 configs (typically just one — the email drafter). Multiple
  // are allowed but only the first is wired into the pipeline today; others
  // are noted in the report metadata so future passes can iterate.
  const stage2Configs: { configFile: string; candidate: CandidateConfig }[] =
    await Promise.all(
      stage2ConfigFiles.map(async (f) => {
        const mod = (await import(join(exampleDir, f))) as {
          candidate: CandidateConfig;
        };
        return { configFile: f, candidate: mod.candidate };
      }),
    );

  // Optionally load the scope's schema.ts — exposes `extractProfile` (Stage 1)
  // and `extractEmailDraft` (Stage 2) helpers. Scopes without them just skip
  // the corresponding metrics / pipeline stages.
  let extractProfile: ExtractProfileFn | undefined;
  let extractEmailDraft: ExtractEmailDraftFn | undefined;
  try {
    const mod = (await import(join(exampleDir, "schema.ts"))) as {
      extractProfile?: ExtractProfileFn;
      extractEmailDraft?: ExtractEmailDraftFn;
    };
    if (typeof mod.extractProfile === "function") {
      extractProfile = mod.extractProfile;
    }
    if (typeof mod.extractEmailDraft === "function") {
      extractEmailDraft = mod.extractEmailDraft;
    }
  } catch {
    // no schema.ts in this scope — fine.
  }

  // E.4 — Stage 2 pipeline cost levers (env flags for cost-controlled smoke
  // runs). SKIP_JUDGE=1 drops the 3×Opus judging; SKIP_GROUNDING=1 drops the
  // Sonnet claim extractor. Both skipped → pipeline just drafts emails.
  const skipJudge = process.env.SKIP_JUDGE === "1";
  const skipGrounding = process.env.SKIP_GROUNDING === "1";

  console.log(
    `Comparison: ${rows.length} rows × ${candidates.length} candidates (parallel)\n`,
  );
  for (const { candidate, configFile } of candidates) {
    console.log(`  - ${candidate.provider}/${candidate.model}  (${configFile})`);
  }
  if (stage2Configs.length > 0) {
    console.log(
      `\nStage 2 pipeline: ${stage2Configs[0].configFile}` +
        `${skipJudge ? " (SKIP_JUDGE)" : ""}${skipGrounding ? " (SKIP_GROUNDING)" : ""}`,
    );
    if (stage2Configs.length > 1) {
      console.log(
        `  (note: ${stage2Configs.length - 1} additional Stage 2 config(s) ignored for now)`,
      );
    }
  }
  console.log();

  const started_at = new Date().toISOString();
  const runs = await Promise.all(
    candidates.map(({ configFile, candidate }) =>
      runCandidate(configFile, candidate, rows, extractProfile),
    ),
  );

  // --- E.4 Stage 2 pipeline ---
  // Runs serially within each candidate (Stage 2 → grounding → judge is a
  // slow chain already) but parallel across candidates to match Stage 1.
  if (stage2Configs.length > 0 && extractProfile) {
    const stage2Cfg = stage2Configs[0];
    console.log("\nRunning Stage 2 pipeline across candidates...");
    await Promise.all(
      runs.map(async (candRun) => {
        for (const rowResult of candRun.results) {
          if (rowResult.error) continue; // Stage 1 failed → nothing to draft from
          const ext = extractProfile!(rowResult.response);
          if (!ext.ok) continue; // schema invalid → skip Stage 2 (row still counts as dead-end)
          rowResult.stage2 = await runStage2Pipeline(
            stage2Cfg,
            ext.value,
            extractEmailDraft,
            { skipJudge, skipGrounding },
          );
        }
        // Recompute the aggregate so Stage 2 metrics surface alongside Stage 1.
        candRun.aggregate = aggregate(candRun.results, rows, extractProfile);
      }),
    );
  }

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
