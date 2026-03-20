import { useState, useCallback, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Play, CheckCircle, XCircle, AlertTriangle, Loader2, Send, BookmarkPlus } from "lucide-react";
import { toast } from "sonner";

// ── Types ──

interface GoldCase {
  id: string;
  test_id: string;
  category: string;
  original_message: string;
  expected_behavior: string | null;
  must_not_do: string | null;
  validator_rules: ValidatorRules | null;
}

interface ValidatorRules {
  // Preservation
  must_preserve_pov?: boolean;
  must_preserve_message_type?: "question" | "request" | "statement" | "any";
  must_preserve_confirmation?: boolean;
  must_preserve_terms?: string[];
  // Prohibitions
  must_not_introduce_we_language?: boolean;
  must_not_request_past_validation?: boolean;
  must_not_preserve_leverage?: boolean;
  must_not_preserve_financial_assumptions?: boolean;
  must_not_shift_to_response_mode?: boolean;
  must_not_deepen_nonessential_content?: boolean;
  // Length
  max_word_increase_pct?: number;
  max_words?: number;
  // Phrase/token bans
  banned_phrases?: string[];
  banned_tokens?: string[];
  // Risk flags
  required_risk_flags_any_of?: string[][];
  must_not_flag_any?: string[];
  // Severity overrides: rule name → "warn" | "fail"
  severity_overrides?: Record<string, "warn" | "fail">;
}

type CheckSeverity = "pass" | "warn" | "fail";

interface ValidatorCheck {
  rule: string;
  severity: CheckSeverity;
  reason: string;
}

interface ValidatorResult {
  status: "pass" | "warn" | "fail";
  notes: string[];
  checks: ValidatorCheck[];
  adjustedScore?: number;
}

