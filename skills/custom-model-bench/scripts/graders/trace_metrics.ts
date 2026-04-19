/**
 * trace_metrics — D.2 trace-analyzing metrics.
 *
 * Operates on the linearized TraceEntry[] shape persisted per row. Each helper
 * is self-contained and returns a small number (or boolean) so the aggregate
 * step can roll them up across rows.
 *
 *  - `isRecovery`: did the trace contain an error tool_result followed by a
 *    successful call to a *different* tool, AND did the row succeed overall?
 *    False-negatives are fine; we skew conservative to avoid false positives.
 *  - `isDeadEnd`: schema-check failed OR no JSON at all in the response.
 *    Computed in run-comparison.ts off the schema grader result, not here.
 */

import type { TraceEntry } from "../types";

/**
 * Heuristic error detector for a tool_result entry. We look for the shapes
 * produced by the yc-qualifier mock fixtures (top-level `error` key in a
 * JSON string, or a textual hint), plus the generic `error: true` field
 * some tools might emit. Defensive: false negatives are preferred over
 * false positives.
 */
function isToolResultError(entry: Extract<TraceEntry, { type: "tool_result" }>): boolean {
  const output = entry.output;
  if (output == null) return true;
  if (typeof output === "string") {
    return /\berror\b/i.test(output);
  }
  if (Array.isArray(output)) {
    // The cagent-sdk adapter surfaces tool_result content as an array of
    // {type: "text", text: "..."} blocks. Peek at the inner text.
    for (const item of output) {
      if (item && typeof item === "object") {
        const t = (item as any).text;
        if (typeof t === "string" && /"error"\s*:/.test(t)) return true;
        if (typeof t === "string" && /\berror\b/i.test(t) && t.length < 400) {
          // Short error-looking string — likely an error payload.
          return true;
        }
      }
    }
    return false;
  }
  if (typeof output === "object") {
    const obj = output as Record<string, unknown>;
    if ("error" in obj) return true;
  }
  return false;
}

/**
 * True iff the trace shows the agent recovering from a tool error by
 * switching to a different tool and the row succeeded overall.
 *
 * Heuristic:
 *   1. Find a tool_result with an error.
 *   2. Find a subsequent tool_call whose `name` differs from the failing
 *      tool_result's `name`.
 *   3. Require `rowSucceeded` to be true so we don't score "recovered and
 *      still failed."
 */
export function isRecovery(
  trace: TraceEntry[] | undefined,
  rowSucceeded: boolean,
): boolean {
  if (!rowSucceeded || !trace || trace.length === 0) return false;
  for (let i = 0; i < trace.length; i++) {
    const entry = trace[i];
    if (entry.type !== "tool_result") continue;
    if (!isToolResultError(entry)) continue;
    const failedTool = entry.name;
    for (let j = i + 1; j < trace.length; j++) {
      const later = trace[j];
      if (later.type === "tool_call" && later.name !== failedTool) {
        return true;
      }
    }
  }
  return false;
}

/**
 * p50 helper. Expects pre-sorted input. Kept here so aggregate() in
 * run-comparison.ts doesn't grow yet another private helper.
 */
export function p50Sorted(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const i = Math.ceil(0.5 * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(i, sorted.length - 1))];
}
