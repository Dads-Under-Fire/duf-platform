/**
 * Gold-suite validator engine for Communication Shield.
 * v9 — Staged workflow support: triage → routing → outcome validation.
 * Legacy single-step rewrite validator retained for backward compatibility.
 */

// ── Types ──

export interface ValidatorRules {
  banned_tokens?: string[];
  banned_phrases?: string[];
  required_risk_flags_any_of?: string[][];
  severity_overrides?: Record<string, "warn" | "fail">;
}

export type CheckSeverity = "pass" | "warn" | "fail";

export interface ValidatorCheck {
  rule: string;
  severity: CheckSeverity;
  reason: string;
}

export interface ValidatorResult {
  status: "pass" | "warn" | "fail";
  notes: string[];
  checks: ValidatorCheck[];
  adjustedScore?: number;
}

export interface RewriteResult {
  primary_rewrite: string;
  shorter_version: string;
  firmer_version: string;
  original_score: number;
  rewrite_quality_score: number;
  risk_flags: string[];
  tone_assessment: string;
  original_score_notes: string[];
  rewrite_quality_notes: string[];
  why_this_is_safer: string;
  prompt_version?: string;
  prompt_source?: string;
}

// ── Triage result (staged workflow) ──

export interface TriageResult {
  sendability_status: "safe" | "salvageable" | "redirect";
  output_path?: "rewrite" | "redirect_choice" | "no_message";
  detected_intent: string;
  detected_tone: string;
  risk_flags: string[];
  confidence: number;
  suggested_goals: string[];
  reason: string;
}

// ── Staged case expectations ──

export interface StagedExpectations {
  expected_sendability_status?: string;
  expected_output_path?: string;
  expected_detected_intent?: string;
  expected_risk_flags?: string[];
  expected_needs_goal_selection?: boolean;
  expected_no_message_recommended?: boolean;
  selected_goal_for_test?: string;
}

// ── Staged outcome data (what actually happened) ──

export interface StagedOutcome {
  // Triage stage
  actual_sendability_status?: string;
  actual_output_path?: string;
  actual_detected_intent?: string;
  actual_detected_tone?: string;
  actual_risk_flags?: string[];
  actual_needs_goal_selection?: boolean;
  // Final outcome
  actual_selected_goal?: string;
  actual_primary_output?: string;
  actual_redirect_message?: string;
  actual_no_message_recommended?: boolean;
  // Rewrite fields (when output_path = rewrite)
  primary_rewrite?: string;
  shorter_version?: string;
  firmer_version?: string;
  why_this_is_safer?: string;
}

// ── Staged validator result ──

export interface StagedValidatorResult {
  status: "pass" | "warn" | "fail";
  notes: string[];
  checks: ValidatorCheck[];
  triageScore: number;
  routingScore: number;
  outcomeScore: number;
  overallScore: number;
}

// ══════════════════════════════════════════════════════════════
// STAGED VALIDATOR — PRIMARY VALIDATION FOR COMMUNICATION SHIELD
// ══════════════════════════════════════════════════════════════

export function runStagedValidator(
  expectations: StagedExpectations,
  outcome: StagedOutcome,
  originalMessage?: string,
  testCategory?: string,
  rules?: ValidatorRules | null,
): StagedValidatorResult {
  const checks: ValidatorCheck[] = [];

  const add = (rule: string, passed: boolean, reason: string, defaultSev: "fail" | "warn" = "fail") => {
    const sev = passed ? "pass" : defaultSev;
    checks.push({
      rule,
      severity: passed ? "pass" : sev as CheckSeverity,
      reason: passed ? `✓ ${reason}` : `✗ ${reason}`,
    });
  };

  let triageScore = 10;
  let routingScore = 10;
  let outcomeScore = 10;

  // ═══ 1) TRIAGE ACCURACY ═══

  // 1a: sendability_status match
  if (expectations.expected_sendability_status) {
    const match = outcome.actual_sendability_status === expectations.expected_sendability_status;
    add("staged_sendability_match", match,
      `Expected sendability "${expectations.expected_sendability_status}" — got "${outcome.actual_sendability_status}"`);
    if (!match) triageScore -= 5;
  }

  // 1b: detected_intent (fuzzy match)
  if (expectations.expected_detected_intent && outcome.actual_detected_intent) {
    const match = fuzzyIntentMatch(outcome.actual_detected_intent, expectations.expected_detected_intent);
    add("staged_intent_match", match,
      `Expected intent ~"${expectations.expected_detected_intent}" — got "${outcome.actual_detected_intent}"`, "warn");
    if (!match) triageScore -= 2;
  }

  // 1c: risk_flags (at least one expected flag present)
  if (expectations.expected_risk_flags && expectations.expected_risk_flags.length > 0 && outcome.actual_risk_flags) {
    const hasExpected = expectations.expected_risk_flags.some(ef =>
      outcome.actual_risk_flags!.some(af => fuzzyFlagMatch(af, ef))
    );
    add("staged_risk_flags_match", hasExpected,
      `Expected risk flags include one of [${expectations.expected_risk_flags.join(", ")}] — got [${(outcome.actual_risk_flags ?? []).join(", ")}]`, "warn");
    if (!hasExpected) triageScore -= 2;
  }

  // 1d: needs_goal_selection match
  if (expectations.expected_needs_goal_selection !== undefined) {
    const match = outcome.actual_needs_goal_selection === expectations.expected_needs_goal_selection;
    add("staged_goal_selection_match", match,
      `Expected needs_goal_selection=${expectations.expected_needs_goal_selection} — got ${outcome.actual_needs_goal_selection}`);
    if (!match) triageScore -= 3;
  }

  // ═══ 2) ROUTING ACCURACY ═══

  if (expectations.expected_output_path) {
    const match = outcome.actual_output_path === expectations.expected_output_path;
    add("staged_output_path_match", match,
      `Expected output_path "${expectations.expected_output_path}" — got "${outcome.actual_output_path}"`);
    if (!match) routingScore -= 5;
  }

  // ═══ 3) OUTCOME QUALITY — PATH-SPECIFIC ═══

  const effectivePath = outcome.actual_output_path ?? expectations.expected_output_path;

  if (effectivePath === "rewrite") {
    outcomeScore = validateRewriteOutcome(checks, add, outcome, originalMessage, testCategory, rules);
  } else if (effectivePath === "redirect_choice") {
    outcomeScore = validateRedirectChoiceOutcome(checks, add, outcome);
  } else if (effectivePath === "no_message") {
    outcomeScore = validateNoMessageOutcome(checks, add, outcome);
  }

  // ═══ OVERALL ═══
  triageScore = clamp(triageScore, 1, 10);
  routingScore = clamp(routingScore, 1, 10);
  outcomeScore = clamp(outcomeScore, 1, 10);
  const overallScore = clamp(Math.round((triageScore * 0.3) + (routingScore * 0.3) + (outcomeScore * 0.4)), 1, 10);

  const hasFail = checks.some(c => c.severity === "fail");
  const hasWarn = checks.some(c => c.severity === "warn");
  const status: "pass" | "warn" | "fail" = hasFail ? "fail" : hasWarn ? "warn" : "pass";

  const failedNotes = checks
    .filter(c => c.severity === "fail" || c.severity === "warn")
    .map(c => {
      const icon = c.severity === "warn" ? "⚠" : "✗";
      return `${icon} ${c.reason}`;
    });

  const notes = failedNotes.length > 0 ? failedNotes : ["✓ All staged validation checks passed"];

  return { status, notes, checks, triageScore, routingScore, outcomeScore, overallScore };
}