interface RewriteResult {
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

interface CaseRunResult {
  test_id: string;
  category: string;
  original_message: string;
  result: RewriteResult | null;
  validatorStatus: "pass" | "warn" | "fail";
  validatorNotes: string[];
  error?: string;
  promptVersion: string;
  promptSource: string;
}

interface RunHistoryRow {
  id: string;
  prompt_version: string | null;
  prompt_source: string | null;
  run_label: string | null;
  created_at: string;
  pass_count: number;
  warn_count: number;
  fail_count: number;
}

// ── Normalization helpers ──

function normalizeText(s: string): string {
  let t = s.toLowerCase().replace(/\s+/g, " ").trim();
  t = t.replace(/\b(\d{1,2})\s*:\s*(\d{2})\s*(am|pm)\b/gi, (_, h, m, ap) => `${h}:${m} ${ap.toLowerCase()}`);
  t = t.replace(/\b(\d{1,2})\s*(am|pm)\b/gi, (_, h, ap) => `${h}:00 ${ap.toLowerCase()}`);
  t = t.replace(/(\d{1,2})\s*\/\s*(\d{1,2})/g, "$1/$2");
  t = t.replace(/\.{2,}/g, ".").replace(/\s*\.\s*$/, "");
  return t;
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/** Word-boundary match — "guessin" must NOT match "guessing" */
function matchesToken(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function matchesPhrase(textNorm: string, phrase: string): boolean {
  return textNorm.includes(normalizeText(phrase));
}

/** Robust "we/us/let's/our" check that avoids false positives on "Tuesday", "because", etc. */
function hasWeLanguage(text: string): boolean {
  const t = " " + text.replace(/[.,!?;:]/g, " ").replace(/\s+/g, " ").trim() + " ";
  // Match standalone "we", "us", "our", "let's"
  if (/\bwe\b/i.test(t) && !/\b(tuesday|wed|wednesday|awesome|because|use|used|useful|refuse|mouse|house|blouse|abuse|excuse|pause|cause|rouse|browse|douse|louse|spouse|grouse)\b/i.test(t.replace(/\bwe\b/gi, "WE_PLACEHOLDER"))) {
    // Re-check: is "we" standalone?
    const words = t.split(/\s+/).map(w => w.toLowerCase());
    if (words.includes("we")) return true;
  }
  // "us" — must be standalone, not inside words
  const usPattern = /(?:^|\s)us(?:\s|$)/i;
  if (usPattern.test(t)) return true;
  if (/\blet'?s\b/i.test(t)) return true;
  if (/\bour\b/i.test(t)) return true;
  return false;
}

// ── Risk-flag normalization ──

const RISK_FLAG_ALIASES: Record<string, string[]> = {
  past_fact: ["past-fact", "past fact", "confirmation risk", "past-fact confirmation"],
  admission: ["admission", "admission trap", "admission risk"],
  trap: ["trap", "admission trap", "validation trap"],
  escalation: ["escalation", "escalation risk", "leverage", "escalation language"],
  leverage: ["leverage", "escalation", "conflict leverage"],
  emotional: ["emotional", "emotional risk", "emotional deepening"],
  financial: ["financial", "financial assumption", "financial risk", "financial demand"],
  irrelevant: ["irrelevant", "non-child-related", "non-essential"],
  pressure: ["pressure", "demand", "coercive"],
  threat: ["threat", "threatening"],
  denigration: ["denigration", "disparagement", "insult", "name-calling"],
  triangulation: ["triangulation", "child manipulation", "child as messenger"],
  harassment: ["harassment", "repeated contact", "stalking"],
  safety: ["safety", "child safety", "violence", "threat of harm"],
};

function normalizeFlag(flag: string): string[] {
  const lower = flag.toLowerCase().trim();
  const tokens: string[] = [lower];
  for (const [canonical, aliases] of Object.entries(RISK_FLAG_ALIASES)) {
    if (aliases.some((a) => lower.includes(a)) || lower.includes(canonical)) {
      tokens.push(canonical);
    }
  }
  return [...new Set(tokens)];
}

// ── Pattern libraries ──

const RESPONSE_MODE_PHRASES = [
  /\bkeep communication focused\b/i,
  /\bI understand\b/i,
  /\bthank you for sharing\b/i,
  /\bI appreciate you\b/i,
  /\blet'?s focus on\b/i,
];

const PAST_FACT_CONDUCT_PATTERNS = [
  /\b(confirm|clarify|acknowledge|indicate|validate|admit)\s+(whether|that|if)\s+.*\b(you |he |she )?(did|were|was|had|didn't|wasn't|weren't|failed|missed|neglected|changed|switched|moved)\b/i,
  /\b(confirm|clarify|acknowledge|indicate)\s+.*\b(past |previous |last |prior |earlier )/i,
  /\bprovide details\s+.*(about|regarding|on)\s+.*(what happened|the incident|last|previous|prior)\b/i,
  /\b(confirm|clarify|indicate|acknowledge)\s+.*\b(noncompliance|violation|breach|failure)\b/i,
];

const ADMISSION_TRAP_TRIGGERS = /\b(admit|admitting|are you admitting|are you saying|intentionally|confirm you changed|before i respond further)\b/i;

const LEVERAGE_PHRASES = [
  /\brecurring (pattern|issue)\b/i,
  /\baddress this( matter)?\b/i,
  /\bresolve this( matter)?\b/i,
  /\b(requires?|requiring) attention\b/i,
  /\bnecessary steps\b/i,
  /\bprepared to (take action|escalate)\b/i,
  /\bescalat(e|ion)\b/i,
  /\bif necessary\b/i,
  /\bdocument(ing|ed) everything\b/i,
  /\btake action\b/i,
  /\bif i have to\b/i,
  /\bconsequences\b/i,
  /\bongoing (issues|concerns)\b/i,
  /\bpattern\b/i,
  /\bbefore i respond further\b/i,
];

const FINANCIAL_ASSUMPTION_PATTERNS = [
  /\b(making more money|income (has )?changed|earning more)\b/i,
  /\b(afford|financial(ly)? (stable|secure|better|worse))\b/i,
  /\b(take on|cover(ing)?) (a )?(larger|bigger|more) share\b/i,
  /\b(you can|you should|you need to) (pay|contribute|cover)\b/i,
  /\bincreased income\b/i,
  /\bnow that you make more\b/i,
  /\byou need to start paying\b/i,
  /\bonly fair\b/i,
  /\bfair share\b/i,
];

const FINANCIAL_TRIGGERS = /\b(since you'?re making more money|now that you make more|pay more|fair share|only fair)\b/i;

const CONFIRMATION_TRIGGERS = /\b(confirm|cnfirm|need to know)\b/i;

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

function runValidator(
  rules: ValidatorRules | null,
  result: RewriteResult,
  originalMessage?: string,
): ValidatorResult {
  const checks: ValidatorCheck[] = [];
  const origNorm = originalMessage ? normalizeText(originalMessage) : "";
  const origWc = originalMessage ? wordCount(originalMessage) : 0;
  const overrides = rules?.severity_overrides ?? {};

  const add = (ruleName: string, passed: boolean, reason: string, defaultSeverity: "fail" | "warn" | "pass") => {
    const sev = passed ? "pass" : (overrides[ruleName] ?? (defaultSeverity === "pass" ? "warn" : defaultSeverity));
    checks.push({
      rule: ruleName,
      severity: passed ? "pass" : (sev as CheckSeverity),
      reason: passed ? `✓ ${reason}` : reason,
    });
  };

  // ════════════════════════════════════════
  // 1) JSON & schema validation (hard fail)
  // ════════════════════════════════════════
  const REQUIRED_KEYS = [
    "primary_rewrite", "shorter_version", "firmer_version", "tone_assessment",
    "risk_flags", "why_this_is_safer", "original_score", "original_score_notes",
    "rewrite_quality_score", "rewrite_quality_notes",
  ];
  const STRING_FIELDS = ["primary_rewrite", "shorter_version", "firmer_version", "tone_assessment", "why_this_is_safer"];

  for (const key of STRING_FIELDS) {
    const val = (result as any)[key];
    add("schema_string_field", typeof val === "string" && val.trim().length > 0,
      `Field "${key}" must be non-empty string${typeof val !== "string" ? ` — got ${typeof val}` : val?.trim().length === 0 ? " — empty" : ""}`, "fail");
  }

  // tone_assessment must be "Neutral" or "Firm"
  add("schema_tone", result.tone_assessment === "Neutral" || result.tone_assessment === "Firm",
    `tone_assessment must be "Neutral" or "Firm" — got "${result.tone_assessment}"`, "fail");

  // risk_flags must be array with ≥1 entry
  add("schema_risk_flags",
    Array.isArray(result.risk_flags) && result.risk_flags.length >= 1,
    `risk_flags must be array with ≥1 entry — got ${Array.isArray(result.risk_flags) ? result.risk_flags.length : typeof result.risk_flags}`, "fail");

  // Scores 1–10
  add("schema_original_score",
    typeof result.original_score === "number" && result.original_score >= 1 && result.original_score <= 10,
    `original_score must be 1-10 — got ${result.original_score}`, "fail");
  add("schema_rewrite_quality_score",
    typeof result.rewrite_quality_score === "number" && result.rewrite_quality_score >= 1 && result.rewrite_quality_score <= 10,
    `rewrite_quality_score must be 1-10 — got ${result.rewrite_quality_score}`, "fail");

  // ════════════════════════════════════════
  // 2) Global "must never" constraints — applied to ALL rewrite fields
  // ════════════════════════════════════════
  const rewriteTexts: { label: string; text: string }[] = [
    { label: "primary_rewrite", text: result.primary_rewrite ?? "" },
    { label: "shorter_version", text: result.shorter_version ?? "" },
    { label: "firmer_version", text: result.firmer_version ?? "" },
  ];

  // 2A) No shared framing ("we", "us", "let's", "our") — global hard fail
  for (const rt of rewriteTexts) {
    if (!rt.text) continue;
    const origHasWe = originalMessage ? hasWeLanguage(originalMessage) : false;
    if (!origHasWe) {
      const rewriteHasWe = hasWeLanguage(rt.text);
      add("global_no_we_language", !rewriteHasWe,
        `No shared framing in ${rt.label}${rewriteHasWe ? " — found we/us/let's/our" : ""}`, "fail");
    }
  }

  // 2B) No escalation/leverage/litigation intimidation — global hard fail
  for (const rt of rewriteTexts) {
    if (!rt.text) continue;
    const found = LEVERAGE_PHRASES.filter(p => p.test(rt.text));
    add("global_no_escalation", found.length === 0,
      `No escalation/leverage in ${rt.label}${found.length > 0 ? ` — matched ${found.length} pattern(s)` : ""}`, "fail");
  }

  // 2C) No admission traps — conditional on original containing triggers
  if (originalMessage && ADMISSION_TRAP_TRIGGERS.test(originalMessage)) {
    for (const rt of rewriteTexts) {
      if (!rt.text) continue;
      const hasPastFact = PAST_FACT_CONDUCT_PATTERNS.some(p => p.test(rt.text));
      const asksAdmit = /\b(admit|acknowledge|intentionally)\b/i.test(rt.text);
      add("global_no_admission_trap", !hasPastFact && !asksAdmit,
        `No admission trap in ${rt.label}${hasPastFact || asksAdmit ? " — rewrite still seeks admission/validation of disputed past conduct" : ""}`, "fail");
    }
  }

  // ════════════════════════════════════════
  // 3) Confirmation-language validator (conditional)
  // ════════════════════════════════════════
  if (rules?.must_preserve_confirmation || (originalMessage && CONFIRMATION_TRIGGERS.test(originalMessage))) {
    const hasConfirmVerb = /\bconfirm\b/i.test(result.primary_rewrite ?? "");
    add("confirmation_preserved", hasConfirmVerb,
      `primary_rewrite must include verb "confirm"${hasConfirmVerb ? "" : " — not found"}`, "fail");
  }

  // ════════════════════════════════════════
  // 4) Financial assumption validator (conditional)
  // ════════════════════════════════════════
  if (originalMessage && FINANCIAL_TRIGGERS.test(originalMessage)) {
    for (const rt of rewriteTexts) {
      if (!rt.text) continue;
      const hasAssumption = FINANCIAL_ASSUMPTION_PATTERNS.some(p => p.test(rt.text));
      add("financial_no_assumptions", !hasAssumption,
        `No financial assumptions in ${rt.label}${hasAssumption ? " — found income/fairness assumption language" : ""}`, "fail");
    }
  }
  // Also apply if rule explicitly set
  if (rules?.must_not_preserve_financial_assumptions) {
    for (const rt of rewriteTexts) {
      if (!rt.text) continue;
      const hasAssumption = FINANCIAL_ASSUMPTION_PATTERNS.some(p => p.test(rt.text));
      add("must_not_preserve_financial_assumptions", !hasAssumption,
        `No financial assumptions in ${rt.label}`, "fail");
    }
  }

  // ════════════════════════════════════════
  // 5) No new facts introduced (soft fail → score penalty)
  // ════════════════════════════════════════
  if (originalMessage) {
    const newFactPatterns = [
      // Dates/times not in original
      /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/,
      /\b\d{1,2}:\d{2}\s*(am|pm)?\b/i,
      // Amounts not in original
      /\$\d+/,
    ];
    const primaryText = result.primary_rewrite ?? "";
    let newFactsFound = false;
    for (const p of newFactPatterns) {
      const matches = primaryText.match(new RegExp(p.source, p.flags + "g")) ?? [];
      for (const m of matches) {
        if (!origNorm.includes(m.toLowerCase())) {
          newFactsFound = true;
        }
      }
    }
    // Topics not in original
    const TOPIC_WORDS = ["schedule", "school", "doctor", "appointment", "therapy", "counselor"];
    for (const tw of TOPIC_WORDS) {
      if (matchesToken(primaryText, tw) && !matchesToken(originalMessage, tw)) {
        newFactsFound = true;
      }
    }
    add("no_new_facts", !newFactsFound,
      `No new facts/dates/amounts/topics introduced${newFactsFound ? " — found data not in original" : ""}`, "warn");
  }

  // ════════════════════════════════════════
  // 6) Word-length control (soft fail; hard if extreme)
  // ════════════════════════════════════════
  if (origWc > 0) {
    const rewriteWc = wordCount(result.primary_rewrite ?? "");
    const ratio = rewriteWc / origWc;
    if (ratio > 1.3) {
      add("word_length_control", false,
        `primary_rewrite too long: ${rewriteWc} words vs ${origWc} original (${Math.round(ratio * 100)}%)`, ratio > 1.5 ? "fail" : "warn");
    } else {
      add("word_length_control", true,
        `Word length OK: ${rewriteWc}/${origWc} (${Math.round(ratio * 100)}%)`, "pass");
    }
  }

  // ════════════════════════════════════════
  // 7) Expanded category detectors (flags + soft validation)
  // ════════════════════════════════════════
  for (const rt of rewriteTexts) {
    if (!rt.text) continue;
    // Denigration
    if (DENIGRATION_PATTERNS.some(p => p.test(rt.text))) {
      add("no_denigration", false, `Denigration/disparagement detected in ${rt.label}`, "fail");
    }
    // Child manipulation/triangulation
    if (CHILD_MANIPULATION_PATTERNS.some(p => p.test(rt.text))) {
      add("no_child_manipulation", false, `Child manipulation/triangulation in ${rt.label}`, "fail");
    }
    // Harassment
    if (HARASSMENT_PATTERNS.some(p => p.test(rt.text))) {
      add("no_harassment", false, `Harassment phrasing in ${rt.label}`, "fail");
    }
    // Safety risk
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
    const rawFlags = result.risk_flags ?? [];
    const allFlagTokens = rawFlags.flatMap((f) => normalizeFlag(f));

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
      const shifted = RESPONSE_MODE_PHRASES.some((p) => p.test(text));
      add("must_not_shift_to_response_mode", !shifted, "Must not shift to response-mode phrasing", "fail");
    }

    // Past-fact validation (per-rule, in addition to global)
    if (rules.must_not_request_past_validation) {
      const hasPattern = PAST_FACT_CONDUCT_PATTERNS.some((p) => p.test(text));
      const simpleCheck = /\b(confirm|clarify|indicate|acknowledge)\b/i.test(text) &&
        /\b(did|were|was|had|didn't|wasn't|weren't|failed|missed|changed|noncompliance)\b/i.test(text);
      add("must_not_request_past_validation", !hasPattern && !simpleCheck,
        "Must not request validation of disputed past conduct", "fail");
    }

    // Leverage/escalation (per-rule, in addition to global)
    if (rules.must_not_preserve_leverage) {
      const hasLeverage = LEVERAGE_PHRASES.some((p) => p.test(text));
      add("must_not_preserve_leverage", !hasLeverage, "Must not preserve leverage/escalation framing", "fail");
    }

    // We language (per-rule, in addition to global)
    if (rules.must_not_introduce_we_language) {
      const origHasWe = originalMessage ? hasWeLanguage(originalMessage) : false;
      if (!origHasWe) {
        const rewriteHasWe = hasWeLanguage(text);
        add("must_not_introduce_we_language", !rewriteHasWe, "Must not introduce we/us/let's language", "fail");
      }
    }

    // Non-essential content deepening
    if (rules.must_not_deepen_nonessential_content) {
      const DEEPENING_PATTERNS = [
        /\bi would like to know\b/i,
        /\bi wanted to ask\b/i,
        /\bi am curious\b/i,
        /\bi('d| would) love to (hear|know|understand|discuss)\b/i,
        /\btell me more about\b/i,
        /\bshare (your|more about)\b/i,
        /\bhow (are|have) you been\b/i,
        /\blet'?s (talk|discuss|catch up)\b/i,
      ];
      const deepens = DEEPENING_PATTERNS.some((p) => p.test(text));
      const longerThanOrig = rewriteWc > origWc;
      if (deepens && longerThanOrig) {
        add("must_not_deepen_nonessential_content", false,
          "Rewrite deepens non-essential content and is longer than original", "fail");
      } else if (deepens) {
        add("must_not_deepen_nonessential_content", false,
          "Rewrite uses deepening language for non-essential content", "warn");
      } else {
        add("must_not_deepen_nonessential_content", true,
          "No non-essential content deepening detected", "pass");
      }
    }

    // Banned phrases
    if (rules.banned_phrases) {
      for (const phrase of rules.banned_phrases) {
        const found = matchesPhrase(textNorm, phrase);
        add("banned_phrase", !found, `Banned phrase: "${phrase}"${found ? " — found in rewrite" : ""}`, "fail");
      }
    }

    // Banned tokens (word-boundary)
    if (rules.banned_tokens) {
      for (const token of rules.banned_tokens) {
        const found = matchesToken(text, token);
        add("banned_token", !found, `Banned token: "${token}"${found ? " — found in rewrite" : ""}`, "fail");
      }
    }

    // Max words
    if (rules.max_words != null) {
      add("max_words", rewriteWc <= rules.max_words,
        `Word limit: ${rewriteWc}/${rules.max_words}`, "warn");
    }

    // Max word increase pct — WARN by default
    if (rules.max_word_increase_pct != null && origWc > 0) {
      const maxAllowed = Math.ceil(origWc * (1 + rules.max_word_increase_pct));
      const ok = rewriteWc <= maxAllowed;
      add("max_word_increase_pct", ok,
        `Word increase: ${origWc}→${rewriteWc} (max +${Math.round(rules.max_word_increase_pct * 100)}% = ${maxAllowed})`, "warn");
    }

    // Risk flag requirements
    if (rules.required_risk_flags_any_of && rules.required_risk_flags_any_of.length > 0) {
      const satisfied = rules.required_risk_flags_any_of.some((set) =>
        set.some((expected) => {
          const expNorm = expected.toLowerCase().trim();
          return allFlagTokens.some((t) => t.includes(expNorm) || expNorm.includes(t));
        })
      );
      add("required_risk_flags", satisfied,
        `Risk flags must match one of: ${rules.required_risk_flags_any_of.map((s) => s.join("/")).join(" OR ")}` +
        ` — got: [${rawFlags.join(", ")}]`, "fail");
    }

    // Must-not-flag
    if (rules.must_not_flag_any && rules.must_not_flag_any.length > 0) {
      for (const banned of rules.must_not_flag_any) {
        const bannedNorm = banned.toLowerCase().trim();
        const flagged = allFlagTokens.some((t) => t.includes(bannedNorm) || bannedNorm.includes(t));
        add("must_not_flag", !flagged,
          `Must not flag: "${banned}"${flagged ? ` — flagged: [${rawFlags.join(", ")}]` : ""}`, "warn");
      }
    }

    // Soft term preservation
    if (rules.must_preserve_terms) {
      for (const term of rules.must_preserve_terms) {
        const found = textNorm.includes(normalizeText(term));
        add("must_preserve_terms", found, `Preserve term: "${term}"`, "warn");
      }
    }
  } else if (!rules || Object.keys(rules ?? {}).length === 0) {
    checks.push({ rule: "no_rules", severity: "warn", reason: "⚠ No per-test validator_rules defined" });
  }

  // ════════════════════════════════════════
  // 7) Deterministic score adjustment
  // ════════════════════════════════════════
  let adjustedScore = 10;
  const primaryText = result.primary_rewrite ?? "";

  // -2 for soft violations (vagueness, new facts, too long)
  if (checks.some(c => c.severity === "warn")) {
    adjustedScore -= 2;
  }

  // -3 for mild blame language
  if (BLAME_LANGUAGE.some(p => p.test(primaryText))) {
    adjustedScore -= 3;
  }

  // -4 for partial leverage preservation
  if (LEVERAGE_PHRASES.some(p => p.test(primaryText))) {
    adjustedScore -= 4;
  }

  adjustedScore = Math.max(1, adjustedScore);

  // Determine overall status
  const hasFail = checks.some((c) => c.severity === "fail");
  const hasWarn = checks.some((c) => c.severity === "warn");
  const status: "pass" | "warn" | "fail" = hasFail ? "fail" : hasWarn ? "warn" : "pass";

  const notes = checks.map((c) => {
    const icon = c.severity === "pass" ? "✓" : c.severity === "warn" ? "⚠" : "✗";
    return `${icon} ${c.reason}`;
  });

  return { status, notes, checks, adjustedScore };
}

export default function AdminRewriteTests() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, isLoading: roleLoading } = useAdminRole();

  const [cases, setCases] = useState<GoldCase[]>([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [running, setRunning] = useState(false);
  const [currentCase, setCurrentCase] = useState<string | null>(null);
  const [latestResults, setLatestResults] = useState<CaseRunResult[]>([]);
  const [runHistory, setRunHistory] = useState<RunHistoryRow[]>([]);
  const [selectedRunResults, setSelectedRunResults] = useState<any[] | null>(null);

  // Ad hoc test state
  const [adHocMessage, setAdHocMessage] = useState("");
  const [adHocCategory, setAdHocCategory] = useState("");
  const [adHocNotes, setAdHocNotes] = useState("");
  const [adHocRunning, setAdHocRunning] = useState(false);
  const [adHocResult, setAdHocResult] = useState<RewriteResult | null>(null);
  const [adHocError, setAdHocError] = useState<string | null>(null);
  const [adHocSaving, setAdHocSaving] = useState(false);

  // Load active gold suite cases
  useEffect(() => {
    async function load() {
      const { data } = await (supabase.from as any)("ai_gold_suite_cases")
        .select("id, test_id, category, original_message, expected_behavior, must_not_do, validator_rules")
        .eq("feature_key", "communication_shield")
        .eq("mode", "rewrite")
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      setCases(data ?? []);
      setLoadingCases(false);
    }
    load();
  }, []);

  // Load run history
  useEffect(() => {
    async function loadHistory() {
      const { data: runs } = await (supabase.from as any)("ai_gold_suite_runs")
        .select("id, prompt_version, prompt_source, run_label, created_at")
        .eq("feature_key", "communication_shield")
        .eq("mode", "rewrite")
        .order("created_at", { ascending: false })
        .limit(20);
      if (!runs) return;

      // Get pass/fail counts for each run
      const enriched: RunHistoryRow[] = [];
      for (const run of runs) {
        const { data: results } = await (supabase.from as any)("ai_gold_suite_results")
          .select("validator_pass, validator_status")
          .eq("run_id", run.id);
        const passCount = (results ?? []).filter((r: any) => (r.validator_status ?? (r.validator_pass ? "pass" : "fail")) === "pass").length;
        const warnCount = (results ?? []).filter((r: any) => (r.validator_status ?? "") === "warn").length;
        const failCount = (results ?? []).filter((r: any) => {
          const s = r.validator_status ?? (r.validator_pass ? "pass" : "fail");
          return s === "fail";
        }).length;
        enriched.push({ ...run, pass_count: passCount, warn_count: warnCount, fail_count: failCount });
      }
      setRunHistory(enriched);
    }
    loadHistory();
  }, [latestResults]); // reload after a new run

  const runFullSuite = useCallback(async () => {
    if (cases.length === 0) return;
    setRunning(true);
    setLatestResults([]);
    setSelectedRunResults(null);

    // Create a run row
    const { data: runRow, error: runErr } = await (supabase.from as any)("ai_gold_suite_runs")
      .insert({
        feature_key: "communication_shield",
        mode: "rewrite",
        run_label: `Suite run ${new Date().toISOString()}`,
      })
      .select("id")
      .single();

    if (runErr || !runRow) {
      setRunning(false);
      return;
    }
    const runId = runRow.id;

    const results: CaseRunResult[] = [];
    let firstPromptVersion = "unknown";
    let firstPromptSource = "unknown";

    for (const tc of cases) {
      setCurrentCase(tc.test_id);
      let caseResult: CaseRunResult;

      try {
        const { data, error } = await supabase.functions.invoke("communication-shield", {
          body: { message: tc.original_message, mode: "rewrite", skip_quota: true },
        });

        if (error || !data) {
          caseResult = {
            test_id: tc.test_id,
            category: tc.category,
            original_message: tc.original_message,
            result: null,
            validatorStatus: "fail",
            validatorNotes: [error?.message ?? "No data returned"],
            error: error?.message ?? "No data returned",
            promptVersion: "unknown",
            promptSource: "unknown",
          };
        } else {
          const result: RewriteResult = data;
          const pv = (data as any).prompt_version ?? "unknown";
          const ps = (data as any).prompt_source ?? "unknown";
          if (firstPromptVersion === "unknown" && pv !== "unknown") {
            firstPromptVersion = pv;
            firstPromptSource = ps;
          }
          const validation = runValidator(tc.validator_rules, result, tc.original_message);
          caseResult = {
            test_id: tc.test_id,
            category: tc.category,
            original_message: tc.original_message,
            result,
            validatorStatus: validation.status,
            validatorNotes: validation.notes,
            promptVersion: pv,
            promptSource: ps,
          };
        }
      } catch (e: any) {
        caseResult = {
          test_id: tc.test_id,
          category: tc.category,
          original_message: tc.original_message,
          result: null,
          validatorStatus: "fail",
          validatorNotes: [e.message],
          error: e.message,
          promptVersion: "unknown",
          promptSource: "unknown",
        };
      }

      // Store result in DB
      await (supabase.from as any)("ai_gold_suite_results").insert({
        run_id: runId,
        test_id: caseResult.test_id,
        category: caseResult.category,
        original_message: caseResult.original_message,
        primary_rewrite: caseResult.result?.primary_rewrite ?? null,
        shorter_version: caseResult.result?.shorter_version ?? null,
        firmer_version: caseResult.result?.firmer_version ?? null,
        tone_assessment: caseResult.result?.tone_assessment ?? null,
        risk_flags: caseResult.result?.risk_flags ?? [],
        why_this_is_safer: caseResult.result?.why_this_is_safer ?? null,
        original_score: caseResult.result?.original_score ?? null,
        original_score_notes: caseResult.result?.original_score_notes ?? null,
        rewrite_quality_score: caseResult.result?.rewrite_quality_score ?? null,
        rewrite_quality_notes: caseResult.result?.rewrite_quality_notes ?? null,
        prompt_version: caseResult.promptVersion,
        prompt_source: caseResult.promptSource,
        validator_pass: caseResult.validatorStatus === "pass",
        validator_status: caseResult.validatorStatus,
        validator_notes: caseResult.validatorNotes,
      });

      results.push(caseResult);
      setLatestResults([...results]);
    }

    // Update run with prompt metadata
    await (supabase.from as any)("ai_gold_suite_runs")
      .update({ prompt_version: firstPromptVersion, prompt_source: firstPromptSource })
      .eq("id", runId);

    setCurrentCase(null);
    setRunning(false);
  }, [cases]);

  const loadRunResults = useCallback(async (runId: string) => {
    const { data } = await (supabase.from as any)("ai_gold_suite_results")
      .select("*")
      .eq("run_id", runId)
      .order("created_at", { ascending: true });
    setSelectedRunResults(data ?? []);
  }, []);

  const runAdHocTest = useCallback(async () => {
    if (!adHocMessage.trim()) return;
    setAdHocRunning(true);
    setAdHocResult(null);
    setAdHocError(null);
    try {
      const { data, error } = await supabase.functions.invoke("communication-shield", {
        body: { message: adHocMessage.trim(), mode: "rewrite", skip_quota: true },
      });
      if (error || !data) {
        setAdHocError(error?.message ?? "No data returned");
      } else {
        setAdHocResult(data as RewriteResult);
      }
    } catch (e: any) {
      setAdHocError(e.message);
    }
    setAdHocRunning(false);
  }, [adHocMessage]);

  const saveAsGoldCandidate = useCallback(async () => {
    if (!adHocMessage.trim()) return;
    setAdHocSaving(true);
    const testId = `ADHOC-${Date.now()}`;
    const { error } = await (supabase.from as any)("ai_gold_suite_cases").insert({
      feature_key: "communication_shield",
      mode: "rewrite",
      test_id: testId,
      category: adHocCategory.trim() || "ad_hoc",
      original_message: adHocMessage.trim(),
      expected_behavior: null,
      must_not_do: null,
      notes: adHocNotes.trim() || "Saved from ad hoc test",
      is_active: false,
    });
    setAdHocSaving(false);
    if (error) {
      toast.error("Failed to save: " + error.message);
    } else {
      toast.success(`Saved as gold-suite candidate: ${testId}`);
    }
  }, [adHocMessage, adHocCategory, adHocNotes]);

  if (authLoading || roleLoading) {

    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!user || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  const passCount = latestResults.filter((r) => r.validatorStatus === "pass").length;
  const warnCount = latestResults.filter((r) => r.validatorStatus === "warn").length;
  const failCount = latestResults.filter((r) => r.validatorStatus === "fail").length;
  const failedByCategory = latestResults
    .filter((r) => r.validatorStatus === "fail")
    .reduce<Record<string, number>>((acc, r) => {
      acc[r.category] = (acc[r.category] ?? 0) + 1;
      return acc;
    }, {});

  const latestPromptVersion =
    latestResults.find((r) => r.promptVersion !== "unknown")?.promptVersion ?? "—";
  const latestPromptSource =
    latestResults.find((r) => r.promptSource !== "unknown")?.promptSource ?? "—";

  return (
    <AppLayout>
      <div className="h-full overflow-y-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Rewrite QA — Gold Suite
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Internal admin tool · {loadingCases ? "…" : `${cases.length} active cases`}
              {latestPromptVersion !== "—" && (
                <> · Prompt: <span className="font-medium text-foreground">{latestPromptVersion}</span> · Source: {latestPromptSource}</>
              )}
            </p>
          </div>
          <Button onClick={runFullSuite} disabled={running || loadingCases} className="gap-2">
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {running ? `Running (${latestResults.length}/${cases.length})` : "Run Suite"}
          </Button>
        </div>

        {/* Summary cards */}
        {latestResults.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-3xl font-bold text-foreground">{latestResults.length}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-3xl font-bold text-green-500">{passCount}</p>
                <p className="text-xs text-muted-foreground">Passed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-3xl font-bold text-yellow-500">{warnCount}</p>
                <p className="text-xs text-muted-foreground">Warnings</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-3xl font-bold text-destructive">{failCount}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-3xl font-bold text-foreground">
                  {latestResults.length > 0
                    ? `${Math.round((passCount / latestResults.length) * 100)}%`
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground">Pass Rate</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs defaultValue="results">
          <TabsList>
            <TabsTrigger value="results">Results</TabsTrigger>
            <TabsTrigger value="failures">
              Failures
              {failCount > 0 && (
                <Badge variant="destructive" className="ml-2 text-xs">{failCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history">
              History
              {runHistory.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">{runHistory.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="adhoc">Ad Hoc Test</TabsTrigger>
          </TabsList>

          <TabsContent value="results" className="space-y-3 mt-4">
            {latestResults.length === 0 && !running && (
              <p className="text-muted-foreground text-sm">
                Click "Run Suite" to execute the gold test cases from the database.
              </p>
            )}
            {latestResults.map((r) => (
              <Card key={r.test_id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    {r.validatorStatus === "pass" ? (
                      <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                    ) : r.validatorStatus === "warn" ? (
                      <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-destructive shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm font-medium">{r.test_id}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Category: {r.category} · Prompt: {r.promptVersion} · Source: {r.promptSource}
                      </p>
                    </div>
                    <Badge variant={r.validatorStatus === "pass" ? "default" : r.validatorStatus === "warn" ? "secondary" : "destructive"}>
                      {r.validatorStatus.toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-xs">
                    <span className="text-muted-foreground font-medium">Input: </span>
                    <span className="text-foreground">{r.original_message}</span>
                  </div>
                  {r.error && <p className="text-xs text-destructive">Error: {r.error}</p>}
                  {r.result && (
                    <div className="text-xs space-y-1">
                      <p>
                        <span className="text-muted-foreground font-medium">Rewrite: </span>
                        {r.result.primary_rewrite}
                      </p>
                      <p>
                        <span className="text-muted-foreground font-medium">Scores: </span>
                        original={r.result.original_score}, rewrite_quality={r.result.rewrite_quality_score}
                      </p>
                      <p>
                        <span className="text-muted-foreground font-medium">Risk flags: </span>
                        {r.result.risk_flags.join(", ") || "none"}
                      </p>
                    </div>
                  )}
                  {r.validatorNotes.length > 0 && (
                    <div className="text-xs space-y-0.5">
                      <p className="text-muted-foreground font-medium">Assertions:</p>
                      {r.validatorNotes.map((note, i) => (
                        <p key={i} className="flex items-center gap-1.5">
                          {note.startsWith("✓") ? (
                            <CheckCircle className="h-3 w-3 text-green-500" />
                          ) : note.startsWith("⚠") ? (
                            <AlertTriangle className="h-3 w-3 text-yellow-500" />
                          ) : (
                            <XCircle className="h-3 w-3 text-destructive" />
                          )}
                          {note.replace(/^[✓✗⚠]\s*/, "")}
                        </p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {running && currentCase && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Running: {currentCase}
              </div>
            )}
          </TabsContent>

          <TabsContent value="failures" className="mt-4">
            {Object.keys(failedByCategory).length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {latestResults.length === 0 ? "No results yet." : "All tests passed!"}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Failures</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(failedByCategory)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, count]) => (
                      <TableRow key={cat}>
                        <TableCell>{cat}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="destructive">{count}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            {runHistory.length === 0 ? (
              <p className="text-muted-foreground text-sm">No runs yet.</p>
            ) : (
              <div className="space-y-3">
                {runHistory.map((run) => (
                  <Card
                    key={run.id}
                    className="cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => loadRunResults(run.id)}
                  >
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {new Date(run.created_at).toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Prompt: {run.prompt_version ?? "—"} · Source: {run.prompt_source ?? "—"}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-green-500 font-medium">{run.pass_count} pass</span>
                          <span className="text-sm text-yellow-500 font-medium">{run.warn_count} warn</span>
                          <span className="text-sm text-destructive font-medium">{run.fail_count} fail</span>
                          <Badge variant={run.fail_count === 0 ? "default" : "destructive"}>
                            {run.pass_count + run.warn_count + run.fail_count > 0
                              ? `${Math.round((run.pass_count / (run.pass_count + run.warn_count + run.fail_count)) * 100)}%`
                              : "—"}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {/* Expanded run results */}
                {selectedRunResults && (
                  <Card className="mt-4">
                    <CardHeader>
                      <CardTitle className="text-sm">Run Detail</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Test</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Scores</TableHead>
                            <TableHead>Prompt</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedRunResults.map((r: any) => {
                            const status = r.validator_status ?? (r.validator_pass ? "pass" : "fail");
                            return (
                            <TableRow key={r.id}>
                              <TableCell className="text-xs">{r.test_id}</TableCell>
                              <TableCell className="text-xs">{r.category}</TableCell>
                              <TableCell>
                                {status === "pass" ? (
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                ) : status === "warn" ? (
                                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-destructive" />
                                )}
                              </TableCell>
                              <TableCell className="text-xs">
                                {r.original_score ?? "—"}/{r.rewrite_quality_score ?? "—"}
                              </TableCell>
                              <TableCell className="text-xs">{r.prompt_version ?? "—"}</TableCell>
                            </TableRow>
                          );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="adhoc" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Run a single message through the live rewrite engine</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  placeholder="Paste the original message here…"
                  value={adHocMessage}
                  onChange={(e) => setAdHocMessage(e.target.value)}
                  rows={3}
                  className="text-sm"
                />
                <div className="flex gap-3">
                  <Input
                    placeholder="Category label (optional)"
                    value={adHocCategory}
                    onChange={(e) => setAdHocCategory(e.target.value)}
                    className="text-sm max-w-[200px]"
                  />
                  <Input
                    placeholder="Notes (optional)"
                    value={adHocNotes}
                    onChange={(e) => setAdHocNotes(e.target.value)}
                    className="text-sm flex-1"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={runAdHocTest}
                    disabled={adHocRunning || !adHocMessage.trim()}
                    className="gap-2"
                  >
                    {adHocRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {adHocRunning ? "Running…" : "Run Test"}
                  </Button>
                  {adHocResult && (
                    <Button
                      variant="outline"
                      onClick={saveAsGoldCandidate}
                      disabled={adHocSaving}
                      className="gap-2"
                    >
                      {adHocSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookmarkPlus className="h-4 w-4" />}
                      Save as Gold-Suite Candidate
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {adHocError && (
              <Card className="border-destructive">
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm text-destructive">Error: {adHocError}</p>
                </CardContent>
              </Card>
            )}

            {adHocResult && (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Result</CardTitle>
                    <div className="text-xs text-muted-foreground">
                      Prompt: <span className="font-medium text-foreground">{(adHocResult as any).prompt_version ?? "—"}</span>
                      {" · "}Source: {(adHocResult as any).prompt_source ?? "—"}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Scores */}
                  <div className="flex gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-foreground">{adHocResult.original_score}</p>
                      <p className="text-xs text-muted-foreground">Original Score</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-foreground">{adHocResult.rewrite_quality_score}</p>
                      <p className="text-xs text-muted-foreground">Rewrite Score</p>
                    </div>
                  </div>

                  <Separator />

                  {/* Rewrites */}
                  <div className="space-y-2 text-sm">
                    <div>
                      <p className="text-muted-foreground font-medium text-xs mb-1">Primary Rewrite</p>
                      <p className="text-foreground bg-muted/50 rounded p-2">{adHocResult.primary_rewrite}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground font-medium text-xs mb-1">Shorter Version</p>
                      <p className="text-foreground bg-muted/50 rounded p-2">{adHocResult.shorter_version}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground font-medium text-xs mb-1">Firmer Version</p>
                      <p className="text-foreground bg-muted/50 rounded p-2">{adHocResult.firmer_version}</p>
                    </div>
                  </div>

                  <Separator />

                  {/* Analysis */}
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-muted-foreground font-medium">Tone Assessment: </span>
                      <span className="text-foreground">{adHocResult.tone_assessment}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-medium">Risk Flags: </span>
                      <span className="text-foreground">
                        {adHocResult.risk_flags.length > 0 ? adHocResult.risk_flags.join(", ") : "none"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-medium">Why This is Safer: </span>
                      <span className="text-foreground">{adHocResult.why_this_is_safer}</span>
                    </div>
                  </div>

                  <Separator />

                  {/* Score Notes */}
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <p className="text-muted-foreground font-medium mb-1">Original Score Notes</p>
                      <ul className="space-y-0.5 text-foreground">
                        {(adHocResult.original_score_notes ?? []).map((n, i) => (
                          <li key={i}>• {n}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-muted-foreground font-medium mb-1">Rewrite Quality Notes</p>
                      <ul className="space-y-0.5 text-foreground">
                        {(adHocResult.rewrite_quality_notes ?? []).map((n, i) => (
                          <li key={i}>• {n}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
