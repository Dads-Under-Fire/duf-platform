/**
 * Gold-suite validator engine for Communication Shield.
 * v10 — Clean rebuild: DB-driven staged validation only.
 * No legacy single-step rewrite logic.
 */

// ── Types ──

export type CheckSeverity = "pass" | "warn" | "fail";

export interface ValidatorCheck {
  rule: string;
  severity: CheckSeverity;
  reason: string;
}

/** Expected values from ai_gold_suite_cases */
export interface StagedExpectations {
  expected_sendability_status?: string;
  expected_output_path?: string;
  expected_detected_intent?: string;
  expected_risk_flags?: string[];
  expected_needs_goal_selection?: boolean;
  expected_no_message_recommended?: boolean;
  selected_goal_for_test?: string;
}

/** Actual values from the system run */
export interface StagedOutcome {
  actual_sendability_status?: string;
  actual_output_path?: string;
  actual_detected_intent?: string;
  actual_risk_flags?: string[];
  actual_needs_goal_selection?: boolean;
  actual_selected_goal?: string;
  actual_primary_output?: string;
  actual_redirect_message?: string;
  actual_no_message_recommended?: boolean;
}

/** Validator result */
export interface StagedValidatorResult {
  status: "pass" | "warn" | "fail";
  checks: ValidatorCheck[];
  triageScore: number;
  routingScore: number;
  outcomeScore: number;
  overallScore: number;
}

// ══════════════════════════════════════════════════════════════
// STAGED VALIDATOR — sole validator for Communication Shield
// ══════════════════════════════════════════════════════════════

