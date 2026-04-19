/**
 * adapters/cagent.ts — Claude Agent SDK runtime.
 *
 * Parallel to the Vercel AI SDK path in run-comparison.ts. Takes the same
 * CandidateConfig shape, drives @anthropic-ai/claude-agent-sdk, and returns
 * a RowResult that the comparison runner can aggregate without knowing which
 * runtime produced it.
 *
 * Custom tools are wrapped as an in-process SDK MCP server; their call names
 * come back prefixed with `mcp__<server>__` — we strip that when recording
 * the trace so viewer-v2's trace visualizer renders both runtimes the same.
 */

import {
  query,
  tool as cagentTool,
  createSdkMcpServer,
} from "@anthropic-ai/claude-agent-sdk";
import { computeCost } from "../pricing";
import { gradeRow } from "../graders/exact_match";
import type { CandidateConfig, ToolDefinition, TraceEntry } from "../types";

const MCP_SERVER_NAME = "bench_tools";
const DEFAULT_MAX_TURNS = 10;

type Row = {
  id: string;
  prompt: string;
  expected_answer?: string;
};

export type CagentRowResult = {
  id: string;
  prompt: string;
  response: string;
  turns: number;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  error: string | null;
  answer_extracted?: string | null;
  answer_correct?: boolean | null;
  trace?: TraceEntry[];
};

function wrapToolsAsMcpServer(tools: ToolDefinition[] | undefined) {
  if (!tools || tools.length === 0) return null;
  const cagentTools = tools.map((t) => {
    // Our tools declare `inputSchema: z.ZodType` (typically a z.object). The
    // SDK's tool() factory wants the raw shape object. z.object exposes its
    // shape via both `.shape` (getter) and `._def.shape()` (fn) depending on
    // Zod version — try both.
    const anySchema = t.inputSchema as any;
    const shape =
      (typeof anySchema?._def?.shape === "function"
        ? anySchema._def.shape()
        : anySchema?.shape) ?? {};
    return cagentTool(
      t.name,
      t.description,
      shape,
      async (args: any) => {
        const output = await t.handler(args);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(output) },
          ],
        };
      },
    );
  });
  return createSdkMcpServer({
    name: MCP_SERVER_NAME,
    version: "1.0.0",
    tools: cagentTools,
  });
}

/**
 * Run a single dataset row through the Claude Agent SDK. Shape of the return
 * value matches the Vercel path's RowResult so aggregate() doesn't care which
 * runtime produced it.
 */
