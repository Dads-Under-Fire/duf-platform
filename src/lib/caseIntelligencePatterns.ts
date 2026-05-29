// Canonical source of truth for DUF Platform v1 Case Intelligence patterns.
// The AI is restricted to this fixed taxonomy — it MUST NOT invent new pattern names.
// Used by: analysis prompts, classification post-processing, UI display, pattern detail copy.

export type CanonicalPatternSlug =
  | "possession_interference"
  | "medical_decision_neglect"
  | "medical_records_exclusion"
  | "communication_violations"
  | "harassment_threats_coercion"
  | "unilateral_decision_making"
  | "withholding_information"
  | "escalation_after_accountability"
  | "failure_to_coparent";

export interface CanonicalPattern {
  slug: CanonicalPatternSlug;
  name: string;
  definition: string;
  sort_order: number;
  active: boolean;
}

export const CANONICAL_PATTERNS: CanonicalPattern[] = [
  {
    slug: "possession_interference",
    name: "Possession Interference / Failure to Surrender",
    definition:
      "Repeated conduct that blocks, delays, shortens, conditions, or disrupts court-ordered or agreed parenting time, exchanges, or surrender of the child.",
    sort_order: 1,
    active: true,
  },
  {
    slug: "medical_decision_neglect",
    name: "Medical Decision Making / Medical Neglect / Delayed Care",
    definition:
      "Repeated failures, delays, or unilateral conduct affecting medical care, treatment follow-up, appointments, medication, or important health decisions.",
    sort_order: 2,
    active: true,
  },
  {
    slug: "medical_records_exclusion",
    name: "Removal or Exclusion from Medical Records / Providers",
    definition:
      "Repeated conduct excluding a parent from access to providers, portals, records, notices, or participation in the child's medical care.",
    sort_order: 3,
    active: true,
  },
  {
    slug: "communication_violations",
    name: "Communication Violations",
    definition:
      "Repeated failures to use required communication channels, failure to respond appropriately, bypassing court-ordered tools, or repeated noncompliant communication behavior.",
    sort_order: 4,
    active: true,
  },
  {
    slug: "harassment_threats_coercion",
    name: "Harassment / Threats / Coercive Language",
    definition:
      "Repeated hostile, threatening, intimidating, manipulative, or coercive communication directed at the other parent.",
    sort_order: 5,
    active: true,
  },
  {
    slug: "unilateral_decision_making",
    name: "Unilateral Decision Making",
    definition:
      "Repeated decisions made without required notice, consultation, agreement, or co-parent participation in areas where joint involvement is expected.",
    sort_order: 6,
    active: true,
  },
  {
    slug: "withholding_information",
    name: "Withholding Required Information",
    definition:
      "Repeated failure to provide important information the other parent should receive, including schedules, medical updates, school information, provider details, or logistics.",
    sort_order: 7,
    active: true,
  },
  {
    slug: "escalation_after_accountability",
    name: "Escalation After Accountability",
    definition:
      "Repeated increases in conflict, obstruction, retaliation, or adverse conduct shortly after legal filings, complaints, boundary-setting, documentation, or attempts at accountability.",
    sort_order: 8,
    active: true,
  },
  {
    slug: "failure_to_coparent",
    name: "Failure to Co-Parent / Persistent Conflict Pattern",
    definition:
      "Ongoing behavior showing chronic noncooperation, unnecessary conflict, refusal to coordinate, or repeated conduct undermining stable co-parenting across time.",
    sort_order: 9,
    active: true,
  },
];

export const CANONICAL_PATTERN_SLUGS = CANONICAL_PATTERNS.map((p) => p.slug);

export const CANONICAL_PATTERNS_BY_SLUG: Record<CanonicalPatternSlug, CanonicalPattern> =
  CANONICAL_PATTERNS.reduce((acc, p) => {
    acc[p.slug] = p;
    return acc;
  }, {} as Record<CanonicalPatternSlug, CanonicalPattern>);

/** Returns the canonical pattern matching a slug or display name; null if not recognized. */
export function resolveCanonicalPattern(
  slugOrName: string | null | undefined,
): CanonicalPattern | null {
  if (!slugOrName) return null;
  const direct = CANONICAL_PATTERNS_BY_SLUG[slugOrName as CanonicalPatternSlug];
  if (direct) return direct;
  const byName = CANONICAL_PATTERNS.find(
    (p) => p.name.toLowerCase() === slugOrName.toLowerCase(),
  );
  return byName ?? null;
}

export function isCanonicalPatternSlug(slug: string): slug is CanonicalPatternSlug {
  return slug in CANONICAL_PATTERNS_BY_SLUG;
}
