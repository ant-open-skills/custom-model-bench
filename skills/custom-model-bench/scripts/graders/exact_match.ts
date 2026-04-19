/**
 * exact_match — extract a "Final answer: X" line from a candidate's response
 * and compare it against the dataset's `expected_answer`.
 *
 * Graceful about formatting: trims whitespace, strips trailing punctuation,
 * compares lowercase. Falls back to numeric equality when both sides parse as
 * finite numbers (handles "16.8" vs "16.80", "4" vs "4.0").
 */

/**
 * Pull the final answer out of a response. Looks for the last occurrence of
 * `Final answer: X` (case-insensitive, colon optional). If no such line is
 * found, returns the last non-empty line of the response as a fallback so a
 * model that ignores formatting isn't auto-counted wrong.
 */
export function extractFinalAnswer(response: string): string | null {
  if (!response) return null;
  const text = response.trim();
  const re = /(?:^|\n)\s*final\s*answer\s*[:\-\u2014]?\s*(.+?)\s*$/gim;
  let match: RegExpExecArray | null;
  let last: string | null = null;
  while ((match = re.exec(text)) !== null) last = match[1];
  if (last) return last;
  // Fallback: last non-empty line
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1] : null;
}

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/^(?:the\s+)?answer\s+is\s*/i, "")
    .replace(/^[=:\-\u2014]\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/[.,;]+$/, "")
    .replace(/\s*\/\s*/g, "/")     // "3 / 44" → "3/44"
    .replace(/\s+/g, " ");
}

/** True if `actual` exactly matches `expected` after normalization, with a
 *  numeric equality fallback for finite-number pairs. */
export function exactMatch(actual: string, expected: string): boolean {
  const a = normalize(actual);
  const e = normalize(expected);
  if (a === e) return true;
  // Numeric equality fallback — protects against "16.8" vs "16.80", "4" vs "4.0"
  const na = Number(a), ne = Number(e);
  if (Number.isFinite(na) && Number.isFinite(ne) && na === ne) return true;
  return false;
}

/** Full grader: given a candidate's row result and the dataset's expected_answer,
 *  return { extracted, correct }. null `extracted` means we couldn't find any
 *  candidate answer in the response. */
export function gradeRow(
  response: string,
  expected: string | undefined | null,
): { extracted: string | null; correct: boolean | null } {
  if (expected == null) return { extracted: null, correct: null };
  const extracted = extractFinalAnswer(response);
  if (extracted == null) return { extracted: null, correct: false };
  return { extracted, correct: exactMatch(extracted, expected) };
}
