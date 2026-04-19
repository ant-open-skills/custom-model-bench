/**
 * grounding_faithfulness.ts — claim-extraction fabrication detector.
 *
 * Two-stage pipeline:
 *   1. Sonnet 4.6 (via CAgent SDK) extracts factual claims from the email
 *      body as a typed JSON array.
 *   2. Each claim is normalized and matched against the ProspectProfile
 *      via a deterministic substring/entity check. No second model call —
 *      the matcher is code so the grader is reproducible and auditable.
 *
 * Failure-mode bias: under-extraction lets fabrications slip; over-extraction
 * flags reasonable paraphrases as hallucinations. Per the Phase E ultra-plan
 * we tolerate over-extraction (false positives — flagging paraphrases) more
 * than under-extraction (false negatives — missing real fabrications). The
 * extractor prompt skews accordingly.
 */

import { z } from "zod";
import { runCagentRow } from "../adapters/cagent";
import type { CandidateConfig } from "../types";

const CLAIM_TYPES = ["named_entity", "number", "url", "tech", "event"] as const;
type ClaimType = (typeof CLAIM_TYPES)[number];

const ClaimSchema = z.object({
  text: z.string(),
  type: z.enum(CLAIM_TYPES),
});
const ClaimsSchema = z.object({
  claims: z.array(ClaimSchema),
});

export type Claim = z.infer<typeof ClaimSchema>;

export type ClaimResult = {
  claim: string;
  type: ClaimType;
  grounded: boolean;
  /** Optional human-readable note — what we matched against, or why it failed. */
  evidence?: string;
};

export type GroundingResult = {
  claims_total: number;
  grounded: number;
  hallucinated: number;
  fabrication_rate: number;
  hallucinated_claims: string[];
  claim_results: ClaimResult[];
  /** Best-effort cost telemetry from the extractor call. */
  extraction_cost_usd: number;
  extraction_latency_ms: number;
  /** Surfaces extractor failures so the caller can decide to fall back vs.
   *  treat as "no claims extracted". Unset on the success path. */
  extraction_error?: string;
};

const EXTRACTOR_PROMPT = `You are a factual-claim extractor. Given the body of a cold-outreach email, list every CONCRETE FACTUAL CLAIM the email makes about the recipient or their company.

A "claim" is a specific assertion that could be true or false against a known reality. Extract these types:

- **named_entity**: specific company names, product names, repo names, person names (other than the sender), tools/platforms.
- **number**: specific numbers — headcount, dollar amounts, percentages, counts of users/customers/repos, version numbers, dates, durations, ages.
- **url**: any URL or domain reference.
- **tech**: specific technologies, languages, frameworks, infrastructure choices ("Postgres", "Rust", "Kubernetes", "PLpgSQL", "Tauri").
- **event**: specific historical or current events — funding rounds, product launches, acquisitions, partnerships, IPOs, milestones.

DO NOT extract:
- Generic adjectives ("growing", "innovative", "interesting").
- Vague qualifiers ("at scale", "many", "some").
- The sender's claims about themselves or their own product.
- Claims about hypothetical future states ("would help you scale", "could provide").
- Standard pleasantries ("hope you're well", "best regards").

When in doubt, ERR ON THE SIDE OF EXTRACTING THE CLAIM. False positives (extracting reasonable paraphrases) are acceptable; missing a genuine fabrication is not.

For each claim, copy the exact phrase from the email (or a tight paraphrase if the surrounding prose makes the claim split across multiple words).

## Output

Your final message must end with a single JSON object — no markdown, no commentary:

\`\`\`
{
  "claims": [
    { "text": "<verbatim phrase from email>", "type": "<one of: named_entity|number|url|tech|event>" }
  ]
}
\`\`\`

If the email is genuinely empty (a dead-end skip with empty body), return \`{ "claims": [] }\`.`;

const EXTRACTOR_CONFIG: CandidateConfig = {
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  systemPrompt: EXTRACTOR_PROMPT,
  runtime: "cagent-sdk",
  maxTurns: 2,
  maxOutputTokens: 1500,
};

