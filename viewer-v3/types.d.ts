/**
 * types.d.ts — data contract between the benchmark runtime and the v3 viewer.
 *
 * This is what Claude Code needs to implement on the backend to replace
 * `agentic-enrich.js` (the client-side synthesizer). Once every field below
 * is emitted by the comparison runner, delete `agentic-enrich.js`.
 *
 * Authoritative source-of-truth references (from the main repo):
 *   skills/custom-model-bench/scripts/types.ts
 *     — CandidateConfig, Runtime, TraceEntry, ToolDefinition
 *   skills/custom-model-bench/examples/yc-qualifier/schema.ts
 *     — ProspectProfileSchema, EmailDraftSchema, extractProfile, extractEmailDraft
 *   skills/custom-model-bench/examples/yc-qualifier/judge-rubric.md
 *     — the 4 dims × 1-5 rubric used by the Stage 2 judge
 *   skills/custom-model-bench/scripts/graders/grounding_faithfulness.ts
 *     — Claim, ClaimResult, GroundingResult
 *
 * Shapes are written as TypeScript for Claude Code ergonomics; the viewer
 * itself is plain JS and reads these as JSON.
 */

/* ─── Top-level bundle ────────────────────────────────────────────────── */

export type BenchBundle = {
  /** ISO timestamp of the most recent run this bundle covers. */
  generated_at: string;
  /** List of scopes (examples/<scope>/) the viewer can present. */
  scopes: Scope[];
};

/* ─── Scopes ──────────────────────────────────────────────────────────── */

export type Scope = SimpleScope | AgenticScope;

/**
 * Shared scope fields. `kind` discriminates the shape of `runs[i]` and
 * whether the leaderboard renders agentic columns.
 */
type ScopeBase = {
  id: string;                     // e.g. "yc-qualifier", "tool-bench"
  label: string;                  // e.g. "Prospect qualifier"
  blurb: string;                  // one-sentence description
  kind: "simple" | "agentic";     // switch for viewer UI
  dataset: DatasetRow[];          // the prompts being evaluated
  comparison: Comparison;         // per-run metrics + traces
};

export type SimpleScope = ScopeBase & { kind: "simple" };
export type AgenticScope = ScopeBase & {
  kind: "agentic";
  /** Declarative description of the pipeline shape. Viewer renders it as a
   *  per-scope figure; use `workflow-diagram.js` for known scopes or fall
   *  back to the auto-layout in `stage2-drilldown.js`. */
  workflow?: Workflow;
};

/* ─── Dataset rows ────────────────────────────────────────────────────── */

/**
 * A single row in the scope's dataset. Rows are free-form beyond `id` +
 * `prompt`; the shape below is what yc-qualifier actually ships. Graders
 * key off of the `expected_*` fields.
 */
export type DatasetRow = {
  id: string;                     // "yc-001"
  prompt: string;
  [expectedField: string]: unknown;   // expected_github_org, expected_fit_score_range, etc.
};

/* ─── Comparisons ─────────────────────────────────────────────────────── */

export type Comparison = {
  runs: Run[];
  /** Scope-level aggregate, present only when kind === "agentic". */
  agentic_aggregate?: AgenticAggregate;
};

/* ─── Per-run (= per candidate) ───────────────────────────────────────── */

export type Run = SimpleRun | AgenticRun;

type RunBase = {
  /** Candidate identity — matches the config-*.ts file this run came from. */
  candidate_id: string;           // "stage1-anthropic-opus"
  provider: "anthropic" | "openai" | "google" | "xai";
  model: string;                  // "claude-opus-4-7"
  tier: "frontier" | "balanced" | "fast";
  runtime: "vercel" | "cagent-sdk";
  label: string;                  // human-readable display name

  /** Aggregate-level stats — shared between simple + agentic. */
  rows_total: number;
  rows_ok: number;
  success_rate: number;           // 0-1
  mean_cost_usd: number;
  mean_latency_ms: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  total_cost_usd: number;

  /** Per-row traces. Length should equal `rows_total`. */
  rows: RunRow[];
};

export type SimpleRun = RunBase;

export type AgenticRun = RunBase & {
  /** Present on every agentic run. Aggregates Stage 1 + Stage 2 + graders. */
  agentic: {
    /** Fraction of rows whose Stage 1 output parsed against ProspectProfileSchema. */
    schema_compliance: number;    // 0-1
    /** Fraction of rows the agent pursued to a non-dead-end conclusion. */
    task_completion: number;      // 0-1
    /** Fraction of rows that recovered from at least one tool error. */
    recovery_rate: number;        // 0-1
    /** Mean fabrication_rate across all Stage 2 draft emails. Lower is better. */
    fabrication_rate: number;     // 0-1
    /** Judge overall mean (mean of 4 dims × 3 runs). 1-5 scale. */
    judge_overall_mean: number;
    /** Standard deviation of judge_overall across the 3 runs. */
    judge_overall_std: number;
    /** Per-row: turns, tool calls, claims extracted. For the Behavior screen. */
    mean_turns: number;
    mean_tool_calls: number;
    cost_per_task_usd: number;    // = total_cost_usd / rows_total
  };
};