// ── Rewrite outcome validation ──

function validateRewriteOutcome(
  checks: ValidatorCheck[],
  add: (rule: string, passed: boolean, reason: string, defaultSev?: "fail" | "warn") => void,
  outcome: StagedOutcome,
  originalMessage?: string,
  testCategory?: string,
  rules?: ValidatorRules | null,
): number {
  let score = 10;

  // Must have primary_rewrite
  const hasPrimary = isNonEmptyString(outcome.primary_rewrite);
  add("rewrite_has_primary", hasPrimary, "primary_rewrite is non-empty");
  if (!hasPrimary) return 1;

  const primaryText = outcome.primary_rewrite!;

  // Escalation safety: no escalation language in output
  const escalationFound = ESCALATION_PHRASES.some(p => p.test(primaryText));
  add("rewrite_escalation_safety", !escalationFound,
    `No escalation/leverage language in rewrite${escalationFound ? " — found" : ""}`);
  if (escalationFound) score -= 3;

  // No shared framing (we/us/our)
  const weFound = hasWeLanguage(primaryText);
  add("rewrite_no_shared_framing", !weFound,
    `No we/us/our/let's in rewrite${weFound ? " — shared framing" : ""}`);
  if (weFound) score -= 3;

  // No acknowledgment-only
  const ackOnly = isAcknowledgmentOnly(primaryText);
  add("rewrite_no_ack_only", !ackOnly,
    `Rewrite is substantive${ackOnly ? " — acknowledgment-only" : ""}`);
  if (ackOnly) score -= 4;

  // Court-safe phrasing: no unsafe language
  const unsafeMatch = containsUnsafeLanguage(primaryText);
  add("rewrite_court_safe", !unsafeMatch,
    `Court-safe phrasing${unsafeMatch ? ` — ${unsafeMatch}` : ""}`);
  if (unsafeMatch) score -= 4;

  // Actionability: has shorter + firmer versions
  const hasShorter = isNonEmptyString(outcome.shorter_version);
  const hasFirmer = isNonEmptyString(outcome.firmer_version);
  add("rewrite_has_variants", hasShorter && hasFirmer,
    `Has shorter + firmer variants${(!hasShorter || !hasFirmer) ? " — missing" : ""}`, "warn");
  if (!hasShorter || !hasFirmer) score -= 1;

  // Focus discipline: no new concrete facts
  if (originalMessage) {
    const origNorm = normalizeText(originalMessage);
    const origTypoNorm = normalizeText(normalizeTypos(originalMessage));
    const rewriteDetails = extractConcreteDetails(primaryText);
    const origDetails = new Set([
      ...extractConcreteDetails(origNorm),
      ...extractConcreteDetails(origTypoNorm),
    ]);
    const invented = rewriteDetails.filter(d =>
      !origDetails.has(d.toLowerCase()) && !origNorm.includes(d.toLowerCase())
    );
    add("rewrite_focus_discipline", invented.length === 0,
      `No invented concrete details${invented.length > 0 ? ` — found: [${invented.join(", ")}]` : ""}`);
    if (invented.length > 0) score -= 3;
  }

  // Goal alignment: why_this_is_safer exists
  const hasWhy = isNonEmptyString(outcome.why_this_is_safer);
  add("rewrite_goal_alignment", hasWhy,
    `why_this_is_safer provided${hasWhy ? "" : " — missing"}`, "warn");
  if (!hasWhy) score -= 1;

  // Admission trap check for past_fact_trap category
  if (testCategory === "past_fact_trap" || (originalMessage && ADMISSION_TRAP_TRIGGERS.test(originalMessage))) {
    const trapFound = ADMISSION_REWRITE_BANS.some(p => p.test(primaryText));
    add("rewrite_no_admission_trap", !trapFound,
      `No admission trap language${trapFound ? " — references disputed past" : ""}`);
    if (trapFound) score -= 4;
  }

  // Per-test rules
  if (rules) {
    if (rules.banned_tokens) {
      for (const token of rules.banned_tokens) {
        const found = matchesToken(primaryText, token);
        add("rewrite_banned_token", !found, `Banned token: "${token}"${found ? " — found" : ""}`);
        if (found) score -= 2;
      }
    }
    if (rules.banned_phrases) {
      for (const phrase of rules.banned_phrases) {
        const found = normalizeText(primaryText).includes(normalizeText(phrase));
        add("rewrite_banned_phrase", !found, `Banned phrase: "${phrase}"${found ? " — found" : ""}`);
        if (found) score -= 2;
      }
    }
  }

  return clamp(score, 1, 10);
}