export async function runCagentRow(
  candidate: CandidateConfig,
  row: Row,
): Promise<CagentRowResult> {
  if (candidate.provider !== "anthropic") {
    return {
      id: row.id,
      prompt: row.prompt,
      response: "",
      turns: 0,
      latency_ms: 0,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      error: `cagent-sdk runtime requires provider=anthropic (got ${candidate.provider})`,
    };
  }

  const startedAt = performance.now();
  try {
    const mcpServer = wrapToolsAsMcpServer(candidate.tools);
    const allowedTools = (candidate.tools ?? []).map(
      (t) => `mcp__${MCP_SERVER_NAME}__${t.name}`,
    );
    const maxTurns = candidate.maxTurns ?? DEFAULT_MAX_TURNS;

    const q = query({
      prompt: row.prompt,
      options: {
        model: candidate.model,
        // Empty tools list disables built-in Claude Code tools (Bash, Read,
        // Glob, etc.). The agent sees only the bench tools we registered.
        tools: [],
        maxTurns,
        ...(candidate.systemPrompt
          ? { systemPrompt: candidate.systemPrompt }
          : {}),
        ...(mcpServer
          ? {
              mcpServers: { [MCP_SERVER_NAME]: mcpServer as any },
              allowedTools,
            }
          : {}),
      },
    });

    const trace: TraceEntry[] = [];
    let step = 0;
    let finalText = "";
    let resultMsg: any = null;
    // The SDK emits each SDKAssistantMessage multiple times through the stream
    // (observed 3×/round in smoke tests — likely hook lifecycle events).
    // Dedupe on `msg.uuid` before extracting trace entries so we don't log
    // every model round three times.
    const seenAssistantUuids = new Set<string>();

    for await (const msg of q as any) {
      if (msg.type === "assistant") {
        if (msg.uuid && seenAssistantUuids.has(msg.uuid)) continue;
        if (msg.uuid) seenAssistantUuids.add(msg.uuid);
        const content: any[] = msg.message?.content ?? [];
        let sawAny = false;
        for (const block of content) {
          if (block.type === "text" && block.text) {
            trace.push({ type: "assistant_text", step, text: block.text });
            sawAny = true;
          } else if (block.type === "tool_use") {
            const strippedName = (block.name as string).startsWith(
              `mcp__${MCP_SERVER_NAME}__`,
            )
              ? (block.name as string).slice(
                  `mcp__${MCP_SERVER_NAME}__`.length,
                )
              : block.name;
            trace.push({
              type: "tool_call",
              step,
              name: strippedName,
              input: block.input,
              id: block.id,
            });
            sawAny = true;
          }
        }
        if (sawAny) step += 1;
      } else if (msg.type === "user") {
        const content: any[] = msg.message?.content ?? [];
        for (const block of content) {
          if (block.type === "tool_result") {
            const prevCall = [...trace]
              .reverse()
              .find(
                (e) =>
                  e.type === "tool_call" && e.id === block.tool_use_id,
              ) as { name?: string } | undefined;
            trace.push({
              type: "tool_result",
              step,
              name: prevCall?.name ?? "?",
              output: block.content,
              id: block.tool_use_id,
            });
          }
        }
      } else if (msg.type === "result") {
        resultMsg = msg;
        if (msg.subtype === "success") {
          finalText = msg.result ?? "";
        }
      }
    }

    const latency_ms = Math.round(performance.now() - startedAt);
    // Pull cumulative token counts from result.usage. Each per-message
    // `usage` field reports only that model call's incremental tokens AND is
    // emitted multiple times per round (see dedupe above), so summing it is
    // unreliable. `result.usage` is the single source of truth.
    const rUsage = resultMsg?.usage ?? {};
    const input_tokens = rUsage.input_tokens ?? 0;
    const output_tokens = rUsage.output_tokens ?? 0;
    const cache_read_tokens = rUsage.cache_read_input_tokens ?? 0;
    const cache_creation_tokens = rUsage.cache_creation_input_tokens ?? 0;
    // Effective input tokens = new + cache_read + cache_creation. The Vercel
    // path reports gross input tokens (cache-inclusive) via generateText, so
    // surface a comparable cumulative for symmetry on the leaderboard. Keep
    // the cache breakdown as extra fields for analysis.
    const effective_input_tokens =
      input_tokens + cache_read_tokens + cache_creation_tokens;
    // Prefer the SDK's reported cost (Anthropic billing precision + cache
    // discount). Fallback to our pricing table only if it's missing.
    const cost_usd =
      typeof resultMsg?.total_cost_usd === "number"
        ? resultMsg.total_cost_usd
        : computeCost(candidate.model, effective_input_tokens, output_tokens);
    // `result.num_turns` counts distinct assistant model rounds — same
    // semantics as Vercel's `result.steps.length`. The inflated counts seen
    // in my dedupe-less smoke test were an artifact of the SDK emitting
    // the same assistant message multiple times, not of `num_turns` itself.
    const turns =
      typeof resultMsg?.num_turns === "number"
        ? resultMsg.num_turns
        : Math.max(1, step);

    if (resultMsg?.subtype && resultMsg.subtype !== "success") {
      return {
        id: row.id,
        prompt: row.prompt,
        response: finalText,
        turns,
        latency_ms,
        input_tokens: effective_input_tokens,
        output_tokens,
        cost_usd,
        error: `cagent-sdk: ${resultMsg.subtype}${
          resultMsg.errors?.length ? ` — ${resultMsg.errors.join("; ")}` : ""
        }`,
        ...(trace.length > 0 ? { trace } : {}),
      };
    }

    const { extracted, correct } = gradeRow(finalText, row.expected_answer);
    return {
      id: row.id,
      prompt: row.prompt,
      response: finalText,
      turns,
      latency_ms,
      input_tokens,
      output_tokens,
      cost_usd,
      error: null,
      answer_extracted: row.expected_answer != null ? extracted : null,
      answer_correct: row.expected_answer != null ? correct : null,
      ...(trace.length > 0 ? { trace } : {}),
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