export function runStagedValidator(
  expectations: StagedExpectations,
  outcome: StagedOutcome,
): StagedValidatorResult {
  const checks: ValidatorCheck[] = [];

  const add = (rule: string, passed: boolean, reason: string, sev: "fail" | "warn" = "fail") => {
    checks.push({
      rule,
      severity: passed ? "pass" : sev,
      reason: passed ? `✓ ${reason}` : `✗ ${reason}`,
    });
  };

  let triageScore = 10;
  let routingScore = 10;
  let outcomeScore = 10;

  // ═══ 1) TRIAGE — hard checks ═══

  // 1a: sendability_status
  if (expectations.expected_sendability_status) {
    const match = outcome.actual_sendability_status === expectations.expected_sendability_status;
    add("sendability_match", match,
      `sendability: expected "${expectations.expected_sendability_status}" — got "${outcome.actual_sendability_status ?? "—"}"`);
    if (!match) triageScore -= 5;
  }

  // 1b: needs_goal_selection (normalize null/undefined → false)
  if (expectations.expected_needs_goal_selection !== undefined) {
    const actual = outcome.actual_needs_goal_selection ?? false;
    const match = actual === expectations.expected_needs_goal_selection;
    add("needs_goal_selection_match", match,
      `needs_goal_selection: expected ${expectations.expected_needs_goal_selection} — got ${actual}`);
    if (!match) triageScore -= 3;
  }

  // ═══ 2) ROUTING — hard checks ═══

  if (expectations.expected_output_path) {
    const expected = normalizeOutputPath(expectations.expected_output_path);
    const actual = normalizeOutputPath(outcome.actual_output_path);
    const match = actual === expected;
    add("output_path_match", match,
      `output_path: expected "${expected}" — got "${actual ?? "—"}"`);
    if (!match) routingScore -= 5;
  }

  // ═══ 3) OUTCOME — path-specific checks ═══

  const effectivePath = normalizeOutputPath(outcome.actual_output_path ?? expectations.expected_output_path);

  if (effectivePath === "no_message") {
    // no_message: should recommend no message, should NOT produce rewrite
    if (expectations.expected_no_message_recommended !== undefined) {
      const actual = outcome.actual_no_message_recommended ?? false;
      const match = actual === expectations.expected_no_message_recommended;
      add("no_message_match", match,
        `no_message_recommended: expected ${expectations.expected_no_message_recommended} — got ${actual}`);
      if (!match) outcomeScore -= 5;
    }
    const hasRewrite = isNonEmpty(outcome.actual_primary_output);
    add("no_message_no_rewrite", !hasRewrite,
      `no_message path should not produce rewrite output${hasRewrite ? " — output was generated" : ""}`, "warn");
    if (hasRewrite) outcomeScore -= 2;
  } else if (effectivePath === "redirect_choice") {
    // redirect_choice: should need goal selection, should NOT have premature rewrite
    const premature = isNonEmpty(outcome.actual_primary_output);
    add("redirect_choice_no_premature_output", !premature,
      `redirect_choice should not produce premature output${premature ? " — output was generated" : ""}`, "warn");
    if (premature) outcomeScore -= 2;
  } else if (effectivePath === "rewrite") {
    // rewrite: should have primary output
    const hasOutput = isNonEmpty(outcome.actual_primary_output);
    add("rewrite_has_output", hasOutput,
      `rewrite path should produce output${hasOutput ? "" : " — missing"}`);
    if (!hasOutput) outcomeScore -= 5;
  }

  // ═══ 4) SOFT CHECKS — intent & risk flags ═══

  if (expectations.expected_detected_intent && outcome.actual_detected_intent) {
    const match = fuzzyIntentMatch(outcome.actual_detected_intent, expectations.expected_detected_intent);
    add("intent_match", match,
      `intent: expected ~"${expectations.expected_detected_intent}" — got "${outcome.actual_detected_intent}"`, "warn");
    if (!match) triageScore -= 1;
  }

  if (expectations.expected_risk_flags && expectations.expected_risk_flags.length > 0 && outcome.actual_risk_flags) {
    const hasExpected = expectations.expected_risk_flags.some(ef =>
      outcome.actual_risk_flags!.some(af => fuzzyFlagMatch(af, ef))
    );
    add("risk_flags_match", hasExpected,
      `risk_flags: expected one of [${expectations.expected_risk_flags.join(", ")}] — got [${(outcome.actual_risk_flags ?? []).join(", ")}]`, "warn");
    if (!hasExpected) triageScore -= 1;
  }

  // ═══ SCORING ═══
  triageScore = clamp(triageScore, 1, 10);
  routingScore = clamp(routingScore, 1, 10);
  outcomeScore = clamp(outcomeScore, 1, 10);
  const overallScore = clamp(Math.round(triageScore * 0.3 + routingScore * 0.3 + outcomeScore * 0.4), 1, 10);

  const hasFail = checks.some(c => c.severity === "fail");
  const hasWarn = checks.some(c => c.severity === "warn");
  const status: "pass" | "warn" | "fail" = hasFail ? "fail" : hasWarn ? "warn" : "pass";

  return { status, checks, triageScore, routingScore, outcomeScore, overallScore };
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

function normalizeOutputPath(path: unknown): "rewrite" | "redirect_choice" | "no_message" | null {
  if (path === "rewrite_with_guidance") return "rewrite";
  if (path === "rewrite" || path === "redirect_choice" || path === "no_message") return path;
  return null;
}

function isNonEmpty(val: unknown): val is string {
  return typeof val === "string" && val.trim().length > 0;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function fuzzyIntentMatch(actual: string, expected: string): boolean {
  const a = actual.toLowerCase().trim();
  const e = expected.toLowerCase().trim();
  if (a === e) return true;
  if (a.includes(e) || e.includes(a)) return true;
  const equivalences: [string, string[]][] = [
    ["confirm logistics", ["schedule coordination", "logistics coordination", "logistics confirmation"]],
    ["set boundary", ["boundary setting", "setting boundary", "communication boundary", "set a neutral boundary"]],
    ["request info", ["request information", "clarification", "ask for details", "respond to accusation safely"]],
    ["express frustration", ["venting", "emotional venting", "frustration"]],
    ["personal/romantic", ["romantic", "personal", "relationship"]],
    ["threaten/intimidate", ["threat", "intimidation", "leverage", "coercion"]],
    ["respond to accusation", ["defend against accusation", "accusation response"]],
  ];
  for (const [canonical, aliases] of equivalences) {
    const allTerms = [canonical, ...aliases];
    if (allTerms.some(t => a.includes(t)) && allTerms.some(t => e.includes(t))) return true;
  }
  return false;
}

function normalizeFlag(flag: string): string {
  const raw = flag.toLowerCase().trim();
  const aliases: Record<string, string> = {
    "emotional language": "emotional language detected",
    "personal attack": "denigration / disparagement",
    accusation: "admission trap",
    sarcasm: "emotional language detected",
    threat: "leverage or intimidation language detected",
    coercion: "leverage or intimidation language detected",
    manipulation: "denigration / disparagement",
    vague: "vague or imprecise language",
    romantic: "irrelevant or non-child-related topic",
    "irrelevant content": "irrelevant or non-child-related topic",
  };
  return aliases[raw] ?? raw;
}

function fuzzyFlagMatch(actual: string, expected: string): boolean {
  const a = normalizeFlag(actual);
  const e = normalizeFlag(expected);
  if (a === e) return true;
  if (a.includes(e) || e.includes(a)) return true;
  return false;
}
