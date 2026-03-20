/**
 * Gold-suite validator engine for Communication Shield rewrites.
 * Deterministic, explainable validation aligned to court-safe,
 * child-focused high-conflict custody communication standards.
 *
 * v4 — 11-rule spec implementation
 */

// ── Types ──

export interface ValidatorRules {
  must_preserve_pov?: boolean;
  must_preserve_message_type?: "question" | "request" | "statement" | "any";
  must_preserve_confirmation?: boolean;
  must_preserve_terms?: string[];
  must_not_introduce_we_language?: boolean;
  must_not_request_past_validation?: boolean;
  must_not_preserve_leverage?: boolean;
  must_not_preserve_financial_assumptions?: boolean;
  must_not_shift_to_response_mode?: boolean;
  must_not_deepen_nonessential_content?: boolean;
  max_word_increase_pct?: number;
  max_words?: number;
  banned_phrases?: string[];
  banned_tokens?: string[];
  required_risk_flags_any_of?: string[][];
  must_not_flag_any?: string[];
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
  original_score_notes: string[] | any;
  rewrite_quality_notes: string[] | any;
  why_this_is_safer: string;
  prompt_version?: string;
  prompt_source?: string;
}

// ── Normalization helpers ──

export function normalizeText(s: string): string {
  let t = s.toLowerCase().replace(/\s+/g, " ").trim();
  // time normalization
  t = t.replace(/\b(\d{1,2})\s*:\s*(\d{2})\s*(am|pm)\b/gi, (_, h, m, ap) => `${h}:${m} ${ap.toLowerCase()}`);
  t = t.replace(/\b(\d{1,2})\s*(am|pm)\b/gi, (_, h, ap) => `${h}:00 ${ap.toLowerCase()}`);
  // date normalization
  t = t.replace(/(\d{1,2})\s*\/\s*(\d{1,2})/g, "$1/$2");
  t = t.replace(/\.{2,}/g, ".").replace(/\s*\.\s*$/, ".");
  return t;
}

