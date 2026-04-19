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

/**
 * Case-insensitive word-boundary-aware substring check.
 * Handles numerics and identifiers correctly (matches "Paris" in "…is Paris.",
 * "1969" in "in 1969 they…"), without false-positive "3" ⊂ "3600".
 * Falls back to a plain substring contains when the expected value contains
 * characters that would break `\b` (e.g. slashes in fractions).
 */
function looseContains(response: string, expected: string): boolean {
  const e = expected.trim();
  if (!e) return false;
  if (/^[A-Za-z0-9.-]+$/.test(e)) {
    const escaped = e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(response);
  }
  return response.toLowerCase().includes(e.toLowerCase());
}

/** Full grader. Tries three strategies in order:
 *  1. Strict:  extract `Final answer: X` and exact-match it.
 *  2. Loose:   word-boundary (or substring) match of expected in the full
 *              response — catches trivia answers that don't use the format.
 *  3. Fallback: last non-empty line, exact-match.
 *  The first to return a true match wins; `extracted` reports whichever
 *  candidate answer we settled on.
 */
export function gradeRow(
  response: string,
  expected: string | undefined | null,
): { extracted: string | null; correct: boolean | null } {
  if (expected == null) return { extracted: null, correct: null };
  if (!response) return { extracted: null, correct: false };

  // 1. Strict: Final answer: X
  const re = /(?:^|\n)\s*final\s*answer\s*[:\-\u2014]?\s*(.+?)\s*$/gim;
  let strict: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(response)) !== null) strict = m[1];
  if (strict !== null && exactMatch(strict, expected)) {
    return { extracted: strict, correct: true };
  }

  // 2. Loose: word-boundary match in the full response
  if (looseContains(response, expected)) {
    return { extracted: strict ?? expected, correct: true };
  }

  // 3. Fallback: last non-empty line
  const lines = response.trim().split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const last = lines.length ? lines[lines.length - 1] : null;
  if (last && exactMatch(last, expected)) {
    return { extracted: last, correct: true };
  }

  return { extracted: strict ?? last, correct: false };
}