// ── Redirect choice outcome validation ──

function validateRedirectChoiceOutcome(
  checks: ValidatorCheck[],
  add: (rule: string, passed: boolean, reason: string, defaultSev?: "fail" | "warn") => void,
  outcome: StagedOutcome,
): number {
  let score = 10;

  // Must have needs_goal_selection = true (paused for user choice)
  add("redirect_choice_needs_goal", outcome.actual_needs_goal_selection === true,
    `redirect_choice requires needs_goal_selection=true — got ${outcome.actual_needs_goal_selection}`);
  if (outcome.actual_needs_goal_selection !== true) score -= 3;

  // Should NOT have generated a rewrite yet
  const prematureRewrite = isNonEmptyString(outcome.primary_rewrite);
  add("redirect_choice_no_premature_output", !prematureRewrite,
    `No premature rewrite output${prematureRewrite ? " — rewrite generated before goal selection" : ""}`);
  if (prematureRewrite) score -= 3;

  // Should NOT have no_message result
  add("redirect_choice_not_no_message", outcome.actual_no_message_recommended !== true,
    `redirect_choice should not auto-recommend no_message`, "warn");
  if (outcome.actual_no_message_recommended === true) score -= 2;

  return clamp(score, 1, 10);
}

// ── No-message outcome validation ──

function validateNoMessageOutcome(
  checks: ValidatorCheck[],
  add: (rule: string, passed: boolean, reason: string, defaultSev?: "fail" | "warn") => void,
  outcome: StagedOutcome,
): number {
  let score = 10;

  // Must correctly recommend no message
  const recommended = outcome.actual_no_message_recommended === true;
  add("no_message_recommended", recommended,
    `System correctly recommended no message${recommended ? "" : " — not recommended"}`);
  if (!recommended) score -= 5;

  // Should NOT have generated a rewrite
  const hasRewrite = isNonEmptyString(outcome.primary_rewrite);
  add("no_message_no_rewrite", !hasRewrite,
    `No unnecessary rewrite output${hasRewrite ? " — rewrite was generated" : ""}`);
  if (hasRewrite) score -= 3;

  // Should NOT need goal selection
  add("no_message_no_goal_selection", outcome.actual_needs_goal_selection !== true,
    `no_message should not require goal selection`, "warn");
  if (outcome.actual_needs_goal_selection === true) score -= 2;

  return clamp(score, 1, 10);
}

// ══════════════════════════════════════════════════════════════
// FUZZY MATCHING HELPERS
// ══════════════════════════════════════════════════════════════

function fuzzyIntentMatch(actual: string, expected: string): boolean {
  const a = actual.toLowerCase().trim();
  const e = expected.toLowerCase().trim();
  if (a === e) return true;
  if (a.includes(e) || e.includes(a)) return true;
  // Allow reasonable equivalences
  const equivalences: [string, string[]][] = [
    ["confirm logistics", ["schedule coordination", "logistics coordination", "logistics confirmation"]],
    ["set boundary", ["boundary setting", "setting boundary", "communication boundary"]],
    ["express frustration", ["venting", "emotional venting", "frustration"]],
    ["personal/romantic", ["romantic", "personal", "relationship"]],
    ["threaten/intimidate", ["threat", "intimidation", "leverage"]],
    ["respond to accusation", ["defend against accusation", "accusation response"]],
  ];
  for (const [canonical, aliases] of equivalences) {
    if ((a === canonical || aliases.some(al => a.includes(al))) &&
        (e === canonical || aliases.some(al => e.includes(al)))) {
      return true;
    }
  }
  return false;
}

