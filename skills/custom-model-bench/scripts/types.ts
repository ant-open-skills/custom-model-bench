/**
 * Shared types for custom-model-bench.
 *
 * Phase A.1 — surface for tool-calling support. No handlers yet; later phases
 * (B.1, B.2) implement concrete tools against this type. Phase A.2 extends
 * CandidateConfig to accept `tools?: ToolDefinition[]`.
 */

import type { z } from "zod";

/**
 * Describes a single tool that a candidate agent can call.
 *
 * The `name` must be unique within a CandidateConfig and is what the model
 * references in its tool-call responses (Vercel AI SDK registers tools under
 * this key). The handler is async; callers should catch exceptions and surface
 * them on the trace rather than failing the whole run.
 */
export type ToolDefinition<TInput = any, TOutput = any> = {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  handler: (input: TInput) => Promise<TOutput>;
};

/** A keyed collection of tools, indexed by ToolDefinition.name. */
export type ToolSet = Record<string, ToolDefinition>;

/** Which runtime drives the candidate. `vercel` (default) uses the Vercel AI
 *  SDK's generateText + tool-calling loop — multi-provider. `cagent-sdk` uses
 *  Anthropic's Claude Agent SDK, so `provider` must be `anthropic`. The two
 *  runtimes share dataset + graders + trace schema; they differ only in how
 *  the model is invoked and how tool calls are orchestrated. */
export type Runtime = "vercel" | "cagent-sdk";

/** Shared CandidateConfig for the whole project. Each example scope's
 *  `config-*.ts` files export a `candidate: CandidateConfig`. */
export type CandidateConfig = {
  provider: "anthropic" | "openai" | "google" | "xai";
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** Tools the candidate may call. When empty/undefined, single-turn only. */
  tools?: ToolDefinition[];
  /** Max tool-use rounds; only meaningful with `tools`. Defaults to 10. */
  maxTurns?: number;
  /** Runtime that drives the candidate. Defaults to `"vercel"`. */
  runtime?: Runtime;
};

/**
 * Compact linearized record of a tool-enabled run, persisted per row so the
 * viewer (and downstream graders) can inspect exactly how the agent got from
 * prompt to final answer. `step` is the round-trip-to-model index, starting at
 * 0; tool calls and their matching results share a `name` and `id`.
 */
export type TraceEntry =
  | { type: "assistant_text"; step: number; text: string }
  | { type: "tool_call"; step: number; name: string; input: unknown; id: string }
  | { type: "tool_result"; step: number; name: string; output: unknown; id: string };
