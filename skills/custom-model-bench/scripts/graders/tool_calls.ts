/**
 * tool_calls — trace-analyzing graders for tool usage.
 *
 * Two checks:
 *  - `checkToolCallAccuracy`: how many of the row's `expected_tools` appeared
 *    as `tool_call` entries in the trace. Returns {expected, seen, rate}.
 *  - `checkEfficiency`: total tool calls ≤ row.max_tool_calls. Boolean.
 *
 * Both are defensive: a missing trace or expected field yields `null` so the
 * aggregate can cleanly gate the metric.
 */

import type { TraceEntry } from "../types";

export type ToolCallAccuracy = {
  expected: number;
  seen: number;
  /** seen / expected, or 1 when expected is 0. */
  rate: number;
};

/**
 * Count unique expected tool names that appear at least once as a `tool_call`
 * in the trace. We deliberately check *at-least-once* rather than ordered
 * matching — the eval's question is "did the agent use the right tools,"
 * not "did it use them in a specific sequence."
 */
export function checkToolCallAccuracy(
  trace: TraceEntry[] | undefined,
  expectedTools: string[] | undefined,
): ToolCallAccuracy | null {
  if (!expectedTools) return null;
  const expected = expectedTools.length;
  if (!trace || trace.length === 0) {
    return { expected, seen: 0, rate: expected === 0 ? 1 : 0 };
  }
  const seenNames = new Set<string>();
  for (const entry of trace) {
    if (entry.type === "tool_call") seenNames.add(entry.name);
  }
  let seen = 0;
  for (const name of expectedTools) {
    if (seenNames.has(name)) seen += 1;
  }
  return {
    expected,
    seen,
    rate: expected === 0 ? 1 : seen / expected,
  };
}

/**
 * True iff the total number of tool calls is within the row's budget.
 * Returns null when the budget isn't specified.
 */
export function checkEfficiency(
  trace: TraceEntry[] | undefined,
  maxToolCalls: number | undefined,
): boolean | null {
  if (maxToolCalls == null) return null;
  const total = countToolCalls(trace);
  return total <= maxToolCalls;
}

export function countToolCalls(trace: TraceEntry[] | undefined): number {
  if (!trace) return 0;
  let n = 0;
  for (const e of trace) if (e.type === "tool_call") n += 1;
  return n;
}