/* ─── Per-row trace (one row × one candidate) ─────────────────────────── */

export type RunRow = {
  row_id: string;                 // matches DatasetRow.id
  response: string;               // raw final message from the candidate
  latency_ms: number;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  turns: number;
  error?: string;                 // set when the runtime threw
  /** Linearized TraceEntry[] — interleaved assistant text + tool calls/results. */
  trace?: TraceEntry[];
  /** Present on agentic scopes only. */
  stage2?: Stage2;
};

export type TraceEntry =
  | { type: "assistant_text"; step: number; text: string }
  | { type: "tool_call";      step: number; name: string; input: unknown; id: string }
  | { type: "tool_result";    step: number; name: string; output: unknown; id: string };

/* ─── Stage 2 (agentic rows) ──────────────────────────────────────────── */

export type Stage2 = {
  /** Parsed Stage 1 ProspectProfile this row's drafter saw. When the
   *  Stage 1 output failed schema validation, this is `null` and the
   *  drafter was not invoked. */
  profile: ProspectProfile | null;
  /** Stage 2 output (or null if profile was null or drafter errored). */
  email: EmailDraft | null;
  /** Per-claim grounding results from grounding_faithfulness.ts. */
  grounding: GroundingResult | null;
  /** Three judge runs + the computed aggregate. */
  judge: {
    runs: JudgeRun[];             // length = 3
    overall_mean: number;         // average of 12 scores (4 dims × 3 runs)
    overall_std: number;          // std-dev of the 3 per-run means
  } | null;
};

export type ProspectProfile = {
  target_company: string;
  github_org: string | null;
  tech_stack: string[];
  top_repos: Array<{ name: string; stars: number; language: string }>;
  contacts: Array<{ name: string; role: string; linkedin_slug: string | null }>;
  tech_stack_overlap_pct: number; // 0-100
  fit_score: number;              // 0-100
  rationale: string;
};

export type EmailDraft = {
  recipient: { name: string; role: string; linkedin_slug: string | null };
  subject: string;                // ≤9 words, "" on dead-end
  body: string;                   // 80-140 words, "" on dead-end
  grounding_references: string[]; // dotted paths into the ProspectProfile
};

export type GroundingResult = {
  claims_total: number;
  grounded: number;
  hallucinated: number;
  fabrication_rate: number;       // 0-1
  hallucinated_claims: string[];
  claim_results: Array<{
    claim: string;
    type: "named_entity" | "number" | "url" | "tech" | "event";
    grounded: boolean;
    evidence?: string;            // what we matched against / why it failed
  }>;
  extraction_cost_usd: number;
  extraction_latency_ms: number;
  extraction_error?: string;      // present when the extractor itself failed
};

export type JudgeRun = {
  /** Which Opus 4.7 pass this is — 1, 2, or 3. */
  pass: 1 | 2 | 3;
  grounding:      { score: 1|2|3|4|5; rationale: string };
  specificity:    { score: 1|2|3|4|5; rationale: string };
  relevance:      { score: 1|2|3|4|5; rationale: string };
  call_to_action: { score: 1|2|3|4|5; rationale: string };
  /** Mean of the 4 dimension scores. */
  overall: number;
};

/* ─── Agentic aggregate (scope-level, across all rows × all candidates) ── */

export type AgenticAggregate = {
  /** Mean task-completion across every agentic run in this scope. */
  mean_task_completion: number;
  /** Mean judge overall_mean across every agentic run. */
  mean_judge_overall: number;
  /** Highest-variance (judge_overall_std) run candidate_id in the scope. */
  highest_variance_candidate: string;
  /** Pairs of runs that share a model but differ in runtime. For each pair,
   *  the delta card on the leaderboard shows cost / turns / p50 side-by-side. */
  same_model_pairs: Array<{
    model: string;
    runtimes: { vercel: string; cagent_sdk: string }; // candidate_ids
  }>;
};

/* ─── Workflow (diagram) ──────────────────────────────────────────────── */

/**
 * Declarative pipeline shape. The viewer currently only has a hand-composed
 * figure for `yc-qualifier`; new agentic scopes fall back to the auto-layout
 * renderer in stage2-drilldown.js. When you add a new pipeline shape,
 * consider drawing a bespoke figure in workflow-diagram.js — generic
 * flowcharts read as AI-generated slop. A considered figure is worth it.
 */
export type Workflow = {
  title: string;
  nodes: WorkflowNode[];
  edges: Array<[string, string]>; // [source_id, dest_id]
};

export type WorkflowNode = {
  id: string;
  kind: "input" | "agent" | "tool" | "schema" | "check" | "output";
  label: string;
  sub: string;                    // monospace sub-caption
};