function fuzzyFlagMatch(actual: string, expected: string): boolean {
  const a = actual.toLowerCase().trim();
  const e = expected.toLowerCase().trim();
  if (a === e) return true;
  if (a.includes(e) || e.includes(a)) return true;
  return false;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function isNonEmptyString(val: unknown): val is string {
  return typeof val === "string" && val.trim().length > 0;
}

// ══════════════════════════════════════════════════════════════
// TRIAGE VALIDATOR (updated for output_path)
// ══════════════════════════════════════════════════════════════

export interface TriageValidatorResult {
  status: "pass" | "warn" | "fail";
  notes: string[];
  checks: ValidatorCheck[];
}

export function runTriageValidator(
  result: TriageResult,
  expectedSendability?: string,
  expectedIntent?: string,
  expectedOutputPath?: string,
  expectedRiskFlags?: string[],
): TriageValidatorResult {
  const checks: ValidatorCheck[] = [];

  const add = (rule: string, passed: boolean, reason: string) => {
    checks.push({ rule, severity: passed ? "pass" : "fail", reason: passed ? `✓ ${reason}` : `✗ ${reason}` });
  };

  // Schema validation
  const validStatuses = ["safe", "salvageable", "redirect"];
  add("triage_schema_sendability",
    validStatuses.includes(result.sendability_status),
    `sendability_status ∈ {safe,salvageable,redirect} — got "${result.sendability_status}"`);

  add("triage_schema_intent",
    typeof result.detected_intent === "string" && result.detected_intent.trim().length > 0,
    `detected_intent is non-empty string`);

  add("triage_schema_tone",
    typeof result.detected_tone === "string" && result.detected_tone.trim().length > 0,
    `detected_tone is non-empty string`);

  add("triage_schema_risk_flags",
    Array.isArray(result.risk_flags) && result.risk_flags.length >= 1 && result.risk_flags.length <= 3,
    `risk_flags array with 1–3 entries — got ${Array.isArray(result.risk_flags) ? result.risk_flags.length : "non-array"}`);

  add("triage_schema_confidence",
    typeof result.confidence === "number" && result.confidence >= 0 && result.confidence <= 1,
    `confidence 0.0–1.0 — got ${result.confidence}`);

  add("triage_schema_goals",
    Array.isArray(result.suggested_goals),
    `suggested_goals is array`);

  add("triage_schema_reason",
    typeof result.reason === "string" && result.reason.trim().length > 0,
    `reason is non-empty string`);

  // Canonical risk flags
  if (Array.isArray(result.risk_flags)) {
    const unknowns: string[] = [];
    for (const flag of result.risk_flags) {
      if (!canonicalizeFlag(flag)) unknowns.push(flag);
    }
    add("triage_risk_flags_canonical", unknowns.length === 0,
      `All risk flags canonical${unknowns.length > 0 ? ` — unknown: [${unknowns.join(", ")}]` : ""}`);
  }

  // Expected value checks
  if (expectedSendability) {
    add("triage_expected_sendability",
      result.sendability_status === expectedSendability,
      `Expected sendability "${expectedSendability}" — got "${result.sendability_status}"`);
  }

  if (expectedIntent) {
    add("triage_expected_intent",
      fuzzyIntentMatch(result.detected_intent, expectedIntent),
      `Expected intent ~"${expectedIntent}" — got "${result.detected_intent}"`);
  }

  if (expectedOutputPath) {
    // Derive output_path: use explicit field if available, otherwise infer from sendability
    const validOutputPaths = ["rewrite", "redirect_choice", "no_message"];
    const actualPath = result.output_path && validOutputPaths.includes(result.output_path)
      ? result.output_path
      : deriveOutputPath(result.sendability_status);
    add("triage_expected_output_path",
      actualPath === expectedOutputPath,
      `Expected output_path "${expectedOutputPath}" — got "${actualPath}"`);
  }

  if (expectedRiskFlags && expectedRiskFlags.length > 0) {
    const hasExpected = expectedRiskFlags.some(ef =>
      result.risk_flags.some(rf => fuzzyFlagMatch(rf, ef))
    );
    add("triage_expected_risk_flags", hasExpected,
      `Expected risk flags include one of [${expectedRiskFlags.join(", ")}] — got [${result.risk_flags.join(", ")}]`);
  }

  // Pass/fail
  const hasFail = checks.some(c => c.severity === "fail");
  const hasWarn = checks.some(c => c.severity === "warn");
  const status: "pass" | "warn" | "fail" = hasFail ? "fail" : hasWarn ? "warn" : "pass";

  const failedNotes = checks
    .filter(c => c.severity === "fail" || c.severity === "warn")
    .map(c => `✗ ${c.reason}`);

  const notes = failedNotes.length > 0 ? failedNotes : ["✓ All triage validation checks passed"];

  return { status, notes, checks };
}

function deriveOutputPath(sendabilityStatus: string): string {
  if (sendabilityStatus === "safe" || sendabilityStatus === "salvageable") return "rewrite";
  return "redirect_choice"; // default for redirect when no explicit output_path
}

// ══════════════════════════════════════════════════════════════
// HELPERS (shared)
// ══════════════════════════════════════════════════════════════

export function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\u2019/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, " ").trim();
}

export function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

