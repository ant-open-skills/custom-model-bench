/**
 * Schema for the Stage 1 output of the YC prospect qualifier.
 *
 * Agents aren't forced into structured output by the SDK (we use
 * generateText so tools are available). Instead the system prompt asks the
 * model to emit a JSON object at the end of its final message; downstream
 * graders parse the response and validate with this Zod schema.
 */

import { z } from "zod";

export const RepoSchema = z.object({
  name: z.string(),
  stars: z.number().int().nonnegative(),
  language: z.string(),
});

export const ContactSchema = z.object({
  name: z.string(),
  role: z.string(),
  linkedin_slug: z.string().nullable(),
});

export const ProspectProfileSchema = z.object({
  target_company: z.string(),
  github_org: z.string().nullable(),
  tech_stack: z.array(z.string()),
  top_repos: z.array(RepoSchema).max(5),
  contacts: z.array(ContactSchema).max(6),
  tech_stack_overlap_pct: z.number().min(0).max(100),
  fit_score: z.number().min(0).max(100),
  rationale: z.string(),
});

export type ProspectProfile = z.infer<typeof ProspectProfileSchema>;

/**
 * Attempt to extract a ProspectProfile JSON from a free-form model response.
 * Looks for the last balanced `{ ... }` block — models sometimes wrap in
 * markdown despite instructions. Returns { ok: true, value } on a clean
 * parse+validate, otherwise { ok: false, error } with a human-readable hint.
 */
export function extractProfile(
  responseText: string,
): { ok: true; value: ProspectProfile } | { ok: false; error: string } {
  if (!responseText) return { ok: false, error: "empty response" };

  // Find the last balanced {...} block. Accepts responses with preceding
  // reasoning text or stray markdown. Walks character-by-character
  // respecting string literals so braces inside quoted strings don't
  // throw off the matcher.
  const open = responseText.lastIndexOf("{");
  if (open < 0) return { ok: false, error: "no { found in response" };

  // Walk backwards from the last } that balances the last {
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
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) { end = i; /* keep walking in case another object follows */ }
    }
  }
  if (start < 0 || end < 0) return { ok: false, error: "unbalanced braces" };

  const jsonText = responseText.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    return { ok: false, error: `JSON.parse failed: ${(e as Error).message}` };
  }
  const result = ProspectProfileSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, error: `Zod: ${result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}` };
  }
  return { ok: true, value: result.data };
}