function extractClaimsJson(
  responseText: string,
): { ok: true; value: Claim[] } | { ok: false; error: string } {
  if (!responseText) return { ok: false, error: "empty response" };
  // Same balanced-brace walker pattern as schema.ts. Inline rather than
  // importing because graders shouldn't depend on a specific scope's schema.
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
  const r = ClaimsSchema.safeParse(parsed);
  if (!r.success) {
    return {
      ok: false,
      error: `Zod: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    };
  }
  return { ok: true, value: r.data.claims };
}

/** Lowercase, strip non-alphanumeric outside word boundaries, collapse whitespace.
 *  The goal is to make "PostgreSQL" match "postgresql" and "Series-C" match
 *  "series c" while keeping numeric tokens (15K, $80M) recognisable. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9$%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Number normalizer: "$80M" → "80m", "10,000" → "10000", "7M+" → "7m".
 *  Returns null if the input has no numeric content worth checking. */
function extractNumericTokens(s: string): string[] {
  const tokens: string[] = [];
  // K/M/B/T multipliers, with optional $ prefix and optional + suffix
  const reMagnitude = /\$?\s?(\d+(?:[.,]\d+)?)\s?([kmbt])\+?/gi;
  let m: RegExpExecArray | null;
  while ((m = reMagnitude.exec(s)) !== null) {
    tokens.push(`${m[1].replace(/[.,]/g, "")}${m[2].toLowerCase()}`);
  }
  // Bare numbers (4+ digits, with optional thousand commas)
  const rePlain = /\b\d{1,3}(?:,\d{3})+\b|\b\d{4,}\b/g;
  while ((m = rePlain.exec(s)) !== null) {
    tokens.push(m[0].replace(/,/g, ""));
  }
  // Years (1900-2099) deliberately captured so "founded in 2018" matches.
  const reYear = /\b(19|20)\d{2}\b/g;
  while ((m = reYear.exec(s)) !== null) tokens.push(m[0]);
  return tokens;
}

/**
 * Check whether a single claim is grounded in the ProspectProfile.
 *
 * Strategy:
 *   - For `number` claims, extract numeric tokens from both the claim and
 *     the haystack; require at least one shared token.
 *   - For `url` claims, normalize host+path and substring-match.
 *   - For `tech`, `named_entity`, `event` claims, require the normalized
 *     claim phrase (or a substantial subphrase ≥3 chars) to appear as a
 *     substring of the normalized ProspectProfile JSON.
 *
 * False positives (claim looks grounded when it isn't) are tolerated more
 * than false negatives, because we want this grader to be a soft signal,
 * not a tribunal — the rubric judge catches qualitative grounding too.
 */
function checkClaim(claim: Claim, haystackNorm: string): ClaimResult {
  const claimNorm = normalize(claim.text);
  if (!claimNorm) {
    return { claim: claim.text, type: claim.type, grounded: true, evidence: "empty claim text — skipped" };
  }

  if (claim.type === "number") {
    const claimNums = extractNumericTokens(claim.text);
    if (claimNums.length === 0) {
      // No numeric tokens (e.g. claim was a vague "many"); fall through to
      // string match.
    } else {
      const haystackNums = new Set(extractNumericTokens(haystackNorm));
      for (const n of claimNums) {
        if (haystackNums.has(n)) {
          return { claim: claim.text, type: claim.type, grounded: true, evidence: `numeric token "${n}" present` };
        }
      }
      return { claim: claim.text, type: claim.type, grounded: false, evidence: `numeric tokens [${claimNums.join(", ")}] not in profile` };
    }
  }

  if (claim.type === "url") {
    // Normalize away protocol/trailing slash, then substring.
    const u = claim.text
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "")
      .toLowerCase();
    if (haystackNorm.includes(normalize(u))) {
      return { claim: claim.text, type: claim.type, grounded: true, evidence: "url substring found" };
    }
    return { claim: claim.text, type: claim.type, grounded: false, evidence: "url not in profile" };
  }

  // Default: string-match strategy. First try the full normalized claim.
  if (haystackNorm.includes(claimNorm)) {
    return { claim: claim.text, type: claim.type, grounded: true, evidence: "full phrase match" };
  }
  // Then try each alphanum token of length ≥3 — at least one must be present.
  // This catches "PostgreSQL" matching "Postgres" via the longest shared token.
  const tokens = claimNorm.split(" ").filter((t) => t.length >= 3);
  if (tokens.length === 0) {
    return { claim: claim.text, type: claim.type, grounded: false, evidence: "claim is too short to match" };
  }
  const found = tokens.filter((t) => haystackNorm.includes(t));
  if (found.length >= Math.ceil(tokens.length / 2)) {
    // ≥50% of significant tokens present — counts as grounded.
    return { claim: claim.text, type: claim.type, grounded: true, evidence: `tokens matched: ${found.join(", ")}` };
  }
  return { claim: claim.text, type: claim.type, grounded: false, evidence: `tokens missing: ${tokens.filter((t) => !haystackNorm.includes(t)).join(", ")}` };
}

export type GroundingOptions = {
  /** Override the extractor model/config (e.g. swap Sonnet for Haiku to cut cost). */
  extractor?: Partial<CandidateConfig>;
};

/**
 * Score an email's grounding faithfulness against the ProspectProfile.
 *
 * @param emailBody  Body text of the EmailDraft.
 * @param profile    Stage 1 ProspectProfile (any JSON-serialisable value).
 *
 * Empty bodies (dead-end drafts) return a neutral perfect score —
 * { claims_total: 0, fabrication_rate: 0 } — so the metric doesn't penalise
 * the drafter for correctly skipping a non-prospect.
 */
export async function scoreGroundingFaithfulness(
  emailBody: string,
  profile: unknown,
  options: GroundingOptions = {},
): Promise<GroundingResult> {
  if (!emailBody || emailBody.trim().length === 0) {
    return {
      claims_total: 0,
      grounded: 0,
      hallucinated: 0,
      fabrication_rate: 0,
      hallucinated_claims: [],
      claim_results: [],
      extraction_cost_usd: 0,
      extraction_latency_ms: 0,
    };
  }

  const cfg: CandidateConfig = { ...EXTRACTOR_CONFIG, ...(options.extractor ?? {}) };
  const extractRun = await runCagentRow(cfg, {
    id: "claim-extract",
    prompt: `Extract every concrete factual claim from this email body:\n\n---\n${emailBody}\n---`,
  });

  if (extractRun.error) {
    return {
      claims_total: 0,
      grounded: 0,
      hallucinated: 0,
      fabrication_rate: 0,
      hallucinated_claims: [],
      claim_results: [],
      extraction_cost_usd: extractRun.cost_usd,
      extraction_latency_ms: extractRun.latency_ms,
      extraction_error: `extractor: ${extractRun.error}`,
    };
  }

  const parsed = extractClaimsJson(extractRun.response);
  if (!parsed.ok) {
    return {
      claims_total: 0,
      grounded: 0,
      hallucinated: 0,
      fabrication_rate: 0,
      hallucinated_claims: [],
      claim_results: [],
      extraction_cost_usd: extractRun.cost_usd,
      extraction_latency_ms: extractRun.latency_ms,
      extraction_error: `parse: ${parsed.error}`,
    };
  }

  const haystackNorm = normalize(JSON.stringify(profile));
  const results = parsed.value.map((c) => checkClaim(c, haystackNorm));
  const grounded = results.filter((r) => r.grounded).length;
  const hallucinated = results.length - grounded;
  return {
    claims_total: results.length,
    grounded,
    hallucinated,
    fabrication_rate: results.length === 0 ? 0 : hallucinated / results.length,
    hallucinated_claims: results.filter((r) => !r.grounded).map((r) => r.claim),
    claim_results: results,
    extraction_cost_usd: extractRun.cost_usd,
    extraction_latency_ms: extractRun.latency_ms,
  };
}
