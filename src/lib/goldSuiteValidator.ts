/**
 * Gold-suite validator engine for Communication Shield.
 * v11 — Simplified regression-focused validator.
 * Only validates core routing + outcome correctness.
 * No soft intent/risk-flag matching. No legacy scoring.
 */

// ── Types ──

export type CheckSeverity = "pass" | "warn" | "fail";

export interface ValidatorCheck {
  rule: string;
  severity: CheckSeverity;
  reason: string;
}

export interface StagedExpectations {
  expected_sendability_status?: string;
  expected_output_path?: string;
  expected_detected_intent?: string;
  expected_risk_flags?: string[];
  expected_needs_goal_selection?: boolean;
  expected_no_message_recommended?: boolean;
  selected_goal_for_test?: string;
}

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

export interface StagedValidatorResult {
  status: "pass" | "warn" | "fail";
  checks: ValidatorCheck[];
  failReason: string | null;
}

// ══════════════════════════════════════════════════════════════
// SIMPLIFIED REGRESSION VALIDATOR
// ══════════════════════════════════════════════════════════════

export function runStagedValidator(
  expectations: StagedExpectations,
  outcome: StagedOutcome,
): StagedValidatorResult {
  const checks: ValidatorCheck[] = [];

  const add = (rule: string, passed: boolean, reason: string) => {
    checks.push({
      rule,
      severity: passed ? "pass" : "fail",
      reason: passed ? `✓ ${reason}` : `✗ ${reason}`,
    });
  };

  // 1. Sendability match
  if (expectations.expected_sendability_status) {
    const match = outcome.actual_sendability_status === expectations.expected_sendability_status;
    add("sendability_match", match,
      `Expected "${expectations.expected_sendability_status}" — got "${outcome.actual_sendability_status ?? "—"}"`);
  }

  // 2. Output path match
  if (expectations.expected_output_path) {
    const expected = normalizeOutputPath(expectations.expected_output_path);
    const actual = normalizeOutputPath(outcome.actual_output_path);
    const match = actual === expected;
    add("output_path_match", match,
      `Expected "${expected}" — got "${actual ?? "—"}"`);
  }

  // 3. Goal selection match (normalize null/undefined → false)
  if (expectations.expected_needs_goal_selection !== undefined) {
    const actual = outcome.actual_needs_goal_selection ?? false;
    const match = actual === expectations.expected_needs_goal_selection;
    add("goal_selection_match", match,
      `Expected ${expectations.expected_needs_goal_selection} — got ${actual}`);
  }

  // 4. Path-specific outcome checks
  const effectivePath = normalizeOutputPath(outcome.actual_output_path ?? expectations.expected_output_path);

  if (effectivePath === "no_message") {
    if (expectations.expected_no_message_recommended !== undefined) {
      const actual = outcome.actual_no_message_recommended ?? false;
      const match = actual === expectations.expected_no_message_recommended;
      add("no_message_recommended", match,
        `Expected ${expectations.expected_no_message_recommended} — got ${actual}`);
    }
    // No rewrite should exist
    const hasOutput = isNonEmpty(outcome.actual_primary_output);
    if (hasOutput) {
      checks.push({ rule: "no_message_clean", severity: "warn", reason: "⚠ Rewrite output generated on no_message path" });
    }
  } else if (effectivePath === "rewrite") {
    const hasOutput = isNonEmpty(outcome.actual_primary_output);
    add("rewrite_exists", hasOutput,
      hasOutput ? "Rewrite output exists" : "No rewrite output generated");
  }
  // redirect_choice: no strict output check needed

  // Determine overall status
  const hasFail = checks.some(c => c.severity === "fail");
  const hasWarn = checks.some(c => c.severity === "warn");
  const status: "pass" | "warn" | "fail" = hasFail ? "fail" : hasWarn ? "warn" : "pass";

  const firstFail = checks.find(c => c.severity === "fail");
  const failReason = firstFail ? `${firstFail.rule}: ${firstFail.reason.replace(/^✗\s*/, "")}` : null;

  return { status, checks, failReason };
}

// ── Helpers ──

function normalizeOutputPath(path: unknown): "rewrite" | "redirect_choice" | "no_message" | null {
  if (path === "rewrite_with_guidance") return "rewrite";
  if (path === "rewrite" || path === "redirect_choice" || path === "no_message") return path;
  return null;
}

function isNonEmpty(val: unknown): val is string {
  return typeof val === "string" && val.trim().length > 0;
}
