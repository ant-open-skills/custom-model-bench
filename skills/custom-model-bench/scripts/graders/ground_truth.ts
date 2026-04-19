/**
 * ground_truth — compare the extracted ProspectProfile against the dataset's
 * expected_* fields.
 *
 * Each check is gated independently: callers pass the row's expected field
 * (which may be undefined), and the grader returns null when the field is
 * absent. The aggregate step spreads only non-null results.
 *
 * Note on `tech_stack_overlap`: the dataset as authored carries a numeric
 * range `expected_tech_stack_overlap_range` for the model's predicted
 * `tech_stack_overlap_pct`. The task spec mentions an array-intersection
 * variant (`expected_tech_stack_overlap`); we support both shapes — if the
 * caller passes an array, we compute intersection / expected size; if they
 * pass a range, we check containment of the extracted `tech_stack_overlap_pct`.
 */

export type ProfileLike = {
  target_company?: string;
  github_org?: string | null;
  tech_stack?: string[];
  tech_stack_overlap_pct?: number;
  fit_score?: number;
  contacts?: unknown[];
  [key: string]: unknown;
};

export function checkGithubOrg(
  profile: ProfileLike | null | undefined,
  expected: string | null | undefined,
): boolean | null {
  if (expected === undefined) return null;
  if (!profile) return false;
  // Normalise both sides: lowercase, trim. Treat null === null as a match
  // (the "unknown company" rows).
  const actual = profile.github_org;
  if (expected === null) return actual === null;
  if (actual == null) return false;
  return actual.trim().toLowerCase() === expected.trim().toLowerCase();
}

export type TechStackCheck = {
  overlap_pct: number;
  matched: string[];
  expected_size: number;
};

/**
 * Array-intersection overlap: |extracted ∩ expected| / |expected|.
 * Case-insensitive match on stack names. Returns null when no expected
 * array is supplied.
 */
export function checkTechStackOverlap(
  profile: ProfileLike | null | undefined,
  expected: string[] | undefined,
): TechStackCheck | null {
  if (!expected) return null;
  if (expected.length === 0) {
    return { overlap_pct: 1, matched: [], expected_size: 0 };
  }
  if (!profile || !Array.isArray(profile.tech_stack)) {
    return { overlap_pct: 0, matched: [], expected_size: expected.length };
  }
  const actualLower = new Set(
    profile.tech_stack.map((s) => s.trim().toLowerCase()),
  );
  const matched: string[] = [];
  for (const e of expected) {
    if (actualLower.has(e.trim().toLowerCase())) matched.push(e);
  }
  return {
    overlap_pct: matched.length / expected.length,
    matched,
    expected_size: expected.length,
  };
}

/**
 * Range-containment variant for the tech_stack_overlap_pct *numeric* range
 * as shipped in the yc-qualifier dataset (`expected_tech_stack_overlap_range`).
 * Checks whether `profile.tech_stack_overlap_pct` falls in [min, max].
 */
export function checkTechStackOverlapPctInRange(
  profile: ProfileLike | null | undefined,
  range: [number, number] | undefined,
): boolean | null {
  if (!range) return null;
  if (!profile || typeof profile.tech_stack_overlap_pct !== "number") {
    return false;
  }
  const [min, max] = range;
  return profile.tech_stack_overlap_pct >= min &&
    profile.tech_stack_overlap_pct <= max;
}

export function checkContactsInRange(
  profile: ProfileLike | null | undefined,
  range: [number, number] | undefined,
): boolean | null {
  if (!range) return null;
  if (!profile || !Array.isArray(profile.contacts)) return false;
  const [min, max] = range;
  const n = profile.contacts.length;
  return n >= min && n <= max;
}

export function checkFitScoreInRange(
  profile: ProfileLike | null | undefined,
  range: [number, number] | undefined,
): boolean | null {
  if (!range) return null;
  if (!profile || typeof profile.fit_score !== "number") return false;
  const [min, max] = range;
  return profile.fit_score >= min && profile.fit_score <= max;
}