export function matchesToken(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

// ── Typo normalization ──

const TYPO_MAP: Record<string, string> = {
  afta: "after", schol: "school", tomorw: "tomorrow", tomorrw: "tomorrow",
  tmrw: "tomorrow", ur: "your", cnfirm: "confirm", cnt: "can't",
  guessin: "guessing", plz: "please", pls: "please", thx: "thanks",
  thanx: "thanks", cuz: "because", bcuz: "because", wut: "what",
  wat: "what", wen: "when", whn: "when",
};

export function normalizeTypos(text: string): string {
  return text.replace(/\b[a-zA-Z']+\b/g, (word) => {
    const lower = word.toLowerCase();
    return TYPO_MAP[lower] ?? word;
  });
}

// ── Shared framing detection ──

export function hasWeLanguage(text: string): boolean {
  if (/\blet[\u2019']?s\b/i.test(text)) return true;
  const tokens = text.replace(/[.,!?;:\-\u2014()\[\]{}'\"]/g, " ").split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    const lower = t.toLowerCase();
    if (lower === "we" || lower === "us" || lower === "our") return true;
  }
  return false;
}

// ── Acknowledgment-only detection ──

const ACK_EXACT = new Set([
  "received.", "received", "noted.", "noted", "understood.", "understood",
  "okay.", "okay", "ok.", "ok",
  "thanks for letting me know.", "thank you for letting me know.",
  "received your message.",
]);

export function isAcknowledgmentOnly(text: string): boolean {
  const lower = text.trim().toLowerCase();
  if (ACK_EXACT.has(lower)) return true;
  if (/^(received|noted)\b/i.test(text.trim()) && wordCount(text) <= 6) return true;
  return false;
}

// ── Question detection ──

const Q_STARTERS = /^(what|when|where|who|why|how|can|will|do|does|is|are)\b/i;
const LOGISTICS_TERMS = /\b(pickup|pick[\s-]?up|drop[\s-]?off|exchange|school|doctor|schedule|time|tomorrow|friday|saturday|sunday|monday|tuesday|wednesday|thursday|appointment|reimbursement|payment|tonight|weekend)\b/i;

export function isLogisticsQuestion(text: string): boolean {
  const trimmed = text.trim();
  return (trimmed.endsWith("?") || Q_STARTERS.test(trimmed)) && LOGISTICS_TERMS.test(trimmed);
}

// ── Canonical risk flags ──

export const CANONICAL_RISK_FLAGS = new Set([
  "Safe message",
  "Vague or imprecise language",
  "Irrelevant or non-child-related topic",
  "Emotional language detected",
  "Denigration / disparagement",
  "Admission trap",
  "Past-fact confirmation risk",
  "Escalation language detected",
  "Leverage or intimidation language detected",
  "Financial demand or assumption",
  "Harassment / repeated contact",
  "Child safety concern",
  "Privacy / surveillance / tracking",
]);

export function canonicalizeFlag(flag: string): string | null {
  const trimmed = flag.trim();
  if (CANONICAL_RISK_FLAGS.has(trimmed)) return trimmed;
  return null;
}

// ── Pattern libraries ──

const ESCALATION_PHRASES: RegExp[] = [
  /\bescalat(e|ion)\b/i,
  /\btake action\b/i,
  /\bconsequences\b/i,
  /\bnecessary steps\b/i,
  /\bprepared to\b/i,
  /\bdocument(ing|ed)\b/i,
  /\bpattern\b/i,
  /\brecurring (pattern|issue)\b/i,
  /\bongoing (issue|concern)s?\b/i,
  /\baddress this( matter)?\b/i,
  /\bresolve this( matter)?\b/i,
  /\bbefore i respond further\b/i,
  /\bour communications\b/i,
];

const ADMISSION_TRAP_TRIGGERS = /\b(admit|admitting|are you admitting|are you saying|intentionally|confirm you changed|before i respond further|acknowledge|changed the plan)\b/i;

const ADMISSION_REWRITE_BANS = [
  /\bare you admitting\b/i,
  /\bare you saying\b/i,
  /\bconfirm you violated\b/i,
  /\bconfirm what happened\b/i,
  /\bconfirm last weekend\b/i,
  /\bconfirm last friday\b/i,
  /\bconfirm the past\b/i,
  /\badmit\b/i,
  /\backnowledge that you\b/i,
  /\bvalidate that you\b/i,
  /\blast weekend\b/i,
  /\bpreviously\b/i,
  /\bdetails regarding\b/i,
  /\bwhether it was followed\b/i,
  /\bwhat happened\b/i,
  /\bwhy it happened\b/i,
  /\blast friday\b/i,
  /\blast time\b/i,
  /\bthe other day\b/i,
];

const APOLOGY_PATTERNS = [
  /\bi('m| am) sorry\b/i, /\bi apologize\b/i, /\bi regret\b/i, /\bany confusion i caused\b/i,
];
const ADMISSION_PATTERNS = [
  /\bmy absence was due to\b/i, /\bi missed .{0,30} because\b/i, /\bi was late because\b/i,
  /\bit happened because\b/i, /\bthe reason was\b/i, /\bwhat actually happened\b/i,
  /\bi didn'?t do that because\b/i, /\bi forgot to\b/i, /\bi should have\b/i,
  /\bi failed to\b/i, /\bi acknowledge that i\b/i, /\bi admit\b/i,
];
const ALL_UNSAFE_PATTERNS = [...APOLOGY_PATTERNS, ...ADMISSION_PATTERNS];

function containsUnsafeLanguage(val: unknown): string | null {
  if (typeof val !== "string") return null;
  for (const pattern of ALL_UNSAFE_PATTERNS) {
    if (pattern.test(val)) return `matched unsafe pattern: ${pattern.source}`;
  }
  return null;
}

function extractConcreteDetails(text: string): string[] {
  const details: string[] = [];
  const dateP = /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g;
  const timeP = /\b\d{1,2}:\d{2}\s*(am|pm)?\b/gi;
  const amountP = /\$\d+(\.\d{2})?/g;
  const phoneP = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;
  for (const p of [dateP, timeP, amountP, phoneP]) {
    const m = text.match(p);
    if (m) details.push(...m);
  }
  return details;
}

// ══════════════════════════════════════════════════════════════
// LEGACY SINGLE-STEP REWRITE VALIDATOR (preserved for backward compat)
// ══════════════════════════════════════════════════════════════

const CHILD_MESSENGER_PATTERNS = [
  /\btell (your |the )?(mom|dad|mommy|daddy|mother|father)\b/i,
  /\bhave the child tell\b/i,
  /\bsend a message through the child\b/i,
];

const FINANCIAL_BAN_PHRASES = [
  "only fair", "fair share", "making more money", "increased income",
  "now that you make more", "you need to start paying", "covering more",
];
const FINANCIAL_TRIGGERS = /\b(since you'?re making more money|now that you make more|pay more|fair share|only fair)\b/i;

const CONFIRM_TRIGGERS = /\b(confirm|cnfirm|need to know)\b/i;
const SCHEDULE_WORDS = /\b(time|what time|pick\s*up|drop\s*off|tomorrow|today|tonight|this weekend|next exchange|friday|saturday|sunday|monday|tuesday|wednesday|thursday|schedule|plan|appointment|reimbursement|payment date|when|where)\b/i;

const LOGISTICS_CONTEXT_TERMS = /\b(schedule|plan|pickup|pick[\s-]?up|drop[\s-]?off|exchange|late|changed|changed the plan|tomorrow|weekend)\b/i;

const ABSTRACT_BOUNDARY_WORDS = new Set([
  "child", "child-related", "children", "children's",
  "logistics", "communication", "communications",
  "updates", "schedule", "needs", "messages",
]);

const INVENTED_TOPICS = ["communication arrangements", "meet", "time to meet", "future communications"];

function containsPlaceholder(val: unknown): boolean {
  return typeof val === "string" && /\[.*?\]/.test(val);
}

const BLAME_LANGUAGE = [
  /\byou always\b/i,
  /\byou never\b/i,
];

export function runValidator(
  rules: ValidatorRules | null,
  result: RewriteResult,
  originalMessage?: string,
  testCategory?: string,
): ValidatorResult {
  const checks: ValidatorCheck[] = [];

  const add = (rule: string, passed: boolean, reason: string, defaultSev: "fail" | "warn" = "fail") => {
    const sev = passed ? "pass" : (rules?.severity_overrides?.[rule] ?? defaultSev);
    checks.push({ rule, severity: passed ? "pass" : sev as CheckSeverity, reason: passed ? `✓ ${reason}` : `✗ ${reason}` });
  };

  const origNorm = originalMessage ? normalizeText(originalMessage) : "";
  const origTypoNorm = originalMessage ? normalizeText(normalizeTypos(originalMessage)) : "";
  const origWc = originalMessage ? wordCount(originalMessage) : 0;

  const rewriteFields = [
    { label: "primary_rewrite", text: result.primary_rewrite ?? "" },
    { label: "shorter_version", text: result.shorter_version ?? "" },
    { label: "firmer_version", text: result.firmer_version ?? "" },
  ];

  // ═══ 1) SCHEMA VALIDATION ═══
  const STRING_FIELDS = ["primary_rewrite", "shorter_version", "firmer_version", "tone_assessment", "why_this_is_safer"];
  for (const key of STRING_FIELDS) {
    const val = (result as any)[key];
    add("schema_string_field", typeof val === "string" && val.trim().length > 0, `Field "${key}" is non-empty string`);
  }

  add("schema_tone",
    result.tone_assessment === "Neutral" || result.tone_assessment === "Firm",
    `tone_assessment ∈ {Neutral,Firm} — got "${result.tone_assessment}"`);

  add("schema_risk_flags",
    Array.isArray(result.risk_flags) && result.risk_flags.length >= 1 && result.risk_flags.length <= 3,
    `risk_flags array with 1–3 entries — got ${Array.isArray(result.risk_flags) ? result.risk_flags.length : "non-array"}`);

  add("schema_original_score",
    typeof result.original_score === "number" && Number.isInteger(result.original_score) && result.original_score >= 1 && result.original_score <= 10,
    `original_score integer 1–10 — got ${result.original_score}`);

  add("schema_rewrite_quality_score",
    typeof result.rewrite_quality_score === "number" && Number.isInteger(result.rewrite_quality_score) && result.rewrite_quality_score >= 1 && result.rewrite_quality_score <= 10,
    `rewrite_quality_score integer 1–10 — got ${result.rewrite_quality_score}`);

  const isNonEmptyStringArr = (v: any) => Array.isArray(v) && v.length > 0 && v.every((s: any) => typeof s === "string" && s.trim().length > 0);
  add("schema_original_score_notes", isNonEmptyStringArr(result.original_score_notes), `original_score_notes is array of non-empty strings`);
  add("schema_rewrite_quality_notes", isNonEmptyStringArr(result.rewrite_quality_notes), `rewrite_quality_notes is array of non-empty strings`);

  // ═══ 2) CANONICAL RISK FLAGS ═══
  if (Array.isArray(result.risk_flags)) {
    const unknowns: string[] = [];
    for (const flag of result.risk_flags) {
      if (!canonicalizeFlag(flag)) unknowns.push(flag);
    }
    add("risk_flags_canonical", unknowns.length === 0,
      `All risk flags canonical${unknowns.length > 0 ? ` — unknown: [${unknowns.join(", ")}]` : ""}`);

    if (testCategory === "safe_logistics") {
      const onlySafe = result.risk_flags.length === 1 && result.risk_flags[0] === "Safe message";
      add("safe_logistics_flags", onlySafe, `safe_logistics requires exactly ["Safe message"] — got [${result.risk_flags.join(", ")}]`);
    }

    if (testCategory === "emotional_irrelevant") {
      const hasRelevant = result.risk_flags.some(f => f === "Irrelevant or non-child-related topic" || f === "Emotional language detected");
      add("emotional_irrelevant_flags", hasRelevant, `emotional_irrelevant requires relevant flag — got [${result.risk_flags.join(", ")}]`);
    }

    if (testCategory === "past_fact_trap") {
      const hasRelevant = result.risk_flags.some(f => f === "Admission trap" || f === "Past-fact confirmation risk");
      add("past_fact_trap_flags", hasRelevant, `past_fact_trap requires admission/past-fact flag — got [${result.risk_flags.join(", ")}]`);
    }
  }

  // ═══ 3) SHARED FRAMING ═══
  for (const rt of rewriteFields) {
    if (!rt.text) continue;
    const found = hasWeLanguage(rt.text);
    add("no_shared_framing", !found, `No we/us/our/let's in ${rt.label}${found ? " — shared framing detected" : ""}`);
  }

  // ═══ 4) ESCALATION / LEVERAGE ═══
  for (const rt of rewriteFields) {
    if (!rt.text) continue;
    const matched = ESCALATION_PHRASES.filter(p => p.test(rt.text));
    add("no_escalation", matched.length === 0, `No escalation/leverage in ${rt.label}${matched.length > 0 ? ` — ${matched.length} match(es)` : ""}`);
  }

  // ═══ 5) ACKNOWLEDGMENT-ONLY ═══
  for (const rt of rewriteFields) {
    if (!rt.text) continue;
    const ack = isAcknowledgmentOnly(rt.text);
    add("no_acknowledgment_only", !ack, `No acknowledgment-only in ${rt.label}${ack ? ` — "${rt.text.slice(0, 40)}" is not a valid rewrite` : ""}`);
  }

  // ═══ 6) ADMISSION TRAP ═══
  const origHasAdmissionTrigger = originalMessage && ADMISSION_TRAP_TRIGGERS.test(originalMessage);
  const isPastFactCategory = testCategory === "past_fact_trap";

  if (origHasAdmissionTrigger || isPastFactCategory) {
    for (const rt of rewriteFields) {
      if (!rt.text) continue;
      const failed = ADMISSION_REWRITE_BANS.some(p => p.test(rt.text));
      add("no_admission_trap", !failed, `No admission trap in ${rt.label}${failed ? " — references disputed past conduct" : ""}`);
    }
  }

  // ═══ 7) CHILD-AS-MESSENGER ═══
  for (const rt of rewriteFields) {
    if (!rt.text) continue;
    const found = CHILD_MESSENGER_PATTERNS.some(p => p.test(rt.text));
    add("no_child_messenger", !found, `No child-as-messenger in ${rt.label}${found ? " — child used as intermediary" : ""}`);
  }

  // ═══ 8) NEW CONCRETE DETAILS ═══
  if (originalMessage) {
    const primaryText = result.primary_rewrite ?? "";
    const rewriteDetails = extractConcreteDetails(primaryText);
    const origDetails = new Set([
      ...extractConcreteDetails(origNorm),
      ...extractConcreteDetails(origTypoNorm),
    ]);
    const invented: string[] = [];
    for (const d of rewriteDetails) {
      if (!origDetails.has(d.toLowerCase()) && !origNorm.includes(d.toLowerCase())) {
        invented.push(d);
      }
    }
    add("no_new_facts", invented.length === 0, `No invented concrete details${invented.length > 0 ? ` — found: [${invented.join(", ")}]` : ""}`);
  }

  // ═══ 9) QUESTION PRESERVATION ═══
  if (originalMessage && isLogisticsQuestion(originalMessage)) {
    const hasQ = (result.primary_rewrite ?? "").includes("?");
    add("question_preserved", hasQ, `Original is logistics question — primary_rewrite must contain "?"${hasQ ? "" : " — not found"}`);
  }

  // ═══ 10) CONFIRM RULE ═══
  const origExplicitlyConfirms = originalMessage && CONFIRM_TRIGGERS.test(normalizeTypos(originalMessage));
  const origIsScheduleQuestion = originalMessage && originalMessage.includes("?") && SCHEDULE_WORDS.test(originalMessage);

  if (origExplicitlyConfirms) {
    const hasConfirmVerb = /\bconfirm\b/i.test(result.primary_rewrite ?? "");
    add("confirmation_preserved", hasConfirmVerb, `Original explicitly asks to confirm — primary_rewrite must include verb "confirm"${hasConfirmVerb ? "" : " — not found"}`);
  } else if (origIsScheduleQuestion) {
    const hasConfirmVerb = /\bconfirm\b/i.test(result.primary_rewrite ?? "");
    const hasQuestionMark = (result.primary_rewrite ?? "").includes("?");
    const passes = hasConfirmVerb || hasQuestionMark;
    add("confirmation_preserved", passes, `Original is schedule question — primary_rewrite must use "confirm" or remain a question${passes ? "" : " — neither found"}`);
  }

  // ═══ 11) TOPIC-SHIFT ═══
  if (originalMessage) {
    const origHasLogistics = LOGISTICS_CONTEXT_TERMS.test(originalMessage);
    if (!origHasLogistics) {
      const primaryNorm = normalizeText(result.primary_rewrite ?? "");
      for (const topic of INVENTED_TOPICS) {
        if (primaryNorm.includes(topic.toLowerCase())) {
          add("no_topic_shift", false, `Rewrite invents topic "${topic}" not in original`);
        }
      }
    }
  }

  // ═══ 12) FINANCIAL BANS ═══
  if (originalMessage && FINANCIAL_TRIGGERS.test(originalMessage)) {
    for (const rt of rewriteFields) {
      if (!rt.text) continue;
      const rtNorm = normalizeText(rt.text);
      const found = FINANCIAL_BAN_PHRASES.some(p => rtNorm.includes(p.toLowerCase()));
      const sev = rt.label === "primary_rewrite" ? "warn" : "fail";
      add("no_financial_assumptions", !found, `No financial assumptions in ${rt.label}${found ? " — found income/fairness language" : ""}`, sev as "fail" | "warn");
    }
  }

  // ═══ 13) EMOTIONAL/IRRELEVANT SUBSTANCE ═══
  if (testCategory === "emotional_irrelevant") {
    const pt = result.primary_rewrite ?? "";
    const hasSubstance = wordCount(pt) >= 5 && !isAcknowledgmentOnly(pt);
    add("emotional_irrelevant_substance", hasSubstance, `emotional_irrelevant requires substantive boundary output${hasSubstance ? "" : " — too short or acknowledgment-only"}`);
  }

  // ═══ 14) LENGTH CONTROLS ═══
  if (origWc > 0) {
    const rewriteWc = wordCount(result.primary_rewrite ?? "");
    const softLimit = Math.max(Math.ceil(origWc * 1.25), origWc + 6);
    const hardLimit = Math.ceil(origWc * 1.75);

    if (rewriteWc > hardLimit) {
      add("word_length", false, `primary_rewrite too long: ${rewriteWc} words vs ${origWc} original (hard limit ${hardLimit})`);
    } else if (rewriteWc > softLimit) {
      add("word_length", false, `primary_rewrite long: ${rewriteWc} vs ${origWc} (soft limit ${softLimit})`, "warn");
    } else {
      add("word_length", true, `Word length OK: ${rewriteWc}/${origWc}`, "warn");
    }
  }

  // ═══ 15) PER-TEST RULES ═══
  if (rules) {
    const text = result.primary_rewrite ?? "";
    if (rules.banned_tokens) {
      for (const token of rules.banned_tokens) {
        const found = matchesToken(text, token);
        add("banned_token", !found, `Banned token: "${token}"${found ? " — found" : ""}`);
      }
    }
    if (rules.banned_phrases) {
      for (const phrase of rules.banned_phrases) {
        const found = normalizeText(text).includes(normalizeText(phrase));
        add("banned_phrase", !found, `Banned phrase: "${phrase}"${found ? " — found" : ""}`);
      }
    }
    if (rules.required_risk_flags_any_of?.length) {
      const flags = (result.risk_flags ?? []).map(f => (canonicalizeFlag(f) ?? f).toLowerCase());
      const satisfied = rules.required_risk_flags_any_of.some(set =>
        set.some(expected => flags.some(cf => cf.includes(expected.toLowerCase())))
      );
      add("required_risk_flags", satisfied, `Risk flags match requirement — got [${result.risk_flags?.join(", ")}]`);
    }
  }

  // ═══ SCORING ═══
  let adjustedScore = 10;
  const hasSchemaFail = checks.some(c => c.severity === "fail" && c.rule.startsWith("schema_"));
  const hasHardFail = checks.some(c => c.severity === "fail");

  if (hasSchemaFail) {
    adjustedScore = 1;
  } else {
    if (checks.some(c => c.severity === "fail" && c.rule === "risk_flags_canonical")) adjustedScore -= 3;
    if (checks.some(c => c.severity === "fail" && c.rule === "no_shared_framing")) adjustedScore -= 4;
    if (checks.some(c => c.severity === "fail" && c.rule === "no_escalation")) adjustedScore -= 4;
    if (checks.some(c => c.severity === "fail" && c.rule === "no_acknowledgment_only")) adjustedScore -= 4;
    if (checks.some(c => c.severity === "fail" && c.rule === "no_new_facts")) adjustedScore -= 4;
    if (checks.some(c => c.severity === "fail" && c.rule === "no_admission_trap")) adjustedScore -= 4;
    if (checks.some(c => c.severity === "fail" && c.rule === "confirmation_preserved")) adjustedScore -= 2;
    if (checks.some(c => c.severity === "fail" && c.rule === "question_preserved")) adjustedScore -= 2;
    if (checks.some(c => c.severity === "fail" && c.rule === "no_child_messenger")) adjustedScore -= 3;
    if (checks.some(c => c.severity === "warn" && c.rule === "word_length")) adjustedScore -= 1;

    const primaryText = result.primary_rewrite ?? "";
    if (BLAME_LANGUAGE.some(p => p.test(primaryText))) adjustedScore -= 3;
  }

  adjustedScore = Math.max(1, Math.min(10, adjustedScore));
  if (hasHardFail && adjustedScore > 4) adjustedScore = 4;

  const hasFail = checks.some(c => c.severity === "fail");
  const hasWarn = checks.some(c => c.severity === "warn");
  const status: "pass" | "warn" | "fail" = hasFail ? "fail" : hasWarn ? "warn" : "pass";

  const failedNotes = checks
    .filter(c => c.severity === "fail" || c.severity === "warn")
    .map(c => {
      const icon = c.severity === "warn" ? "⚠" : "✗";
      return `${icon} ${c.reason}`;
    });

  const notes = failedNotes.length > 0 ? failedNotes : ["✓ All validation checks passed"];

  return { status, notes, checks, adjustedScore };
}