export function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/** Word-boundary match — "guessin" must NOT match "guessing" */
export function matchesToken(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

export function matchesPhrase(textNorm: string, phrase: string): boolean {
  return textNorm.includes(normalizeText(phrase));
}

// ── Typo normalization map (rule 8) ──

const TYPO_MAP: Record<string, string> = {
  afta: "after",
  schol: "school",
  tomorw: "tomorrow",
  tomorrw: "tomorrow",
  tmrw: "tomorrow",
  ur: "your",
  cnfirm: "confirm",
  cnt: "can't",
  guessin: "guessing",
  plz: "please",
  pls: "please",
  thx: "thanks",
  thanx: "thanks",
  cuz: "because",
  bcuz: "because",
  wut: "what",
  wat: "what",
  wen: "when",
  whn: "when",
  dnt: "don't",
  dont: "don't",
  doesnt: "doesn't",
  didnt: "didn't",
  wasnt: "wasn't",
  werent: "weren't",
  isnt: "isn't",
  arent: "aren't",
  wont: "won't",
  cant: "can't",
  shouldnt: "shouldn't",
  wouldnt: "wouldn't",
  couldnt: "couldn't",
  im: "i'm",
  ive: "i've",
  id: "i'd",
  youre: "you're",
  theyre: "they're",
  theyve: "they've",
  weve: "we've",
  hes: "he's",
  shes: "she's",
  its: "it's",
  thats: "that's",
  whats: "what's",
  whos: "who's",
  itll: "it'll",
  youll: "you'll",
  theyll: "they'll",
  hell: "he'll",
  shell: "she'll",
  well: "we'll",
  ill: "i'll",
};

export function normalizeTypos(text: string): string {
  return text.replace(/\b[a-zA-Z']+\b/g, (word) => {
    const lower = word.toLowerCase();
    return TYPO_MAP[lower] ?? word;
  });
}

// ── Robust "we/us/let's/our" check ──

export function hasWeLanguage(text: string): boolean {
  // Check for let's BEFORE stripping punctuation (apostrophe matters)
  if (/\blet'?s\b/i.test(text)) return true;
  // Tokenize: split on whitespace and punctuation boundaries
  const tokens = text.replace(/[.,!?;:\-—()\[\]{}'\"]/g, " ").split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    const lower = t.toLowerCase();
    if (lower === "we" || lower === "us" || lower === "our") return true;
  }
  return false;
}

// ── Canonical risk flags (rule 7) ──

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

const FLAG_SYNONYMS: Record<string, string> = {
  "no risk flags": "Safe message",
};

export function canonicalizeFlag(flag: string): string | null {
  const trimmed = flag.trim();
  if (CANONICAL_RISK_FLAGS.has(trimmed)) return trimmed;
  const syn = FLAG_SYNONYMS[trimmed.toLowerCase()];
  if (syn) return syn;
  return null; // unknown
}

// ── Pattern libraries ──

const ADMISSION_TRAP_TRIGGERS = /\b(admit|admitting|are you admitting|are you saying|intentionally|confirm you changed|before i respond further|acknowledge)\b/i;

const PAST_FACT_CONDUCT_PATTERNS = [
  /\b(confirm|clarify|acknowledge|indicate|validate|admit)\s+(whether|that|if)\s+.*\b(you |he |she )?(did|were|was|had|didn't|wasn't|weren't|failed|missed|neglected|changed|switched|moved)\b/i,
  /\b(confirm|clarify|acknowledge|indicate)\s+.*\b(past |previous |last |prior |earlier )/i,
  /\bprovide details\s+.*(about|regarding|on)\s+.*(what happened|the incident|last|previous|prior)\b/i,
  /\b(confirm|clarify|indicate|acknowledge)\s+.*\b(noncompliance|violation|breach|failure)\b/i,
  // Simpler: asks to confirm what happened in past tense
  /\bconfirm what (happened|occurred|took place)\b/i,
];

const ESCALATION_PHRASES: RegExp[] = [
  /\bescalat(e|ion)\b/i,
  /\btake action\b/i,
  /\bconsequences\b/i,
  /\bnecessary steps\b/i,
  /\bprepared to\b/i,
  /\bdocument(ing|ed)\b/i,
  /\bpattern\b/i,
  /\brecurring (pattern|issue)\b/i,
  /\bongoing (issues|concerns)\b/i,
  /\baddress this( matter)?\b/i,
  /\bresolve this( matter)?\b/i,
  /\bbefore i respond further\b/i,
  /\bour communications\b/i,
];

const FINANCIAL_BAN_PHRASES = [
  "only fair",
  "fair share",
  "making more money",
  "increased income",
  "now that you make more",
  "you need to start paying",
  "covering more",
];

const FINANCIAL_TRIGGERS = /\b(since you'?re making more money|now that you make more|pay more|fair share|only fair)\b/i;

const CONFIRMATION_TRIGGERS = /\b(confirm|cnfirm|need to know)\b/i;
const SCHEDULE_WORDS = /\b(time|what time|pick\s*up|drop\s*off|tomorrow|today|friday|saturday|sunday|monday|tuesday|wednesday|thursday|schedule)\b/i;

// Expanded category detectors
const DENIGRATION_PATTERNS = [
  /\b(idiot|stupid|narcissist|crazy|psycho|loser|deadbeat|worthless|pathetic|incompetent|unfit)\b/i,
  /\byou('re| are) (a |an )?(bad|terrible|horrible|awful) (parent|mother|father|person)\b/i,
  /\b(diagnosed|diagnosis|bipolar|borderline|mental(ly)? (ill|unstable))\b/i,
];

const CHILD_MANIPULATION_PATTERNS = [
  /\btell (the |your )?(kid|child|children|son|daughter)\b/i,
  /\b(kid|child|children|son|daughter) (said|told|says|wants|thinks|feels)\b/i,
  /\bask (the |your )?(kid|child|children) (about|what|if|whether)\b/i,
  /\b(kid|child|son|daughter) (doesn't|does not) want to\b/i,
];

const HARASSMENT_PATTERNS = [
  /\b(i('ll| will) keep (calling|texting|messaging|emailing))\b/i,
  /\b(don't (ignore|avoid) me)\b/i,
  /\b(respond (now|immediately|right now))\b/i,
  /\b(i know (where|what) you)\b/i,
];

const SAFETY_RISK_PATTERNS = [
  /\b(kill|hurt|harm|beat|hit|slap|punch) (you|him|her|them|the kid|the child)\b/i,
  /\b(take (the |my )?(kid|child|children) and (never|not) (come|bring|return))\b/i,
  /\b(you('ll| will) never see (them|the kid|the child|your (son|daughter)) again)\b/i,
  /\b(self[- ]?harm|suicide|kill myself)\b/i,
];

const BLAME_LANGUAGE = [
  /\byou always\b/i,
  /\byou never\b/i,
  /\byou('re| are) (the |always |never )?(problem|issue|reason)\b/i,
];

// ── Validator engine ──

export function runValidator(
  rules: ValidatorRules | null,
  result: RewriteResult,
  originalMessage?: string,
  testCategory?: string,
): ValidatorResult {
  const checks: ValidatorCheck[] = [];
  const origNorm = originalMessage ? normalizeText(originalMessage) : "";
  const origTypoNorm = originalMessage ? normalizeText(normalizeTypos(originalMessage)) : "";
  const origWc = originalMessage ? wordCount(originalMessage) : 0;
  const overrides = rules?.severity_overrides ?? {};

  const add = (ruleName: string, passed: boolean, reason: string, defaultSeverity: "fail" | "warn") => {
    const sev = passed ? "pass" : (overrides[ruleName] ?? defaultSeverity);
    checks.push({
      rule: ruleName,
      severity: passed ? "pass" : (sev as CheckSeverity),
      reason: passed ? `✓ ${reason}` : `✗ ${reason}`,
    });
  };

  // ════════════════════════════════════════
  // 1) Schema validation (HARD FAIL)
  // ════════════════════════════════════════
  const STRING_FIELDS = ["primary_rewrite", "shorter_version", "firmer_version", "tone_assessment", "why_this_is_safer"];
  for (const key of STRING_FIELDS) {
    const val = (result as any)[key];
    add("schema_string_field", typeof val === "string" && val.trim().length > 0,
      `Field "${key}" is non-empty string`, "fail");
  }

  add("schema_tone",
    result.tone_assessment === "Neutral" || result.tone_assessment === "Firm",
    `tone_assessment ∈ {Neutral,Firm} — got "${result.tone_assessment}"`, "fail");

  add("schema_risk_flags",
    Array.isArray(result.risk_flags) && result.risk_flags.length >= 1,
    `risk_flags array with ≥1 entry`, "fail");

  add("schema_original_score",
    typeof result.original_score === "number" && Number.isInteger(result.original_score) && result.original_score >= 1 && result.original_score <= 10,
    `original_score integer 1–10 — got ${result.original_score}`, "fail");

  add("schema_rewrite_quality_score",
    typeof result.rewrite_quality_score === "number" && Number.isInteger(result.rewrite_quality_score) && result.rewrite_quality_score >= 1 && result.rewrite_quality_score <= 10,
    `rewrite_quality_score integer 1–10 — got ${result.rewrite_quality_score}`, "fail");

  // score_notes must be arrays of non-empty strings
  const isNonEmptyStringArray = (v: any) => Array.isArray(v) && v.length > 0 && v.every((s: any) => typeof s === "string" && s.trim().length > 0);
  add("schema_original_score_notes",
    isNonEmptyStringArray(result.original_score_notes),
    `original_score_notes is array of non-empty strings`, "fail");
  add("schema_rewrite_quality_notes",
    isNonEmptyStringArray(result.rewrite_quality_notes),
    `rewrite_quality_notes is array of non-empty strings`, "fail");

  // ════════════════════════════════════════
  // 2) Shared-framing bans (HARD FAIL)
  // ════════════════════════════════════════
  const rewriteFields: { label: string; text: string }[] = [
    { label: "primary_rewrite", text: result.primary_rewrite ?? "" },
    { label: "shorter_version", text: result.shorter_version ?? "" },
    { label: "firmer_version", text: result.firmer_version ?? "" },
  ];

  for (const rt of rewriteFields) {
    if (!rt.text) continue;
    const found = hasWeLanguage(rt.text);
    add("no_shared_framing", !found,
      `No we/us/our/let's in ${rt.label}${found ? " — shared framing detected" : ""}`, "fail");
  }

  // ════════════════════════════════════════
  // 3) Escalation / leverage / intimidation bans (HARD FAIL)
  // ════════════════════════════════════════
  for (const rt of rewriteFields) {
    if (!rt.text) continue;
    const matched = ESCALATION_PHRASES.filter(p => p.test(rt.text));
    add("no_escalation", matched.length === 0,
      `No escalation/leverage in ${rt.label}${matched.length > 0 ? ` — ${matched.length} match(es)` : ""}`, "fail");
  }

  // ════════════════════════════════════════
  // 4) Admission-trap & past-fact bans (HARD FAIL conditional)
  // ════════════════════════════════════════
  if (originalMessage && ADMISSION_TRAP_TRIGGERS.test(originalMessage)) {
    for (const rt of rewriteFields) {
      if (!rt.text) continue;
      const hasPastFact = PAST_FACT_CONDUCT_PATTERNS.some(p => p.test(rt.text));
      const asksAdmit = /\b(admit|acknowledge|intentionally)\b/i.test(rt.text);
      add("no_admission_trap", !hasPastFact && !asksAdmit,
        `No admission trap in ${rt.label}${(hasPastFact || asksAdmit) ? " — seeks admission/validation of disputed past conduct" : ""}`, "fail");
    }
  }

  // Category-specific: past_fact_trap requires specific risk flags
  if (testCategory === "past_fact_trap") {
    const flags = (result.risk_flags ?? []).map(f => f.toLowerCase());
    const hasRelevant = flags.some(f =>
      f.includes("admission trap") || f.includes("past-fact confirmation risk") || f.includes("past-fact") || f.includes("admission")
    );
    add("past_fact_trap_flags", hasRelevant,
      `past_fact_trap category requires "Admission trap" or "Past-fact confirmation risk" flag — got [${result.risk_flags?.join(", ")}]`, "fail");
  }

  // ════════════════════════════════════════
  // 5) Financial assumption bans (HARD in shorter/firmer, SOFT in primary)
  // ════════════════════════════════════════
  if ((originalMessage && FINANCIAL_TRIGGERS.test(originalMessage)) || rules?.must_not_preserve_financial_assumptions) {
    for (const rt of rewriteFields) {
      if (!rt.text) continue;
      const hasAssumption = FINANCIAL_BAN_PHRASES.some(phrase => matchesPhrase(normalizeText(rt.text), phrase));
      const severity = rt.label === "primary_rewrite" ? "warn" : "fail";
      add("no_financial_assumptions", !hasAssumption,
        `No financial assumptions in ${rt.label}${hasAssumption ? " — found income/fairness language" : ""}`, severity as "fail" | "warn");
    }
  }

  // ════════════════════════════════════════
  // 6) Confirmation-language rule (CONDITIONAL HARD FAIL)
  // ════════════════════════════════════════
  const origHasConfirmTrigger = originalMessage && (
    CONFIRMATION_TRIGGERS.test(originalMessage) ||
    (originalMessage.includes("?") && SCHEDULE_WORDS.test(originalMessage))
  );
  if (rules?.must_preserve_confirmation || origHasConfirmTrigger) {
    const hasConfirmVerb = /\bconfirm\b/i.test(result.primary_rewrite ?? "");
    add("confirmation_preserved", hasConfirmVerb,
      `primary_rewrite must include verb "confirm"${hasConfirmVerb ? "" : " — not found (\"confirmation\" alone insufficient)"}`, "fail");
  }

  // ════════════════════════════════════════
  // 7) Risk flag taxonomy (canonical flags, unknown = HARD FAIL)
  // ════════════════════════════════════════
  if (Array.isArray(result.risk_flags)) {
    let hasUnknown = false;
    const unknowns: string[] = [];
    for (const flag of result.risk_flags) {
      const canon = canonicalizeFlag(flag);
      if (!canon) {
        hasUnknown = true;
        unknowns.push(flag);
      }
    }
    add("risk_flags_canonical", !hasUnknown,
      `All risk flags canonical${hasUnknown ? ` — unknown: [${unknowns.join(", ")}]` : ""}`, "fail");

    // Category-specific flag requirements
    if (testCategory === "safe_logistics") {
      const canonFlags = result.risk_flags.map(f => canonicalizeFlag(f)).filter(Boolean);
      const onlySafe = canonFlags.length === 1 && canonFlags[0] === "Safe message";
      add("safe_logistics_flags", onlySafe,
        `safe_logistics requires exactly ["Safe message"] — got [${result.risk_flags.join(", ")}]`, "fail");
    }

    if (testCategory === "emotional_irrelevant") {
      const canonFlags = result.risk_flags.map(f => canonicalizeFlag(f)).filter(Boolean) as string[];
      const hasRelevant = canonFlags.some(f =>
        f === "Irrelevant or non-child-related topic" || f === "Emotional language detected"
      );
      add("emotional_irrelevant_flags", hasRelevant,
        `emotional_irrelevant requires "Irrelevant or non-child-related topic" or "Emotional language detected" — got [${result.risk_flags.join(", ")}]`, "fail");
    }
  }

  // ════════════════════════════════════════
  // 8) No new facts (typo-normalized comparison)
  // ════════════════════════════════════════
  if (originalMessage) {
    const primaryText = result.primary_rewrite ?? "";
    let newFactsFound = false;
    const newFactDetails: string[] = [];

    // Extract dates/times/amounts from rewrite
    const dateTimePattern = /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g;
    const timePattern = /\b\d{1,2}:\d{2}\s*(am|pm)?\b/gi;
    const amountPattern = /\$\d+(\.\d{2})?/g;

    for (const p of [dateTimePattern, timePattern, amountPattern]) {
      const matches = primaryText.match(p) ?? [];
      for (const m of matches) {
        if (!origTypoNorm.includes(m.toLowerCase()) && !origNorm.includes(m.toLowerCase())) {
          newFactsFound = true;
          newFactDetails.push(m);
        }
      }
    }

    // Topics not in original (after typo normalization)
    const TOPIC_WORDS = ["schedule", "school", "doctor", "appointment", "therapy", "counselor"];
    const origNormTypo = normalizeTypos(originalMessage.toLowerCase());
    for (const tw of TOPIC_WORDS) {
      if (matchesToken(primaryText, tw) && !matchesToken(origNormTypo, tw) && !matchesToken(originalMessage, tw)) {
        newFactsFound = true;
        newFactDetails.push(`topic:${tw}`);
      }
    }

    // Politeness/grammar tokens are NOT new facts
    const ALLOWED_NEW_TOKENS = new Set(["please", "are", "will", "would", "could", "the", "a", "an", "is", "it", "to", "for", "of", "at", "in", "on", "by"]);
    // Filter: if all "new" items are just allowed tokens, not a real new fact
    // This check is for topic words only; dates/amounts are always flagged

    add("no_new_facts", !newFactsFound,
      `No new facts/dates/amounts/topics${newFactsFound ? ` — found: [${newFactDetails.join(", ")}]` : ""}`, "fail");
  }

  // ════════════════════════════════════════
  // 9) Length controls
  // ════════════════════════════════════════
  if (origWc > 0) {
    const rewriteWc = wordCount(result.primary_rewrite ?? "");
    const softLimit = Math.max(Math.ceil(origWc * 1.25), origWc + 6);
    const hardLimit = Math.ceil(origWc * 1.75);

    if (rewriteWc > hardLimit) {
      add("word_length", false,
        `primary_rewrite too long: ${rewriteWc} words vs ${origWc} original (hard limit ${hardLimit})`, "fail");
    } else if (rewriteWc > softLimit) {
      add("word_length", false,
        `primary_rewrite long: ${rewriteWc} words vs ${origWc} original (soft limit ${softLimit})`, "warn");
    } else {
      add("word_length", true,
        `Word length OK: ${rewriteWc}/${origWc}`, "warn");
    }
  }

  // ════════════════════════════════════════
  // Expanded category detectors (always active)
  // ════════════════════════════════════════
  for (const rt of rewriteFields) {
    if (!rt.text) continue;
    if (DENIGRATION_PATTERNS.some(p => p.test(rt.text))) {
      add("no_denigration", false, `Denigration/disparagement in ${rt.label}`, "fail");
    }
    if (CHILD_MANIPULATION_PATTERNS.some(p => p.test(rt.text))) {
      add("no_child_manipulation", false, `Child manipulation/triangulation in ${rt.label}`, "fail");
    }
    if (HARASSMENT_PATTERNS.some(p => p.test(rt.text))) {
      add("no_harassment", false, `Harassment phrasing in ${rt.label}`, "fail");
    }
    if (SAFETY_RISK_PATTERNS.some(p => p.test(rt.text))) {
      add("safety_risk", false, `Safety risk phrasing in ${rt.label}`, "fail");
    }
  }

  // ════════════════════════════════════════
  // Per-test rule checks (from validator_rules)
  // ════════════════════════════════════════
  if (rules && Object.keys(rules).length > 0) {
    const text = result.primary_rewrite ?? "";
    const textNorm = normalizeText(text);
    const rewriteWc = wordCount(text);

    // POV shift
    if (rules.must_preserve_pov) {
      const hasResponseFlip = /\byou (should|need to|could|might want)\b/i.test(text) && !/\b(I|my|me)\b/i.test(text);
      add("must_preserve_pov", !hasResponseFlip, "Preserve original POV", "fail");
    }

    // Message type
    if (rules.must_preserve_message_type && rules.must_preserve_message_type !== "any") {
      const mtype = rules.must_preserve_message_type;
      let ok = true;
      if (mtype === "question") ok = text.includes("?");
      else if (mtype === "request") ok = /\b(please|could you|can you|would you|let me know|confirm)\b/i.test(text);
      else if (mtype === "statement") ok = !text.includes("?") || /\b(I will|I am|I have|I can)\b/i.test(text);
      add("must_preserve_message_type", ok, `Preserve message type: ${mtype}`, "fail");
    }

    // Response-mode shift
    if (rules.must_not_shift_to_response_mode) {
      const RESPONSE_MODE_PHRASES = [
        /\bkeep communication focused\b/i,
        /\bI understand\b/i,
        /\bthank you for sharing\b/i,
        /\bI appreciate you\b/i,
        /\blet'?s focus on\b/i,
      ];
      const shifted = RESPONSE_MODE_PHRASES.some(p => p.test(text));
      add("must_not_shift_to_response_mode", !shifted, "Must not shift to response-mode phrasing", "fail");
    }

    // Past-fact validation (per-rule)
    if (rules.must_not_request_past_validation) {
      const hasPattern = PAST_FACT_CONDUCT_PATTERNS.some(p => p.test(text));
      const simpleCheck = /\b(confirm|clarify|indicate|acknowledge)\b/i.test(text) &&
        /\b(did|were|was|had|didn't|wasn't|weren't|failed|missed|changed|noncompliance)\b/i.test(text);
      add("must_not_request_past_validation", !hasPattern && !simpleCheck,
        "Must not request validation of disputed past conduct", "fail");
    }

    // Leverage (per-rule)
    if (rules.must_not_preserve_leverage) {
      const hasLeverage = ESCALATION_PHRASES.some(p => p.test(text));
      add("must_not_preserve_leverage", !hasLeverage, "Must not preserve leverage/escalation framing", "fail");
    }

    // We language (per-rule)
    if (rules.must_not_introduce_we_language) {
      const rewriteHasWe = hasWeLanguage(text);
      add("must_not_introduce_we_language", !rewriteHasWe, "Must not introduce we/us/let's", "fail");
    }

    // Non-essential deepening
    if (rules.must_not_deepen_nonessential_content) {
      const DEEPENING = [
        /\bi would like to know\b/i, /\bi wanted to ask\b/i, /\bi am curious\b/i,
        /\bi('d| would) love to (hear|know|understand|discuss)\b/i, /\btell me more about\b/i,
        /\bshare (your|more about)\b/i, /\bhow (are|have) you been\b/i,
      ];
      const deepens = DEEPENING.some(p => p.test(text));
      const longerThanOrig = rewriteWc > origWc;
      if (deepens && longerThanOrig) {
        add("must_not_deepen_nonessential_content", false, "Deepens non-essential content and is longer", "fail");
      } else if (deepens) {
        add("must_not_deepen_nonessential_content", false, "Uses deepening language", "warn");
      } else {
        add("must_not_deepen_nonessential_content", true, "No non-essential deepening", "warn");
      }
    }

    // Banned phrases
    if (rules.banned_phrases) {
      for (const phrase of rules.banned_phrases) {
        const found = matchesPhrase(textNorm, phrase);
        add("banned_phrase", !found, `Banned phrase: "${phrase}"${found ? " — found" : ""}`, "fail");
      }
    }

    // Banned tokens (word-boundary)
    if (rules.banned_tokens) {
      for (const token of rules.banned_tokens) {
        const found = matchesToken(text, token);
        add("banned_token", !found, `Banned token: "${token}"${found ? " — found" : ""}`, "fail");
      }
    }

    // Max words
    if (rules.max_words != null) {
      add("max_words", wordCount(text) <= rules.max_words,
        `Word limit: ${wordCount(text)}/${rules.max_words}`, "warn");
    }

    // Max word increase pct
    if (rules.max_word_increase_pct != null && origWc > 0) {
      const maxAllowed = Math.ceil(origWc * (1 + rules.max_word_increase_pct));
      add("max_word_increase_pct", rewriteWc <= maxAllowed,
        `Word increase: ${origWc}→${rewriteWc} (max +${Math.round(rules.max_word_increase_pct * 100)}% = ${maxAllowed})`, "warn");
    }

    // Risk flag requirements (per-test)
    if (rules.required_risk_flags_any_of && rules.required_risk_flags_any_of.length > 0) {
      const canonFlags = (result.risk_flags ?? []).map(f => (canonicalizeFlag(f) ?? f).toLowerCase());
      const satisfied = rules.required_risk_flags_any_of.some(set =>
        set.some(expected => canonFlags.some(cf => cf.includes(expected.toLowerCase())))
      );
      add("required_risk_flags", satisfied,
        `Risk flags match: ${rules.required_risk_flags_any_of.map(s => s.join("/")).join(" OR ")} — got [${result.risk_flags?.join(", ")}]`, "fail");
    }

    // Must-not-flag
    if (rules.must_not_flag_any && rules.must_not_flag_any.length > 0) {
      for (const banned of rules.must_not_flag_any) {
        const canonFlags = (result.risk_flags ?? []).map(f => (canonicalizeFlag(f) ?? f).toLowerCase());
        const flagged = canonFlags.some(cf => cf.includes(banned.toLowerCase()));
        add("must_not_flag", !flagged,
          `Must not flag: "${banned}"${flagged ? ` — found in [${result.risk_flags?.join(", ")}]` : ""}`, "warn");
      }
    }

    // Soft term preservation
    if (rules.must_preserve_terms) {
      for (const term of rules.must_preserve_terms) {
        const found = textNorm.includes(normalizeText(term));
        add("must_preserve_terms", found, `Preserve term: "${term}"`, "warn");
      }
    }
  }

  // ════════════════════════════════════════
  // 10) Scoring logic
  // ════════════════════════════════════════
  let adjustedScore = 10;
  const primaryText = result.primary_rewrite ?? "";

  // -4 for soft violations (new-facts soft, length soft)
  const softViolations = checks.filter(c => c.severity === "warn" &&
    (c.rule === "no_new_facts" || c.rule === "word_length" || c.rule === "max_word_increase_pct" || c.rule === "max_words"));
  if (softViolations.length > 0) adjustedScore -= 4;

  // -3 for vague (missing concrete ask when original had one)
  if (checks.some(c => c.severity === "warn" && c.rule === "must_preserve_terms")) {
    adjustedScore -= 3;
  }

  // -3 for blame language
  if (BLAME_LANGUAGE.some(p => p.test(primaryText))) {
    adjustedScore -= 3;
  }

  adjustedScore = Math.max(1, Math.min(10, adjustedScore));

  // ════════════════════════════════════════
  // Determine overall status
  // ════════════════════════════════════════
  const hasFail = checks.some(c => c.severity === "fail");
  const hasWarn = checks.some(c => c.severity === "warn");
  const status: "pass" | "warn" | "fail" = hasFail ? "fail" : hasWarn ? "warn" : "pass";

  const notes = checks.map(c => {
    const icon = c.severity === "pass" ? "✓" : c.severity === "warn" ? "⚠" : "✗";
    return `${icon} ${c.reason}`;
  });

  return { status, notes, checks, adjustedScore };
}
