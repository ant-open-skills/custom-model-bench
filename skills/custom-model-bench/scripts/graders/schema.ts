/**
 * schema — validate a candidate's final response as a ProspectProfile JSON.
 *
 * Uses the example scope's `extractProfile()` helper, which walks balanced
 * `{...}` blocks in the model output to find valid JSON, then runs Zod's
 * `safeParse()` against the `ProspectProfile` schema. Returns a simple
 * `{valid, errors?}` shape so the aggregate step can count schema-compliant
 * rows without knowing Zod internals.
 *
 * Kept generic on the scope's schema module path because future scopes may
 * ship their own `schema.ts` with a different ProspectProfile-like export.
 */

export type SchemaCheck = {
  valid: boolean;
  errors?: string[];
  /** When valid, the parsed value is surfaced so downstream graders
   *  (ground_truth.ts) can reuse it without re-parsing. */
  value?: unknown;
};

type ExtractFn = (text: string) =>
  | { ok: true; value: unknown }
  | { ok: false; error: string };

/**
 * Run schema compliance using a pre-imported `extractProfile` from the scope.
 * Accepts the function directly (dependency-injected) so this grader stays
 * scope-agnostic. Callers in run-comparison.ts import the specific scope's
 * `extractProfile` and pass it in.
 */
export function checkSchema(
  response: string,
  extractProfile: ExtractFn,
): SchemaCheck {
  if (!response) return { valid: false, errors: ["empty response"] };
  const result = extractProfile(response);
  if (result.ok === true) return { valid: true, value: result.value };
  return { valid: false, errors: [result.error] };
}
