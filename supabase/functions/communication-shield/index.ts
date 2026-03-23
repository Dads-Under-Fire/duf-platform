import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  jsonResponse,
  logRequest,
  checkRateLimit,
  authenticateRequest,
} from "../_shared/auth-rate-limit.ts";

// ── Config ──
const FN = "communication-shield";
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const MODEL_PRIMARY = "gpt-4o-mini";
const MODEL_FALLBACK = "gpt-4o";
const WORKFLOW_VERSION = "staged-v1";

// ══════════════════════════════════════════════════════════════
// PROMPTS (server-side hardcoded fallbacks)
// ══════════════════════════════════════════════════════════════

const LEGAL_SAFETY_RULES = `LEGAL SAFETY — ABSOLUTE RULES:
Never:
- Admit fault, guilt, abuse, wrongdoing, or liability
- Apologize or express regret — do NOT use "I apologize", "I'm sorry", "I regret", "any confusion I caused", or any similar phrasing unless the user explicitly instructs you to apologize
- Speculate about facts, motives, or the other parent's mental state
- Argue back, mirror insults, or use retaliatory language
- Use emotional, sarcastic, passive-aggressive, or defensive language
- Reference system issues, retries, model failures, or service unavailability
- Explain, justify, or narrate past actions or events — even if accused
- Confirm or deny specific allegations, even indirectly
- Provide details that could be interpreted as an admission of fault
- Use backward-looking explanatory phrases such as:
  • "my absence was due to…"
  • "I missed… because…"
  • "I was late because…"
  • "it happened because…"
  • "the reason was…"
  • "what actually happened was…"
  • "I didn't do that because…"

LEGAL TRAP DETECTION:
If the incoming message attempts to force an admission, reinterpret the past, pin responsibility, contains accusations, or creates a legal trap:
- DO NOT explain what happened
- DO NOT give reasons for absence, lateness, missed pickup, or prior conduct
- DO NOT confirm or deny specific allegations
- DO NOT provide details that could be used against the user
- DO NOT clarify misunderstandings by narrating past events
- Redirect to neutral, forward-looking language that preserves any specific logistics from the incoming message
- Reference agreed schedules, plans, or policies when possible
- Keep the response minimal, controlled, and non-emotional
- PRESERVE specific details from the incoming message (times, dates, pickup/drop-off, locations) — do not replace them with generic phrases
- Preferred safe patterns (use specific details when available):
  • "I will be at the scheduled pickup location today." (when message mentions pickup today)
  • "Drop-off will be at 5pm per the agreement." (when message mentions 5pm drop-off)
  • "I will follow the agreed schedule moving forward." (ONLY when no specific logistics are mentioned)

Prefer:
- Neutral, factual wording
- Brief boundary-setting without aggression
- Logistics-focused language (schedules, health, school, transportation)
- Child-centered framing when relevant
- Forward-looking language instead of backward-looking explanations
- Documentation-safe language appropriate for review by a judge or custody evaluator`;

const QUALITY_RULES = `OUTPUT QUALITY — ABSOLUTE RULES:
- Every output field must contain real, complete text — never placeholder brackets like [primary response], [shorter version], [explanation], etc.
- If you are uncertain, produce a safe, neutral, complete output anyway. Never leave fields empty or use filler text.
- Do not output system-level language such as "retry shortly", "guidance unavailable", "service error", or "temporarily unable".
- All text must read as something a real person would actually send or read.`;

const SCORING_INSTRUCTIONS = `DUAL SCORING — You MUST provide TWO separate scores:

1. "original_score" (integer 1-10): Evaluate the ORIGINAL message the user submitted.
   Score the original message for risk:
   - 1-3 = very risky (threats, admissions, strong accusations, hostile language)
   - 4-5 = risky (emotional, defensive, vague, passive-aggressive)
   - 6-7 = moderate issues (some emotional language, minor vagueness)
   - 8-9 = mostly safe (minor issues only)
   - 10 = already clean, neutral, and court-safe
   
   Also provide "original_score_notes" — array of strings describing each issue found.

2. "rewrite_quality_score" (integer 1-10): Evaluate ONLY your rewritten/generated output quality.
   A score of 10 should be EXCEPTIONALLY RARE — reserved only for rewrites that require zero improvement.
   
   Also provide "rewrite_quality_notes" — array of strings describing each deduction.

RISK FLAGS RULES:
- risk_flags MUST list every issue found in the ORIGINAL message
- Use SPECIFIC, ACCURATE flag labels
- If original is perfectly neutral, set risk_flags to ["No risk flags"]
- NEVER return an empty array for risk_flags`;

const PERSPECTIVE_RULES = `PERSPECTIVE PRESERVATION — ABSOLUTE RULES:
- NEVER change the speaker's perspective. If the user wrote "I will pick up", do NOT rewrite as "You will pick up" or "The children will be picked up."
- NEVER assume commitments or actions on behalf of either party that were not in the original message.

TONE CONTROL — FIRM, NOT SUBMISSIVE:
- NEVER use passive or weak phrasing. Specifically BANNED phrases:
  • "I would appreciate" / "I would appreciate it if"
  • "I feel" / "I feel like" / "I feel that"
  • "I was hoping" / "I was wondering"
  • "If that's okay" / "If you don't mind"
  • "Perhaps we could" / "Maybe we should"
  • "Would it be possible" / "Could you possibly"
  • "I just wanted to" / "I just think"
  • "It seems like" / "It appears that"
- Tone must be FIRM, NEUTRAL, and PROFESSIONAL — never submissive, pleading, or apologetic.
- Use direct statements: "I will", "Please confirm", "The schedule is", "Drop-off is at 5pm."`;

const ALTERNATIVES_INSTRUCTIONS = `THREE ALTERNATIVES REQUIREMENT:
You MUST provide exactly 3 alternative versions in "three_alternatives" (array of 3 strings):
1. MORE DIRECT version — shorter, more assertive, cuts to the point
2. SLIGHTLY SOFTER version — still neutral and firm, but slightly warmer without being weak or submissive
3. HIGHLY STRUCTURED/FORMAL version — professional, documentation-ready, suitable for legal review

All three alternatives MUST follow the same legal safety rules as the primary rewrite/response.
None may contain admissions, emotional language, threats, or perspective errors.`;

const BASE_INSTRUCTIONS = `All responses must:
- Be SHORT, DIRECT, and CONCISE — prefer 1-3 sentences maximum
- Be neutral and factual
- Avoid accusations, emotional language, sarcasm, and defensiveness
- Focus on child logistics: schedules, health, school, or transportation
- Ignore inflammatory language from the other parent
- De-escalate conflict
- Sound appropriate for review by a judge or custody evaluator

${PERSPECTIVE_RULES}

${LEGAL_SAFETY_RULES}

${QUALITY_RULES}

${SCORING_INSTRUCTIONS}

JSON VALIDATION RULE:
Your output MUST be valid JSON via the provided tool call. If any field is missing or malformed, regenerate the entire output. Every field must be populated with real content — never null, empty, or placeholder.`;

const RESPOND_INTRO = (originalContext?: string) =>
  `The user received a message from the other parent.${originalContext ? ` The original message received was: "${originalContext}"` : ""}

IMPORTANT — RECOMMENDATION LAYER:
Before drafting a response, FIRST evaluate whether responding is actually the safest choice.

Analyze the incoming message carefully. Set "recommendation_type" to one of:
- "respond" — Contains ANY actionable logistics. Provide full response variants.
- "do_not_respond" — PURELY insulting/baiting with ZERO logistical content.
- "brief_boundary_response" — Minor logistical element buried in hostility.

Always prioritize protecting the user from unnecessary engagement and legal risk.`;

const REWRITE_INTRO = `The user wants to REWRITE their own drafted outgoing co-parent message into neutral, factual, court-safe language.

PURPOSE:
- Preserve the user's SAFEST FUNCTIONAL INTENT while reducing legal risk, emotional language, escalation, and ambiguity.
- The output must read as something the user could copy-paste and send immediately.

REWRITE MODE RULES:
- Never recommend "do not respond" — rewrite mode always produces a rewritten message
- Never return system/failure-style language
- Never return placeholder text — always produce a real, complete rewrite`;

const STRICTER_RETRY_ADDENDUM = `
CRITICAL RETRY INSTRUCTION: Your previous output was scored as legally unsafe. This time you MUST:
- Produce ZERO apology language
- Produce ZERO backward-looking explanations
- Keep response under 3 sentences
- Focus ONLY on forward-looking logistics`;

const SEMANTIC_RETRY_ADDENDUM = `
CRITICAL RETRY — SEMANTIC VALIDATION FAILED. Regenerate ALL variants following these rules strictly:
1. NEVER convert a request into "I will"
2. NEVER reframe directed responsibility as "we need to"
3. NEVER soften with passive phrases
4. firmer_version must be assertive but NEVER hostile or controlling`;

// ══════════════════════════════════════════════════════════════
// TOOL SCHEMAS
// ══════════════════════════════════════════════════════════════

const RESPOND_TRIAGE_TOOL = {
  type: "function" as const,
  name: "classify_incoming_message",
  description: "Classify the incoming message for response recommendation",
  parameters: {
    type: "object",
    properties: {
      recommendation_type: { type: "string", enum: ["respond", "do_not_respond", "brief_boundary_response"] },
      should_show_intent_picker: { type: "boolean" },
      contains_actionable_logistics: { type: "boolean" },
      actionable_logistics_summary: { type: "string" },
      recommendation_reason: { type: "string" },
      allow_boundary_override: { type: "boolean" },
      risk_flags: { type: "array", items: { type: "string" } },
      original_score: { type: "integer" },
      original_score_notes: { type: "array", items: { type: "string" } },
    },
    required: ["recommendation_type", "should_show_intent_picker", "contains_actionable_logistics", "actionable_logistics_summary", "recommendation_reason", "allow_boundary_override", "risk_flags", "original_score", "original_score_notes"],
    additionalProperties: false,
  },
  strict: true,
};

const RESPOND_TOOL = {
  type: "function" as const,
  name: "format_response",
  description: "Return the structured court-safe response with recommendation",
  parameters: {
    type: "object",
    properties: {
      recommendation_type: { type: "string", enum: ["respond", "do_not_respond", "brief_boundary_response"] },
      primary_rewrite: { type: "string" },
      shorter_version: { type: "string" },
      firmer_version: { type: "string" },
      fallback_response: { type: "string" },
      tone_assessment: { type: "string" },
      risk_flags: { type: "array", items: { type: "string" } },
      why_this_is_safer: { type: "string" },
      three_alternatives: { type: "array", items: { type: "string" } },
      original_score: { type: "integer" },
      original_score_notes: { type: "array", items: { type: "string" } },
      response_quality_score: { type: "integer" },
      response_quality_notes: { type: "array", items: { type: "string" } },
    },
    required: ["recommendation_type", "primary_rewrite", "shorter_version", "firmer_version", "fallback_response", "tone_assessment", "risk_flags", "why_this_is_safer", "three_alternatives", "original_score", "original_score_notes", "response_quality_score", "response_quality_notes"],
    additionalProperties: false,
  },
  strict: true,
};

const REWRITE_TOOL = {
  type: "function" as const,
  name: "format_rewrite",
  description: "Return the structured court-safe rewrite with three variants",
  parameters: {
    type: "object",
    properties: {
      primary_rewrite: { type: "string" },
      shorter_version: { type: "string" },
      firmer_version: { type: "string" },
      tone_assessment: { type: "string" },
      risk_flags: { type: "array", items: { type: "string" } },
      why_this_is_safer: { type: "string" },
      original_score: { type: "integer" },
      original_score_notes: { type: "array", items: { type: "string" } },
      rewrite_quality_score: { type: "integer" },
      rewrite_quality_notes: { type: "array", items: { type: "string" } },
    },
    required: ["primary_rewrite", "shorter_version", "firmer_version", "tone_assessment", "risk_flags", "why_this_is_safer", "original_score", "original_score_notes", "rewrite_quality_score", "rewrite_quality_notes"],
    additionalProperties: false,
  },
  strict: true,
};

const TRIAGE_TOOL = {
  type: "function" as const,
  name: "classify_draft",
  description: "Classify the pasted draft message for safety and intent",
  parameters: {
    type: "object",
    properties: {
      sendability_status: { type: "string", enum: ["safe", "salvageable", "redirect"] },
      output_path: { type: "string", enum: ["rewrite", "redirect_choice", "no_message"] },
      sendability_reason: { type: "string" },
      detected_intent: { type: "string" },
      detected_tone: { type: "string" },
      risk_flags: { type: "array", items: { type: "string" } },
      triage_confidence: { type: "number" },
      goal_options: { type: "array", items: { type: "string" } },
    },
    required: ["sendability_status", "output_path", "sendability_reason", "detected_intent", "detected_tone", "risk_flags", "triage_confidence", "goal_options"],
    additionalProperties: false,
  },
  strict: true,
};

// REDIRECT_TOOL removed — no longer used in staged workflow

// ══════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ══════════════════════════════════════════════════════════════

const PLACEHOLDER_PATTERN = /\[.*?\]/;
const VALID_RECOMMENDATION_TYPES = ["respond", "do_not_respond", "brief_boundary_response"];

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

function containsPlaceholder(val: unknown): boolean {
  return typeof val === "string" && PLACEHOLDER_PATTERN.test(val);
}

function isNonEmptyString(val: unknown): val is string {
  return typeof val === "string" && val.trim().length > 0;
}

// ══════════════════════════════════════════════════════════════
// SCORING: ORIGINAL MESSAGE
// ══════════════════════════════════════════════════════════════

const ESCALATION_PATTERNS = [
  /\byou always\b/i, /\byou never\b/i, /\bthat's a lie\b/i,
  /\byou('re| are) (wrong|lying)\b/i, /\bhow dare you\b/i,
  /\bunbelievable\b/i, /\byou have no right\b/i,
];

const INSULT_ENGAGEMENT_PATTERNS = [
  /\bthat's unfair\b/i, /\bthat hurts\b/i, /\bi can't believe you\b/i,
  /\byou('re| are) being (difficult|unreasonable|impossible)\b/i,
];

function scoreOriginalMessage(originalMessage: string): { score: number; notes: string[] } {
  const notes: string[] = [];
  let deductions = 0;
  let issueCategories = 0;
  const text = originalMessage;

  // Threats (-3)
  const threatPatterns = [
    /\bi('ll| will) (make sure|destroy|ruin|end)\b/i,
    /\byou('ll| will) (regret|pay|lose|suffer)\b/i,
    /\bwatch (out|yourself)\b/i, /\bi('m| am) going to\b.*\b(court|lawyer|police)\b/i,
    /\bi('ll| will) take\b.*\b(kids?|children|custody)\b/i,
  ];
  let threatHits = 0;
  for (const p of threatPatterns) { if (p.test(text)) { threatHits++; notes.push(`threat: ${p.source}`); } }
  if (threatHits > 0) { deductions += 3; issueCategories++; notes.push("-3: threats/intimidation"); }

  // Admission of fault (-3)
  const faultPatterns = [
    /\bi('m| am) sorry\b/i, /\bi apologize\b/i, /\bmy fault\b/i,
    /\bi forgot\b/i, /\bi should have\b/i, /\bi failed\b/i,
    /\bi was wrong\b/i, /\bi made a mistake\b/i, /\bi admit\b/i, /\bi regret\b/i,
  ];
  let faultHits = 0;
  for (const p of faultPatterns) { if (p.test(text)) { faultHits++; notes.push(`fault: ${p.source}`); } }
  if (faultHits > 0) { deductions += 3; issueCategories++; notes.push("-3: admission of fault"); }

  // Strong accusations (-3)
  const accusatoryPatterns = [
    /\byou always\b/i, /\byou never\b/i, /\byour fault\b/i,
    /\byou caused\b/i, /\byou did this\b/i,
    /\byou('re| are) (wrong|lying|the problem|the reason)\b/i,
    /\bthat's a lie\b/i, /\bhow dare you\b/i, /\byou have no right\b/i,
  ];
  let accusatoryHits = 0;
  for (const p of accusatoryPatterns) { if (p.test(text)) { accusatoryHits++; notes.push(`accusatory: ${p.source}`); } }
  if (accusatoryHits > 0) { deductions += 3; issueCategories++; notes.push("-3: accusatory language"); }

  // Emotional language (-2)
  const emotionalPatterns = [
    /\bupset\b/i, /\bfrustrated\b/i, /\bhurt\b/i, /\bangry\b/i,
    /\bdisappointed\b/i, /\bworried\b/i, /\bscared\b/i, /\bheartbroken\b/i,
    /\bi feel\b/i, /\bit makes me\b/i, /\byou make me\b/i,
    /\bi can't believe\b/i, /\bthis is so unfair\b/i, /\bhow could you\b/i,
  ];
  let emotionalHits = 0;
  for (const p of emotionalPatterns) { if (p.test(text)) { emotionalHits++; notes.push(`emotional: ${p.source}`); } }

  // Short emotional detection
  const trimmed = text.trim();
  const wordCount = trimmed.split(/\s+/).length;
  const shortEmotionalPatterns = [
    /^unbelievable[.!?]*$/i, /^seriously[.!?]*$/i, /^ridiculous[.!?]*$/i,
    /^wow[.!?]*$/i, /^fine[.!?]*$/i, /^great[.!?]*$/i, /^nice[.!?]*$/i,
    /^really[.!?]*$/i, /^typical[.!?]*$/i, /^incredible[.!?]*$/i,
    /^figures?[.!?]*$/i, /^right[.!?]*$/i, /^sure[.!?]*$/i, /^of course[.!?]*$/i,
  ];
  let shortEmotionalHit = false;
  if (wordCount <= 4) {
    for (const p of shortEmotionalPatterns) {
      if (p.test(trimmed)) { shortEmotionalHit = true; notes.push(`short_emotional: ${p.source}`); break; }
    }
    if (!shortEmotionalHit && wordCount <= 3 && /[!?]{1,}$/.test(trimmed) && !/^(yes|no|ok|okay|confirmed|done|received|noted)[.!?]*$/i.test(trimmed)) {
      shortEmotionalHit = true;
      notes.push("short_emotional: short reactive message");
    }
  }
  if (shortEmotionalHit && emotionalHits === 0) {
    emotionalHits++;
    notes.push("-2: short emotional/reactive message");
    deductions += 2;
    issueCategories++;
  }
  if (emotionalHits > 0 && !shortEmotionalHit) { deductions += 2; issueCategories++; notes.push("-2: emotional language"); }

  // Admission trap (-3)
  const admissionTrapPatterns = [
    /\bso you agree\b/i, /\byou admit\b/i, /\bthen you acknowledge\b/i,
    /\bso basically you('re| are) saying\b/i, /\bso you('re| are) saying\b/i,
    /\bso you confirm\b/i, /\byou('re| are) confirming\b/i,
    /\bso you('re| are) admitting\b/i, /\byou just admitted\b/i,
    /\bso you acknowledge\b/i, /\bthen you agree\b/i,
  ];
  let admissionTrapHits = 0;
  for (const p of admissionTrapPatterns) { if (p.test(text)) { admissionTrapHits++; notes.push(`admission_trap: ${p.source}`); } }
  if (admissionTrapHits > 0) { deductions += 3; issueCategories++; notes.push("-3: admission trap"); }

  // Hostile/aggressive (-2)
  const hostilePatterns = [
    /\byou('re| are) (pathetic|disgusting|terrible|worthless|selfish)\b/i,
    /\bshut up\b/i, /\bgo to hell\b/i, /\byou disgust me\b/i,
    /\bnobody (wants|likes|cares about) you\b/i,
  ];
  let hostileHits = 0;
  for (const p of hostilePatterns) { if (p.test(text)) { hostileHits++; notes.push(`hostile: ${p.source}`); } }
  if (hostileHits > 0) { deductions += 2; issueCategories++; notes.push("-2: hostile/aggressive tone"); }

  // Passive aggression (-2)
  const paPatterns = [
    /\bthanks for nothing\b/i, /\bwhatever\b/i, /\bgood luck with that\b/i,
    /\bnice try\b/i, /\bsure,? (right|okay)\b/i, /\boh really\b/i,
  ];
  let paHits = 0;
  for (const p of paPatterns) { if (p.test(text)) { paHits++; notes.push(`passive_aggressive: ${p.source}`); } }
  if (paHits > 0) { deductions += 2; issueCategories++; notes.push("-2: passive aggression"); }

  // Over-explaining (-2)
  const justPatterns = [
    /\bbecause\b/i, /\bdue to\b/i, /\bthe reason\b/i,
    /\blet me explain\b/i, /\bwhat happened was\b/i,
  ];
  let justHits = 0;
  for (const p of justPatterns) { if (p.test(text)) { justHits++; notes.push(`justification: ${p.source}`); } }
  if (justHits > 0) { deductions += 2; issueCategories++; notes.push("-2: over-explaining"); }

  // Apology (-2)
  let apologyHits = 0;
  for (const p of APOLOGY_PATTERNS) { if (p.test(text)) { apologyHits++; } }
  if (apologyHits > 0 && faultHits === 0) { deductions += 2; issueCategories++; notes.push("-2: apology language"); }

  // Vague (-1)
  const vaguePatterns = [/\bmaybe\b/i, /\bkind of\b/i, /\bhopefully\b/i, /\bi think\b/i, /\bi guess\b/i, /\bprobably\b/i];
  let vagueHits = 0;
  for (const p of vaguePatterns) { if (p.test(text)) { vagueHits++; } }
  if (vagueHits > 0) { deductions += 1; issueCategories++; notes.push("-1: vague phrasing"); }

  // Escalation (-1)
  let escalationHits = 0;
  for (const p of [...ESCALATION_PATTERNS, ...INSULT_ENGAGEMENT_PATTERNS]) {
    if (p.test(text) && !accusatoryHits) { escalationHits++; }
  }
  if (escalationHits > 0 && accusatoryHits === 0) { deductions += 1; issueCategories++; notes.push("-1: escalation risk"); }

  // Classification flags (no deduction)
  const pastFactPatterns = [
    /\bso you (agree|admit|acknowledge|confirm)\b/i,
    /\byou (agreed|admitted|acknowledged|confirmed|said|told me)\b/i,
    /\blast time you\b/i, /\byou already said\b/i, /\byou promised\b/i,
    /\byou were (late|absent|wrong)\b/i, /\byou didn't (show|come|follow|pick)\b/i,
    /\byou missed\b/i, /\byou failed to\b/i, /\byou canceled\b/i,
  ];
  let pastFactHits = 0;
  for (const p of pastFactPatterns) { if (p.test(text)) { pastFactHits++; } }
  if (pastFactHits > 0) { notes.push("flag: Past-fact confirmation risk"); }

  const financialPatterns = [
    /\b(you|your) (owe|pay|paying|income|salary|raise|money|finances?)\b/i,
    /\bchild support\b/i, /\balimony\b/i, /\breimburse\b/i, /\bsplit the cost\b/i,
  ];
  let financialHits = 0;
  for (const p of financialPatterns) { if (p.test(text)) { financialHits++; } }
  if (financialHits > 0) { notes.push("flag: Financial demand or assumption"); }

  const irrelevantPatterns = [
    /\bi miss (us|you|our (family|life|marriage|relationship))\b/i,
    /\bremember when we\b/i, /\bwe used to\b/i,
    /\b(my|your) (stuff|things|belongings|furniture)\b/i,
    /\bgive (me )?back my\b/i, /\byou hurt me\b/i,
  ];
  let irrelevantHits = 0;
  for (const p of irrelevantPatterns) { if (p.test(text)) { irrelevantHits++; } }
  if (irrelevantHits > 0) { notes.push("flag: Irrelevant or non-child-related topic"); }

  let score = Math.max(1, 10 - deductions);
  if (threatHits > 0 || faultHits > 0 || accusatoryHits > 0) { score = Math.min(score, 4); }
  if (admissionTrapHits > 0) { score = Math.min(score, 5); }
  if (shortEmotionalHit) { score = Math.min(score, 6); }
  if (emotionalHits > 0 || vagueHits > 0) { score = Math.min(score, 8); }
  score = Math.max(1, Math.min(10, score));

  return { score, notes };
}

// ══════════════════════════════════════════════════════════════
// SCORING: OUTPUT QUALITY
// ══════════════════════════════════════════════════════════════

interface OutputQualityResult {
  score: number | null;
  notes: string[];
  quality_score_status: "excellent" | "acceptable" | "weak" | "reject" | null;
}

const OVERLY_FORMAL_PATTERNS = [
  /\bhereby\b/i, /\bpursuant to\b/i, /\bin accordance with\b/i,
  /\bplease be advised\b/i, /\bkindly be informed\b/i,
];

const PASSIVE_WEAK_PATTERNS = [
  /\bperhaps we could\b/i, /\bmaybe we should\b/i,
  /\bi was wondering if\b/i, /\bif that's okay with you\b/i,
  /\bwould it be possible\b/i, /\bif you don't mind\b/i,
  /\bi just wanted to\b/i, /\bi was hoping\b/i,
  /\bi would appreciate\b/i, /\bi feel\b/i, /\bi feel like\b/i,
  /\bcould you possibly\b/i, /\bit seems like\b/i,
];

const VAGUE_REWRITE_PATTERNS = [
  /\bsometime soon\b/i, /\bat some point\b/i,
  /\bwhen you get a chance\b/i, /\bwhenever works\b/i,
  /\bmaybe\b/i, /\bkind of\b/i, /\bhopefully\b/i,
  /\bi think\b/i, /\bi guess\b/i, /\bprobably\b/i,
];

function scoreOutputQuality(
  result: Record<string, unknown>,
  mode: "respond" | "rewrite",
): OutputQualityResult {
  const notes: string[] = [];
  let deductions = 0;

  const textFields: string[] = [];
  if (mode === "respond") {
    if (typeof result.primary_rewrite === "string") textFields.push(result.primary_rewrite);
    if (result.recommendation_type !== "do_not_respond") {
      if (typeof result.shorter_version === "string") textFields.push(result.shorter_version);
      if (typeof result.firmer_version === "string") textFields.push(result.firmer_version);
    }
    if (Array.isArray(result.three_alternatives)) {
      for (const alt of result.three_alternatives) { if (typeof alt === "string") textFields.push(alt); }
    }
  } else {
    if (typeof result.primary_rewrite === "string") textFields.push(result.primary_rewrite);
    if (typeof result.shorter_version === "string") textFields.push(result.shorter_version);
    if (typeof result.firmer_version === "string") textFields.push(result.firmer_version);
  }

  const allText = textFields.join(" ");
  if (!allText.trim()) return { score: null, notes: ["empty_output"], quality_score_status: null };

  let issueCategories = 0;

  // Emotional (-2)
  const emotionalPatterns = [...APOLOGY_PATTERNS, /\bsorry\b/i, /\bupset\b/i, /\bfrustrated\b/i, /\bhurt\b/i, /\bangry\b/i, /\bdisappointed\b/i];
  let emotionalHits = 0;
  for (const p of emotionalPatterns) { if (p.test(allText)) { emotionalHits++; } }
  if (emotionalHits > 0) { deductions += 2; issueCategories++; notes.push("-2: emotional language in output"); }

  // Vague (-2)
  let vagueHits = 0;
  for (const p of VAGUE_REWRITE_PATTERNS) { if (p.test(allText)) { vagueHits++; } }
  if (vagueHits > 0) { deductions += 2; issueCategories++; notes.push("-2: vague phrasing in output"); }

  // Defensive (-2)
  const defensivePatterns = [...ADMISSION_PATTERNS, /\bbecause\b/i, /\bdue to\b/i, /\blet me explain\b/i];
  let defensiveHits = 0;
  for (const p of defensivePatterns) { if (p.test(allText)) { defensiveHits++; } }
  if (defensiveHits > 0) { deductions += 2; issueCategories++; notes.push("-2: defensive/justification in output"); }

  // Accusatory (-3)
  const accusatoryPatterns = [...ESCALATION_PATTERNS, /\byour fault\b/i, /\byou caused\b/i, /\byou did this\b/i];
  let accusatoryHits = 0;
  for (const p of accusatoryPatterns) { if (p.test(allText)) { accusatoryHits++; } }
  if (accusatoryHits > 0) { deductions += 3; issueCategories++; notes.push("-3: accusatory language in output"); }

  // Fault admission (-3)
  const faultPatterns = [/\bi forgot\b/i, /\bi should have\b/i, /\bi('m| am) sorry\b/i, /\bi apologize\b/i, /\bmy fault\b/i];
  let faultHits = 0;
  for (const p of faultPatterns) { if (p.test(allText)) { faultHits++; } }
  if (faultHits > 0) { deductions += 3; issueCategories++; notes.push("-3: admission of fault in output"); }

  // Formal (-2)
  let formalHits = 0;
  for (const p of OVERLY_FORMAL_PATTERNS) { if (p.test(allText)) { formalHits++; } }
  if (formalHits > 0) { deductions += 2; issueCategories++; notes.push("-2: overly formal"); }

  // Verbose (-2)
  const primaryText = (result.primary_rewrite as string ?? "");
  const sentenceCount = primaryText.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
  if (sentenceCount > 3 || primaryText.length > 400) { deductions += 2; issueCategories++; notes.push("-2: verbose"); }

  // Weak (-2)
  let weakHits = 0;
  for (const p of PASSIVE_WEAK_PATTERNS) { if (p.test(allText)) { weakHits++; } }
  if (weakHits > 0) { deductions += 2; issueCategories++; notes.push("-2: too passive/weak"); }

  // Placeholder (-3)
  if (PLACEHOLDER_PATTERN.test(allText)) { deductions += 3; issueCategories++; notes.push("-3: placeholder brackets"); }

  // Controlling (-2/-1)
  const controllingPatterns = [/\byou need to\b/i, /\byou must\b/i, /\bi expect you to\b/i, /\bplease confirm you understand\b/i, /\bmake sure you\b/i];
  let controlHits = 0;
  for (const p of controllingPatterns) { if (p.test(allText)) { controlHits++; } }
  if (controlHits > 0) { const d = mode === "rewrite" ? 2 : 1; deductions += d; issueCategories++; notes.push(`-${d}: controlling tone`); }

  let serverScore = Math.max(1, 10 - deductions);
  if (emotionalHits > 0 || vagueHits > 0) { serverScore = Math.min(serverScore, 8); }
  if (issueCategories >= 2) { serverScore = Math.min(serverScore, 7); }
  if (issueCategories >= 3) { serverScore = Math.min(serverScore, 6); }

  const aiSelfScore = typeof result.rewrite_quality_score === "number" ? result.rewrite_quality_score : null;
  let total: number;
  if (aiSelfScore !== null && aiSelfScore >= 1 && aiSelfScore <= 10) {
    total = Math.min(serverScore, aiSelfScore);
  } else {
    total = serverScore;
  }

  if (total >= 10 && (issueCategories > 0 || sentenceCount > 2 || primaryText.length > 200)) {
    total = 9;
  }
  total = Math.max(1, Math.min(10, total));

  let status: OutputQualityResult["quality_score_status"];
  if (total >= 9) status = "excellent";
  else if (total >= 7) status = "acceptable";
  else if (total >= 5) status = "weak";
  else status = "reject";

  return { score: total, notes, quality_score_status: status };
}

// ══════════════════════════════════════════════════════════════
// SEMANTIC VALIDATION
// ══════════════════════════════════════════════════════════════

const SHARED_RESPONSIBILITY_PATTERNS = [
  /\bwe need to\b/i, /\bwe should\b/i, /\bwe must\b/i,
  /\blet's\b/i, /\blet us\b/i, /\bwe can\b/i, /\bwe both\b/i,
];

const NEW_COMMITMENT_PATTERNS = [
  /\bi will\b/i, /\bi'll\b/i, /\bi commit\b/i, /\bi promise\b/i,
  /\bi am going to\b/i, /\bi'm going to\b/i,
];

const HOSTILE_FIRMNESS_PATTERNS = [
  /\byou need to understand\b/i, /\bi demand\b/i, /\bi insist\b/i,
  /\byou('re| are) not allowed\b/i, /\bdo as i say\b/i,
  /\bi('m| am) warning you\b/i,
];

interface SemanticIssue { field: string; type: string; detail: string; severity: "hard" | "soft"; }

function validateRewriteSemantics(original: string, result: Record<string, unknown>): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  const origLower = original.toLowerCase();

  const rewriteFields = [
    { key: "primary_rewrite", label: "primary_rewrite" },
    { key: "shorter_version", label: "shorter_version" },
    { key: "firmer_version", label: "firmer_version" },
  ] as const;

  const originalIsRequest = /\b(please|can you|could you|will you|would you|confirm|let me know)\b/i.test(origLower) || /\?/.test(original);
  const originalHasCommitment = /\bi will\b/i.test(origLower) || /\bi'll\b/i.test(origLower);
  const originalHasShared = /\b(we need|we should|we must|let's|let us|we can|we both)\b/i.test(origLower);
  const originalDirectsAtYou = /\b(you need|you should|you must|you have to|you haven't|you didn't|you failed|you were late)\b/i.test(origLower);

  for (const { key, label } of rewriteFields) {
    const text = result[key];
    if (typeof text !== "string" || !text.trim()) continue;

    if (key !== "firmer_version" && originalIsRequest && !originalHasCommitment) {
      for (const p of NEW_COMMITMENT_PATTERNS) {
        if (p.test(text)) {
          const isSafe = /\bi will (follow|adhere to|comply with|be at|confirm|ensure)/i.test(text);
          if (!isSafe) { issues.push({ field: label, type: "perspective_flip", detail: `request→commitment: ${p.source}`, severity: "hard" }); break; }
        }
      }
    }

    if (originalDirectsAtYou && !originalHasShared) {
      for (const p of SHARED_RESPONSIBILITY_PATTERNS) {
        if (p.test(text)) { issues.push({ field: label, type: "shared_responsibility", detail: `directed→shared: ${p.source}`, severity: "hard" }); break; }
      }
    }

    for (const p of PASSIVE_WEAK_PATTERNS) {
      if (p.test(text)) { issues.push({ field: label, type: "over_softening", detail: `passive/weak: ${p.source}`, severity: "soft" }); break; }
    }

    if (key === "firmer_version") {
      for (const p of HOSTILE_FIRMNESS_PATTERNS) {
        if (p.test(text)) { issues.push({ field: label, type: "hostile_firmness", detail: `too aggressive: ${p.source}`, severity: "hard" }); break; }
      }
    }
  }

  return issues;
}

function validateRespondTriageResult(r: Record<string, unknown>): string | null {
  if (typeof r.recommendation_type !== "string" || !VALID_RECOMMENDATION_TYPES.includes(r.recommendation_type)) return "missing/invalid recommendation_type";
  if (typeof r.should_show_intent_picker !== "boolean") return "missing should_show_intent_picker";
  if (typeof r.contains_actionable_logistics !== "boolean") return "missing contains_actionable_logistics";
  if (!isNonEmptyString(r.recommendation_reason)) return "missing recommendation_reason";
  if (!Array.isArray(r.risk_flags)) return "missing risk_flags";
  return null;
}

function validateRespondResult(r: Record<string, unknown>): string | null {
  if (typeof r.recommendation_type !== "string" || !VALID_RECOMMENDATION_TYPES.includes(r.recommendation_type)) return "missing/invalid recommendation_type";
  if (!isNonEmptyString(r.primary_rewrite)) return "missing primary_rewrite";
  if (containsPlaceholder(r.primary_rewrite)) return "primary_rewrite contains placeholder";
  if (r.recommendation_type === "respond" || r.recommendation_type === "brief_boundary_response") {
    if (!isNonEmptyString(r.shorter_version)) return "missing shorter_version";
    if (!isNonEmptyString(r.firmer_version)) return "missing firmer_version";
    for (const field of ["primary_rewrite", "shorter_version", "firmer_version"] as const) {
      const unsafe = containsUnsafeLanguage(r[field]);
      if (unsafe) return `${field} unsafe: ${unsafe}`;
    }
  }
  for (const k of ["tone_assessment", "why_this_is_safer"] as const) {
    if (!isNonEmptyString(r[k])) return `missing ${k}`;
  }
  if (!Array.isArray(r.risk_flags)) return "missing risk_flags";
  if (r.recommendation_type === "respond") {
    if (!Array.isArray(r.three_alternatives) || r.three_alternatives.length !== 3) return "need 3 alternatives";
  }
  return null;
}

function validateRewriteResult(r: Record<string, unknown>): string | null {
  if (!isNonEmptyString(r.primary_rewrite)) return "missing primary_rewrite";
  if (containsPlaceholder(r.primary_rewrite)) return "primary_rewrite contains placeholder";
  for (const field of ["primary_rewrite", "shorter_version", "firmer_version"] as const) {
    const unsafe = containsUnsafeLanguage(r[field]);
    if (unsafe) return `${field} unsafe: ${unsafe}`;
  }
  for (const k of ["shorter_version", "firmer_version", "tone_assessment", "why_this_is_safer"] as const) {
    if (!isNonEmptyString(r[k])) return `missing ${k}`;
  }
  if (!Array.isArray(r.risk_flags)) return "missing risk_flags";
  return null;
}

function validateTriageResult(r: Record<string, unknown>): string | null {
  if (!["safe", "salvageable", "redirect"].includes(r.sendability_status as string)) return "invalid sendability_status";
  if (!["rewrite", "redirect_choice", "no_message"].includes(r.output_path as string)) return "invalid output_path";
  if (!isNonEmptyString(r.sendability_reason)) return "missing sendability_reason";
  if (!isNonEmptyString(r.detected_intent)) return "missing detected_intent";
  if (!isNonEmptyString(r.detected_tone)) return "missing detected_tone";
  if (!Array.isArray(r.risk_flags)) return "missing risk_flags";
  return null;
}

// validateRedirectResult removed — legacy redirect columns dropped

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

function getRetryDelayMs(retryAfter: string | null, attempt: number): number {
  if (!retryAfter) return Math.pow(2, attempt) * 1000 + Math.random() * 500;
  const seconds = Number.parseInt(retryAfter, 10);
  if (!Number.isNaN(seconds) && seconds > 0) return seconds * 1000;
  return Math.pow(2, attempt) * 1000 + Math.random() * 500;
}

function extractServerFlags(notes: string[]): string[] {
  return notes.filter(n => n.startsWith("flag: ")).map(n => n.replace("flag: ", ""));
}

function normalizeRiskFlags(flags: string[] | undefined, serverFlags: string[] = []): string[] {
  const combined = [...(flags && Array.isArray(flags) ? flags : [])];
  for (const sf of serverFlags) { if (!combined.includes(sf)) combined.push(sf); }
  if (combined.length === 0) return ["No risk flags"];
  return combined;
}

// Deterministic fallbacks
const RESPOND_FALLBACK_DEFAULT = "Thank you. I will review this and respond as needed.";
const REWRITE_FALLBACK = "I would like to discuss the logistics. Please let me know the relevant details so we can coordinate.";

const VALID_RESULT_TYPES = new Set([
  "primary",
  "alternative",
  "redirect",
  "respond_output",
  "no_message",
  "do_not_send",
]);

const CHILD_WELFARE_PATTERNS = [
  /\b(child|children|kid|kids|crew|daughter|son|school|homework|doctor|medical|medicine|pickup|drop[-\s]?off|schedule|visitation|custody)\b/i,
  /\b(crying|clinging|distress|meltdown|anxious|upset)\b/i,
];

function normalizeResultType(resultType: string): string {
  const normalized = (resultType ?? "").toLowerCase().trim();
  if (["no_message_needed", "do_not_respond", "do_not_send"].includes(normalized)) {
    return "no_message";
  }
  return VALID_RESULT_TYPES.has(normalized) ? normalized : "primary";
}

function hasChildWelfareSignals(message: string): boolean {
  return CHILD_WELFARE_PATTERNS.some((pattern) => pattern.test(message));
}

function normalizeTriageDecision(
  triageResult: Record<string, unknown>,
  originalMessage: string,
): Record<string, unknown> {
  const sendability = triageResult.sendability_status as string;
  let outputPath = (triageResult.output_path as string) || "rewrite";

  if (sendability !== "redirect" && outputPath === "no_message") {
    outputPath = "rewrite";
  }

  if (
    sendability === "redirect" &&
    outputPath === "no_message" &&
    hasChildWelfareSignals(originalMessage)
  ) {
    outputPath = "redirect_choice";
  }

  return {
    ...triageResult,
    output_path: outputPath,
  };
}

function buildDeterministicFallback(mode: "respond" | "rewrite", _ctx?: string) {
  if (mode === "rewrite") {
    return { mode, is_fallback: true, primary_rewrite: REWRITE_FALLBACK, three_alternatives: [] };
  }
  return { mode, is_fallback: true, recommendation_type: "respond", primary_rewrite: RESPOND_FALLBACK_DEFAULT, primary_response: RESPOND_FALLBACK_DEFAULT, three_alternatives: [] };
}

// ══════════════════════════════════════════════════════════════
// PROMPT LOADING
// ══════════════════════════════════════════════════════════════

interface LoadedPrompt {
  promptText: string;
  versionLabel: string;
  source: "database" | "hardcoded_fallback";
  fallbackReason?: string;
}

function assembleHardcodedPrompt(mode: "respond" | "rewrite", originalContext?: string): string {
  if (mode === "rewrite") return `${REWRITE_INTRO}\n\n${BASE_INSTRUCTIONS}`;
  return `${RESPOND_INTRO(originalContext)}\n\n${BASE_INSTRUCTIONS}\n\n${ALTERNATIVES_INSTRUCTIONS}`;
}

async function loadActivePrompt(
  serviceClient: any,
  featureKey: string,
  mode: "respond" | "rewrite",
  stageKey: string = "generate",
  originalContext?: string,
): Promise<LoadedPrompt> {
  try {
    const { data, error } = await serviceClient
      .from("ai_system_prompts")
      .select("id, prompt_text, version_label, stage_key, output_schema_key")
      .eq("feature_key", featureKey)
      .eq("mode", mode)
      .eq("stage_key", stageKey)
      .eq("is_active", true)
      .eq("is_production", true)
      .limit(1)
      .single();

    if (data?.id) {
      serviceClient.from("ai_system_prompts").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).then(() => {});
    }

    if (error || !data) {
      const reason = error ? `db_error: ${JSON.stringify(error)}` : "no_active_row";
      console.error(`[${FN}] ⚠️ PROMPT_FALLBACK | reason=${reason} | stage=${stageKey}`);
      return { promptText: assembleHardcodedPrompt(mode, originalContext), versionLabel: "hardcoded", source: "hardcoded_fallback", fallbackReason: reason };
    }

    let promptText = data.prompt_text as string;
    if (mode === "respond" && stageKey === "generate") {
      const ctx = originalContext ? ` The original message received was: "${originalContext}"` : "";
      promptText = promptText.replace("{{ORIGINAL_CONTEXT_SENTENCE}}", ctx);
    }

    console.log(`[${FN}] prompt_load | stage=${stageKey} | version=${data.version_label} | len=${promptText.length}`);
    return { promptText, versionLabel: data.version_label as string, source: "database" };
  } catch (err) {
    const reason = `exception: ${String(err)}`;
    console.error(`[${FN}] ⚠️ PROMPT_FALLBACK | reason=${reason} | stage=${stageKey}`);
    return { promptText: assembleHardcodedPrompt(mode, originalContext), versionLabel: "hardcoded", source: "hardcoded_fallback", fallbackReason: reason };
  }
}

// ══════════════════════════════════════════════════════════════
// OPENAI CALL HELPERS
// ══════════════════════════════════════════════════════════════

async function callOpenAI(apiKey: string, model: string, body: Record<string, unknown>): Promise<Response> {
  return fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, model }),
  });
}

async function callOpenAIWithRetry(
  apiKey: string,
  model: string,
  body: Record<string, unknown>,
  maxRetries = 2,
): Promise<Response | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await callOpenAI(apiKey, model, body);
    if (response.status !== 429) return response;
    if (attempt === maxRetries) return response;
    const retryAfter = response.headers.get("Retry-After");
    const waitMs = getRetryDelayMs(retryAfter, attempt);
    console.log(`[${FN}] 429, retry ${attempt + 1}/${maxRetries} after ${Math.round(waitMs)}ms`);
    await response.text();
    await new Promise((r) => setTimeout(r, waitMs));
  }
  return null;
}

async function callToolFunction(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  tool: typeof TRIAGE_TOOL | typeof REWRITE_TOOL | typeof RESPOND_TOOL,
  model: string = MODEL_PRIMARY,
): Promise<Record<string, unknown> | null> {
  const body = {
    model,
    input: [
      { role: "developer", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    tools: [tool],
    tool_choice: "required",
  };

  const response = await callOpenAIWithRetry(apiKey, model, body);
  if (!response || !response.ok) {
    const errText = response ? await response.text().catch(() => "") : "no response";
    console.warn(`[${FN}] callToolFunction failure | tool=${tool.name} | model=${model} | status=${response?.status} | err=${errText.slice(0, 200)}`);
    return null;
  }

  const aiData = await response.json();
  const functionCall = aiData.output?.find((item: any) => item.type === "function_call" && item.name === tool.name);
  if (!functionCall) {
    console.warn(`[${FN}] callToolFunction no function_call | tool=${tool.name}`);
    return null;
  }

  try {
    return JSON.parse(functionCall.arguments);
  } catch (jsonErr) {
    console.warn(`[${FN}] callToolFunction json_parse_error | tool=${tool.name} | ${jsonErr}`);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
// DB PERSISTENCE
// ══════════════════════════════════════════════════════════════

async function createSession(
  serviceClient: any,
  userId: string,
  message: string,
  mode: "respond" | "rewrite",
  triageData?: Record<string, unknown>,
  promptVersions?: Record<string, string>,
): Promise<string> {
  const sessionRow: Record<string, unknown> = {
    user_id: userId,
    mode,
    original_message: message,
    workflow_version: WORKFLOW_VERSION,
  };

  if (triageData) {
    sessionRow.detected_intent = triageData.detected_intent ?? null;
    sessionRow.detected_tone = triageData.detected_tone ?? null;
    sessionRow.sendability_status = triageData.sendability_status ?? null;
    sessionRow.sendability_reason = triageData.sendability_reason ?? null;
    sessionRow.triage_confidence = triageData.triage_confidence ?? null;
    sessionRow.goal_options = triageData.goal_options ?? null;
    sessionRow.output_path = triageData.output_path ?? (triageData.sendability_status === "redirect" ? "redirect_choice" : (triageData.sendability_status === "safe" ? "rewrite" : "rewrite_with_guidance"));
  }

  // prompt versions are no longer stored in sessions (columns dropped)

  const { data, error } = await serviceClient
    .from("communication_shield_sessions")
    .insert(sessionRow)
    .select("id")
    .single();

  if (error || !data) {
    console.error(`[${FN}] session insert error:`, JSON.stringify(error));
    throw new Error(`Failed to persist session: ${error?.message ?? "no data"}`);
  }

  return data.id as string;
}

async function updateSession(
  serviceClient: any,
  sessionId: string,
  fields: Record<string, unknown>,
) {
  const { error } = await serviceClient
    .from("communication_shield_sessions")
    .update(fields)
    .eq("id", sessionId);

  if (error) {
    console.error(`[${FN}] session update error:`, JSON.stringify(error));
  }
}

async function insertResult(
  serviceClient: any,
  sessionId: string,
  resultType: string,
  data: Record<string, unknown>,
  riskFlags: string[],
) {
  // Determine next generation_index with retry + safe fallback using count
  let existingResults: any[] | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await serviceClient
      .from("communication_shield_results")
      .select("id, generation_index")
      .eq("session_id", sessionId)
      .order("generation_index", { ascending: false })
      .limit(1);
    if (!error) {
      existingResults = data;
      break;
    }
    console.warn(`[communication-shield] existing results query attempt ${attempt + 1} failed: ${error.message}`);
    if (attempt < 2) await new Promise((r) => setTimeout(r, 500));
  }

  let nextIndex: number;
  if (existingResults !== null && existingResults.length > 0) {
    nextIndex = existingResults[0].generation_index + 1;
  } else if (existingResults !== null) {
    // Query succeeded, no results exist — this is the first
    nextIndex = 1;
  } else {
    // All retries failed — use count-based fallback to avoid duplicate indexes
    console.warn(`[communication-shield] all retries failed, using count fallback for generation_index`);
    let countFallback = 1;
    try {
      const { count } = await serviceClient
        .from("communication_shield_results")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId);
      countFallback = (count ?? 0) + 1;
    } catch (_) {
      // Last resort: use timestamp-based high index to guarantee uniqueness
      countFallback = Math.floor(Date.now() / 1000) % 100000;
      console.warn(`[communication-shield] count fallback also failed, using timestamp-based index: ${countFallback}`);
    }
    nextIndex = countFallback;
  }

  // Deselect all previous results for this session
  if (nextIndex > 1) {
    const { error: deselectError } = await serviceClient
      .from("communication_shield_results")
      .update({ is_selected: false })
      .eq("session_id", sessionId);

    if (deselectError) {
      throw new Error(`Failed to deselect previous results: ${deselectError.message}`);
    }
  }

  const resultRow: Record<string, unknown> = {
    session_id: sessionId,
    result_type: normalizeResultType(resultType),
    primary_rewrite: data.primary_rewrite ?? null,
    primary_response: data.primary_response ?? data.primary_rewrite ?? null,
    shorter_version: data.shorter_version ?? null,
    firmer_version: data.firmer_version ?? null,
    risk_flags: riskFlags,
    why_this_is_safer: data.why_this_is_safer ?? null,
    generation_index: nextIndex,
    is_selected: true,
  };

  const { error } = await serviceClient
    .from("communication_shield_results")
    .insert(resultRow);

  if (error) {
    console.error(`[${FN}] result insert error:`, JSON.stringify(error));
    throw new Error(`Failed to persist result: ${error.message}`);
  }
}

async function finalizeSessionWithResult(
  serviceClient: any,
  sessionId: string,
  resultType: string,
  resultData: Record<string, unknown>,
  riskFlags: string[],
  sessionFields: Record<string, unknown> = {},
  sessionStatus: "completed" | "no_message_needed" = "completed",
) {
  await insertResult(serviceClient, sessionId, resultType, resultData, riskFlags);
  await updateSession(serviceClient, sessionId, {
    ...sessionFields,
    session_status: sessionStatus,
  });
}

// ══════════════════════════════════════════════════════════════
// RESPOND MODE — 2-STAGE ORCHESTRATION
// ══════════════════════════════════════════════════════════════

const RESPOND_TRIAGE_PROMPT = `You are a custody communication triage specialist.

Analyze the incoming message from the other co-parent and classify it.

CLASSIFICATION RULES:
- "do_not_respond": The message is PURELY insulting, baiting, manipulative, or hostile with ZERO actionable logistics (schedules, pickups, health, school). Examples: "I hate you", "You're pathetic", "You'll regret this". The user should NOT respond.
- "brief_boundary_response": The message is mostly hostile/baiting BUT contains a minor logistical element buried in hostility, OR is a boundary-testing message that warrants a brief neutral acknowledgment. A short boundary-focused reply is appropriate.
- "respond": The message contains actionable logistics or reasonable communication that warrants a full response. Show the intent picker so the user can choose how to respond.

RULES:
- should_show_intent_picker = true ONLY when recommendation_type = "respond"
- contains_actionable_logistics = true if ANY child logistics are present (schedules, pickup, dropoff, health, school, activities)
- actionable_logistics_summary = brief summary of logistics found, or "None" if none
- allow_boundary_override = true for do_not_respond (allows user to override with a brief boundary response)
- risk_flags = list of risks in the original message
- original_score = 1-10 safety score of the incoming message (1 = very dangerous, 10 = safe)
- original_score_notes = list of issues found

For PURELY insulting messages with no logistics: ALWAYS return do_not_respond.
For messages that mix insults with logistics: return brief_boundary_response or respond based on logistics density.

You MUST call the provided tool with your structured output.`;

async function handleRespondTriage(
  serviceClient: any,
  apiKey: string,
  userId: string,
  message: string,
  isAdminBypass: boolean,
): Promise<Response> {
  const originalScoreResult = scoreOriginalMessage(message);
  console.log(`[${FN}] respond_triage | original_score: ${originalScoreResult.score}/10`);

  // Load triage prompt from ai_system_prompts (matches rewrite triage pattern)
  const triagePrompt = await loadActivePrompt(serviceClient, "communication_shield", "respond", "triage");
  console.log(`[${FN}] respond_triage prompt_load | source=${triagePrompt.source} | version=${triagePrompt.versionLabel}${triagePrompt.fallbackReason ? ` | fallback_reason=${triagePrompt.fallbackReason}` : ""}`);

  const triageSystemPrompt = `${triagePrompt.promptText}

You MUST call the provided tool with your structured output.`;

  let triageResult = await callToolFunction(apiKey, triageSystemPrompt, message, RESPOND_TRIAGE_TOOL, MODEL_PRIMARY);
  let triageError = triageResult ? validateRespondTriageResult(triageResult) : "no result";
  if (triageError) {
    console.warn(`[${FN}] respond_triage Tier1: ${triageError}`);
    triageResult = await callToolFunction(apiKey, triageSystemPrompt, message, RESPOND_TRIAGE_TOOL, MODEL_FALLBACK);
    triageError = triageResult ? validateRespondTriageResult(triageResult) : "no result";
    if (triageError) {
      console.warn(`[${FN}] respond_triage Tier2 failed: ${triageError}, defaulting to respond`);
      triageResult = {
        recommendation_type: "respond",
        should_show_intent_picker: true,
        contains_actionable_logistics: true,
        actionable_logistics_summary: "Unable to classify — defaulting to respond",
        recommendation_reason: "Unable to classify the message. Showing response options.",
        allow_boundary_override: false,
        risk_flags: ["Unclassified"],
        original_score: originalScoreResult.score,
        original_score_notes: originalScoreResult.notes,
      };
    }
  }

  // Merge server-side scoring
  const aiOrigScore = typeof triageResult!.original_score === "number" ? triageResult!.original_score : null;
  if (aiOrigScore !== null && aiOrigScore >= 1 && aiOrigScore <= 10) {
    originalScoreResult.score = Math.min(originalScoreResult.score, aiOrigScore);
  }
  const riskFlags = normalizeRiskFlags(triageResult!.risk_flags as string[], extractServerFlags(originalScoreResult.notes));

  // Create session
  const sessionId = await createSession(serviceClient, userId, message, "respond", {
    detected_intent: triageResult!.recommendation_type,
    detected_tone: triageResult!.recommendation_reason,
    sendability_status: triageResult!.recommendation_type === "do_not_respond" ? "redirect" : "safe",
    sendability_reason: triageResult!.recommendation_reason,
    triage_confidence: 1.0,
    risk_flags: riskFlags,
    goal_options: null,
    output_path: triageResult!.recommendation_type,
  }, {});

  await updateSession(serviceClient, sessionId, {
    session_status: triageResult!.recommendation_type === "respond" ? "awaiting_intent_selection" : "triage_complete",
  });

  console.log(`[${FN}] respond_triage done | rec=${triageResult!.recommendation_type} | session=${sessionId} | prompt_source=${triagePrompt.source} | prompt_version=${triagePrompt.versionLabel}`);

  return jsonResponse({
    mode: "respond",
    stage: "triage",
    recommendation_type: triageResult!.recommendation_type,
    should_show_intent_picker: triageResult!.should_show_intent_picker,
    contains_actionable_logistics: triageResult!.contains_actionable_logistics,
    actionable_logistics_summary: triageResult!.actionable_logistics_summary,
    recommendation_reason: triageResult!.recommendation_reason,
    allow_boundary_override: triageResult!.allow_boundary_override,
    risk_flags: riskFlags,
    original_score: originalScoreResult.score,
    original_score_notes: originalScoreResult.notes,
    session_id: sessionId,
    prompt_version: triagePrompt.versionLabel,
    prompt_source: triagePrompt.source,
  });
}

async function handleRespondGenerate(
  serviceClient: any,
  apiKey: string,
  userId: string,
  message: string,
  sessionId: string,
  communicationContext: string | undefined,
  boundaryOverride: boolean,
  isAdminBypass: boolean,
  isRegeneration: boolean = false,
  regenIsFree: boolean = false,
): Promise<Response> {
  const originalScoreResult = scoreOriginalMessage(message);

  // Load existing session triage data
  const { data: existingSession } = await serviceClient
    .from("communication_shield_sessions")
    .select("output_path, sendability_reason")
    .eq("id", sessionId)
    .single();

  const recommendationType = existingSession?.output_path as string || "respond";

  // For do_not_respond without boundary override — return explanation only
  if (recommendationType === "do_not_respond" && !boundaryOverride) {
    const riskFlags = normalizeRiskFlags([], extractServerFlags(originalScoreResult.notes));
    await finalizeSessionWithResult(serviceClient, sessionId, "no_message", {
      primary_response: existingSession?.sendability_reason ?? "This message does not require a response.",
      why_this_is_safer: "Not responding to hostile or baiting messages protects your legal position and reduces conflict.",
    }, riskFlags, {}, "no_message_needed");
    if (!isAdminBypass) await serviceClient.rpc("increment_message_rewrites", { p_user_id: userId });
    return jsonResponse({
      mode: "respond",
      stage: "generate",
      recommendation_type: "do_not_respond",
      _doNotRespond: true,
      why_this_is_safer: "Not responding to hostile or baiting messages protects your legal position and reduces conflict.",
      session_id: sessionId,
    });
  }

  // Determine effective recommendation type (boundary override → brief_boundary_response)
  const effectiveType = boundaryOverride ? "brief_boundary_response" : recommendationType;

  const loadedPrompt = await loadActivePrompt(serviceClient, "communication_shield", "respond", "generate", message);
  console.log(`[${FN}] respond_generate prompt_load | source=${loadedPrompt.source} | version=${loadedPrompt.versionLabel}${loadedPrompt.fallbackReason ? ` | fallback_reason=${loadedPrompt.fallbackReason}` : ""}`);

  const contextInstruction = communicationContext
    ? `\nThe user selected the following communication context: "${communicationContext}". Tailor the response to match this intent while remaining neutral, factual, and court-safe.`
    : "";

  const typeInstruction = effectiveType === "brief_boundary_response"
    ? "\nIMPORTANT: Generate a brief boundary-setting response only. Keep it to 1-2 sentences. No need for multiple alternatives."
    : "";

  const systemPrompt = `You are a custody communication specialist trained in court-admissible co-parent messaging.

${loadedPrompt.promptText}
${contextInstruction}
${typeInstruction}

You MUST call the provided tool with your structured output.`;

  // Try primary model
  let aiResult = await callToolFunction(apiKey, systemPrompt, message, RESPOND_TOOL, MODEL_PRIMARY);
  let validationError = aiResult ? validateRespondResult(aiResult) : "no result";
  if (validationError) {
    console.warn(`[${FN}] respond_generate Tier1 validation: ${validationError}`);
    aiResult = null;
  }

  // Try fallback model
  if (!aiResult) {
    console.log(`[${FN}] respond_generate Tier2 fallback`);
    aiResult = await callToolFunction(apiKey, systemPrompt, message, RESPOND_TOOL, MODEL_FALLBACK);
    validationError = aiResult ? validateRespondResult(aiResult) : "no result";
    if (validationError) {
      console.warn(`[${FN}] respond_generate Tier2 validation: ${validationError}`);
      aiResult = null;
    }
  }

  // Deterministic fallback
  if (!aiResult) {
    const fallback = buildDeterministicFallback("respond", communicationContext);
    await finalizeSessionWithResult(serviceClient, sessionId, "respond_output", fallback as any, ["No risk flags"]);
    if (!isAdminBypass) await serviceClient.rpc("increment_message_rewrites", { p_user_id: userId });
    return jsonResponse({ ...fallback, session_id: sessionId, stage: "generate" });
  }

  const outputScore = scoreOutputQuality(aiResult, "respond");
  const riskFlags = normalizeRiskFlags(aiResult.risk_flags as string[], extractServerFlags(originalScoreResult.notes));

  // Persist
  await finalizeSessionWithResult(serviceClient, sessionId, "respond_output", aiResult, riskFlags, {
    selected_goal: communicationContext ?? (boundaryOverride ? "boundary_override" : null),
  });

  // Usage tracking
  if (!isAdminBypass) {
    if (isRegeneration && regenIsFree) {
      const { data: curSess } = await serviceClient
        .from("communication_shield_sessions")
        .select("free_regenerations_used")
        .eq("id", sessionId)
        .single();
      await updateSession(serviceClient, sessionId, {
        free_regenerations_used: (curSess?.free_regenerations_used ?? 0) + 1,
      });
    } else if (isRegeneration && !regenIsFree) {
      await serviceClient.rpc("increment_message_rewrites", { p_user_id: userId });
    } else {
      await serviceClient.rpc("increment_message_rewrites", { p_user_id: userId });
    }
  }

  // Get final free_regenerations_used
  const { data: finalSession } = await serviceClient
    .from("communication_shield_sessions")
    .select("free_regenerations_used")
    .eq("id", sessionId)
    .single();

  console.log(`[${FN}] respond_generate success | session=${sessionId} | type=${effectiveType} | quality=${outputScore.score}`);

  return jsonResponse({
    ...aiResult,
    mode: "respond",
    stage: "generate",
    recommendation_type: effectiveType,
    risk_flags: riskFlags,
    original_score: originalScoreResult.score,
    primary_response: aiResult.primary_rewrite,
    three_alternatives: Array.isArray(aiResult.three_alternatives) ? aiResult.three_alternatives : [],
    prompt_version: loadedPrompt.versionLabel,
    prompt_source: loadedPrompt.source,
    response_quality_score: outputScore.score,
    session_id: sessionId,
    free_regenerations_used: finalSession?.free_regenerations_used ?? 0,
  });
}

// ══════════════════════════════════════════════════════════════
// REWRITE MODE — STAGED ORCHESTRATION
// ══════════════════════════════════════════════════════════════

async function handleRewriteMode(
  serviceClient: any,
  apiKey: string,
  userId: string,
  message: string,
  selectedGoal: string | undefined,
  sessionId: string | undefined,
  isAdminBypass: boolean,
  isRegeneration: boolean = false,
  regenIsFree: boolean = false,
): Promise<Response> {
  const originalScoreResult = scoreOriginalMessage(message);
  console.log(`[${FN}] rewrite original_score: ${originalScoreResult.score}/10`);

  const promptVersions: Record<string, string> = {};

  // ── STEP 1: TRIAGE ──
  // If we already have a session_id, this is a continuation (goal selected), skip triage
  let triageResult: Record<string, unknown> | null = null;
  let existingSessionId = sessionId;

  if (!existingSessionId) {
    const triagePrompt = await loadActivePrompt(serviceClient, "communication_shield", "rewrite", "triage");
    promptVersions.triage = triagePrompt.versionLabel;

    const triageSystemPrompt = `You are a custody communication triage classifier.

${triagePrompt.promptText}

You MUST call the provided tool with your structured output.`;

    triageResult = await callToolFunction(apiKey, triageSystemPrompt, message, TRIAGE_TOOL, MODEL_PRIMARY);

    // Validate triage
    const triageError = triageResult ? validateTriageResult(triageResult) : "no triage result";
    if (triageError) {
      console.warn(`[${FN}] triage validation error: ${triageError}, trying fallback`);
      triageResult = await callToolFunction(apiKey, triageSystemPrompt, message, TRIAGE_TOOL, MODEL_FALLBACK);
      const retryError = triageResult ? validateTriageResult(triageResult) : "no triage result";
      if (retryError) {
        console.warn(`[${FN}] triage fallback also failed: ${retryError}, defaulting to salvageable`);
        triageResult = {
          sendability_status: "salvageable",
          output_path: "rewrite",
          sendability_reason: "Unable to classify — treating as salvageable for safety",
          detected_intent: "unknown",
          detected_tone: "unknown",
          risk_flags: ["Vague or imprecise language"],
          triage_confidence: 0.3,
          goal_options: ["Make it neutral and court-safe", "Keep it brief"],
        };
      }
    }

    triageResult = normalizeTriageDecision(triageResult!, message);

    console.log(`[${FN}] triage result | status=${triageResult!.sendability_status} | intent=${triageResult!.detected_intent} | confidence=${triageResult!.triage_confidence}`);

    // Create session with triage data
    existingSessionId = await createSession(serviceClient, userId, message, "rewrite", triageResult!, promptVersions);
    // Set initial status based on triage outcome
    const initialStatus = (triageResult!.sendability_status === "safe") ? "processing" : "awaiting_goal_selection";
    await updateSession(serviceClient, existingSessionId, { session_status: initialStatus });
  } else {
    // Load existing session to get triage data
    const { data: existingSession } = await serviceClient
      .from("communication_shield_sessions")
      .select("sendability_status, detected_intent, detected_tone, sendability_reason, triage_confidence, goal_options, output_path")
      .eq("id", existingSessionId)
      .single();

    if (existingSession) {
      triageResult = {
        sendability_status: existingSession.sendability_status,
        detected_intent: existingSession.detected_intent,
        detected_tone: existingSession.detected_tone,
        sendability_reason: existingSession.sendability_reason,
        triage_confidence: existingSession.triage_confidence,
        risk_flags: [],
        goal_options: existingSession.goal_options,
        output_path: existingSession.output_path,
      };
    } else {
      triageResult = { sendability_status: "salvageable", detected_intent: "unknown", detected_tone: "unknown", sendability_reason: "Session not found", risk_flags: [], triage_confidence: 0, goal_options: [] };
    }
  }

  const sendabilityStatus = triageResult!.sendability_status as string;
  const triageOutputPath = (triageResult!.output_path as string) || (sendabilityStatus === "redirect" ? "redirect_choice" : "rewrite");
  const outputPath = sendabilityStatus === "redirect" ? triageOutputPath : "rewrite";

  // ── STEP 2: BRANCH ──

  // 2A-i: NO_MESSAGE — terminal state, no goal selection needed
  if (sendabilityStatus === "redirect" && triageOutputPath === "no_message" && !selectedGoal) {
    const riskFlags = normalizeRiskFlags(triageResult!.risk_flags as string[], extractServerFlags(originalScoreResult.notes));
    await finalizeSessionWithResult(
      serviceClient,
      existingSessionId!,
      "no_message",
      {
        primary_response: triageResult!.sendability_reason ?? "This message does not require a response.",
        why_this_is_safer: "Limiting unnecessary communication can help reduce conflict and protect your position.",
      },
      riskFlags,
      {
        output_path: "no_message",
        selected_goal: "No message needed",
      },
      "no_message_needed",
    );
    if (!isAdminBypass) await serviceClient.rpc("increment_message_rewrites", { p_user_id: userId });

    console.log(`[${FN}] no_message — terminal | session=${existingSessionId}`);
    return jsonResponse({
      mode: "rewrite",
      sendability_status: "redirect",
      output_path: "no_message",
      detected_intent: triageResult!.detected_intent,
      detected_tone: triageResult!.detected_tone,
      sendability_reason: triageResult!.sendability_reason,
      risk_flags: riskFlags,
      needs_goal_selection: false,
      _noMessageNeeded: true,
      original_score: originalScoreResult.score,
      session_id: existingSessionId,
    });
  }

  // 2A-ii: REDIRECT_CHOICE — decision state, needs goal selection
  if (sendabilityStatus === "redirect" && triageOutputPath !== "no_message" && !selectedGoal) {
    const riskFlags = normalizeRiskFlags(triageResult!.risk_flags as string[], extractServerFlags(originalScoreResult.notes));
    await updateSession(serviceClient, existingSessionId!, {
      output_path: "redirect_choice",
    });

    console.log(`[${FN}] redirect_choice — needs goal selection | session=${existingSessionId}`);
    return jsonResponse({
      mode: "rewrite",
      sendability_status: "redirect",
      output_path: "redirect_choice",
      detected_intent: triageResult!.detected_intent,
      detected_tone: triageResult!.detected_tone,
      sendability_reason: triageResult!.sendability_reason,
      risk_flags: riskFlags,
      needs_goal_selection: true,
      goal_options: [
        "Refocus on logistics",
        "Set a neutral boundary",
        "No message needed",
      ],
      original_score: originalScoreResult.score,
      session_id: existingSessionId,
    });
  }

  // 2A (cont): REDIRECT with goal selected — save goal, then fall through to generate
  if (sendabilityStatus === "redirect" && selectedGoal) {
    await updateSession(serviceClient, existingSessionId!, {
      selected_goal: selectedGoal,
    });
  }

  // 2B: SALVAGEABLE — needs goal selection
  if (sendabilityStatus === "salvageable" && !selectedGoal) {
    const riskFlags = normalizeRiskFlags(triageResult!.risk_flags as string[], extractServerFlags(originalScoreResult.notes));
    // Session already created with triage data

    console.log(`[${FN}] salvageable — needs goal selection | session=${existingSessionId}`);
    return jsonResponse({
      mode: "rewrite",
      sendability_status: "salvageable",
      output_path: "rewrite_with_guidance",
      detected_intent: triageResult!.detected_intent,
      detected_tone: triageResult!.detected_tone,
      sendability_reason: triageResult!.sendability_reason,
      risk_flags: riskFlags,
      needs_goal_selection: true,
      goal_options: triageResult!.goal_options ?? ["Make it neutral and court-safe", "Keep it brief"],
      original_score: originalScoreResult.score,
      session_id: existingSessionId,
    });
  }

  // 2B (cont): SALVAGEABLE with goal selected — save goal
  if (sendabilityStatus === "salvageable" && selectedGoal) {
    await updateSession(serviceClient, existingSessionId!, {
      selected_goal: selectedGoal,
    });
  }

  // 2C: SAFE or SALVAGEABLE with goal — GENERATE REWRITE
  const generatePrompt = await loadActivePrompt(serviceClient, "communication_shield", "rewrite", "generate");
  promptVersions.rewrite = generatePrompt.versionLabel;

  const goalInstruction = selectedGoal
    ? `\nThe user's communication goal is: "${selectedGoal}". Tailor the rewrite to achieve this goal while remaining neutral, factual, and court-safe.`
    : "";

  const triageContext = triageResult ? `\nTriage classification: ${sendabilityStatus}. Detected intent: ${triageResult.detected_intent}. Detected tone: ${triageResult.detected_tone}.` : "";

  const generateSystemPrompt = `You are a custody communication specialist trained in court-admissible co-parent messaging.

${generatePrompt.promptText}
${goalInstruction}
${triageContext}

You MUST call the provided tool with your structured output.`;

  // Try primary
  let aiResult = await callToolFunction(apiKey, generateSystemPrompt, message, REWRITE_TOOL, MODEL_PRIMARY);
  let rewriteValidation = aiResult ? validateRewriteResult(aiResult) : "no result";
  let rewriteScore: OutputQualityResult | null = null;
  let semanticOk = true;

  if (!rewriteValidation && aiResult) {
    rewriteScore = scoreOutputQuality(aiResult, "rewrite");
    const semanticIssues = validateRewriteSemantics(message, aiResult);
    const hardIssues = semanticIssues.filter(i => i.severity === "hard");
    if (hardIssues.length > 0) { semanticOk = false; }
    const softIssues = semanticIssues.filter(i => i.severity === "soft");
    if (softIssues.length > 0 && rewriteScore.score !== null) {
      rewriteScore.score = Math.max(1, rewriteScore.score - softIssues.length);
      rewriteScore.notes.push(...softIssues.map(i => `semantic_warn: ${i.type}`));
      rewriteScore.quality_score_status = rewriteScore.score >= 9 ? "excellent" : rewriteScore.score >= 7 ? "acceptable" : rewriteScore.score >= 5 ? "weak" : "reject";
    }
    if (!semanticOk || rewriteScore.quality_score_status === "reject" || rewriteScore.quality_score_status === "weak") {
      console.log(`[${FN}] rewrite Tier1 issue, retrying stricter`);
      const retryPrompt = generateSystemPrompt + (semanticOk ? STRICTER_RETRY_ADDENDUM : SEMANTIC_RETRY_ADDENDUM);
      const retryResult = await callToolFunction(apiKey, retryPrompt, message, REWRITE_TOOL, MODEL_PRIMARY);
      if (retryResult && !validateRewriteResult(retryResult)) {
        const s2 = scoreOutputQuality(retryResult, "rewrite");
        const retryIssues = validateRewriteSemantics(message, retryResult);
        const retryHardIssues = retryIssues.filter(i => i.severity === "hard");
        if (retryHardIssues.length === 0 && (s2.quality_score_status === "excellent" || s2.quality_score_status === "acceptable")) {
          aiResult = retryResult;
          rewriteScore = s2;
          semanticOk = true;
        }
      }
    }
  } else {
    console.warn(`[${FN}] rewrite Tier1 validation: ${rewriteValidation}`);
  }

  // Try fallback model
  if (!aiResult || rewriteValidation || !semanticOk) {
    console.log(`[${FN}] rewrite Tier2 fallback model`);
    const tier2Prompt = generateSystemPrompt + SEMANTIC_RETRY_ADDENDUM;
    const tier2Result = await callToolFunction(apiKey, tier2Prompt, message, REWRITE_TOOL, MODEL_FALLBACK);
    if (tier2Result && !validateRewriteResult(tier2Result)) {
      const s = scoreOutputQuality(tier2Result, "rewrite");
      const tier2Issues = validateRewriteSemantics(message, tier2Result);
      const tier2HardIssues = tier2Issues.filter(i => i.severity === "hard");
      if (tier2HardIssues.length === 0 && s.quality_score_status !== "reject") {
        aiResult = tier2Result;
        rewriteScore = s;
      }
    }
  }

  // Tier 3: Error
  if (!aiResult) {
    console.log(`[${FN}] rewrite all tiers failed`);
    return jsonResponse({ error: "Unable to generate rewrite. Please try again." }, 503);
  }

  // Merge AI original score
  const aiOrigScore = typeof aiResult.original_score === "number" ? aiResult.original_score : null;
  if (aiOrigScore !== null && aiOrigScore >= 1 && aiOrigScore <= 10) {
    originalScoreResult.score = Math.min(originalScoreResult.score, aiOrigScore);
  }

  const riskFlags = normalizeRiskFlags(aiResult.risk_flags as string[], extractServerFlags(originalScoreResult.notes));

  // Persist
  await finalizeSessionWithResult(
    serviceClient,
    existingSessionId!,
    "primary",
    aiResult,
    riskFlags,
    {
      output_path: outputPath,
      selected_goal: selectedGoal ?? null,
    },
    "completed",
  );
  // Usage tracking
  if (!isAdminBypass) {
    if (isRegeneration && regenIsFree) {
      // Free regen — no usage charge, just bump session counter
      const { data: curSess } = await serviceClient
        .from("communication_shield_sessions")
        .select("free_regenerations_used")
        .eq("id", existingSessionId)
        .single();
      await updateSession(serviceClient, existingSessionId!, {
        free_regenerations_used: (curSess?.free_regenerations_used ?? 0) + 1,
      });
    } else if (isRegeneration && !regenIsFree) {
      // Paid regen — charge usage (free counter already maxed)
      await serviceClient.rpc("increment_message_rewrites", { p_user_id: userId });
    } else {
      // Initial generation — charge usage
      await serviceClient.rpc("increment_message_rewrites", { p_user_id: userId });
    }
  }

  // Score asynchronously (non-blocking)
  runScoreStage(serviceClient, apiKey, existingSessionId!, message, aiResult, originalScoreResult, promptVersions).catch(e => console.error(`[${FN}] score stage error:`, e));

  console.log(`[${FN}] rewrite success | session=${existingSessionId} | status=${sendabilityStatus} | quality=${rewriteScore?.score}`);

  // Get current free_regenerations_used for the response
  const { data: finalSession } = await serviceClient
    .from("communication_shield_sessions")
    .select("free_regenerations_used")
    .eq("id", existingSessionId)
    .single();

  return jsonResponse({
    mode: "rewrite",
    sendability_status: sendabilityStatus,
    output_path: outputPath,
    detected_intent: triageResult!.detected_intent,
    detected_tone: triageResult!.detected_tone,
    risk_flags: riskFlags,
    selected_goal: selectedGoal ?? null,
    primary_rewrite: aiResult.primary_rewrite,
    shorter_version: aiResult.shorter_version,
    firmer_version: aiResult.firmer_version,
    why_this_is_safer: aiResult.why_this_is_safer,
    tone_assessment: aiResult.tone_assessment,
    original_score: originalScoreResult.score,
    rewrite_quality_score: rewriteScore?.score ?? null,
    prompt_version: promptVersions.rewrite,
    session_id: existingSessionId,
    free_regenerations_used: finalSession?.free_regenerations_used ?? 0,
  });
}

// ══════════════════════════════════════════════════════════════
// SCORE STAGE (async, non-blocking)
// ══════════════════════════════════════════════════════════════

async function runScoreStage(
  serviceClient: any,
  apiKey: string,
  sessionId: string,
  originalMessage: string,
  outputResult: Record<string, unknown>,
  originalScore: { score: number; notes: string[] },
  promptVersions: Record<string, string>,
) {
  try {
    const scorePrompt = await loadActivePrompt(serviceClient, "communication_shield", "rewrite", "score");
    promptVersions.score = scorePrompt.versionLabel;

    // The score stage evaluates the output — we log it but don't block on it
    console.log(`[${FN}] score stage | session=${sessionId} | prompt=${scorePrompt.versionLabel}`);
    // Score stage logging only — no DB columns to update
  } catch (err) {
    console.error(`[${FN}] score stage error (non-blocking):`, err);
  }
}

// ══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let userId: string | null = null;

  try {
    const auth = await authenticateRequest(req, FN).catch((res) => res as Response);
    if (auth instanceof Response) return auth;
    userId = auth.userId;

    if (!checkRateLimit(`${userId}:${FN}`, RATE_LIMIT, RATE_WINDOW_MS)) {
      logRequest({ userId, functionName: FN, status: "rate_limited" });
      return jsonResponse({ error: "Rate limit exceeded. Please wait a moment before trying again." }, 429);
    }

    const body = await req.json();
    const {
      message,
      mode,
      original_context,
      communication_context,
      skip_quota,
      selected_goal,
      session_id,
      _no_message_terminal,
      triage_risk_flags,
      triage_sendability_reason,
      is_regeneration: clientIsRegeneration,
      respond_stage,
      boundary_override,
    } = body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      logRequest({ userId, functionName: FN, status: "invalid_input", detail: "bad message" });
      return jsonResponse({ error: "Invalid message" }, 400);
    }
    if (message.length > 10000) {
      logRequest({ userId, functionName: FN, status: "invalid_input", detail: `msg too long: ${message.length}` });
      return jsonResponse({ error: `Message too long (${message.length}/10000 characters)` }, 400);
    }
    console.log(`[${FN}] request_start | user=${userId} | mode=${mode} | msg_len=${message.length}`);

    if (mode !== "respond" && mode !== "rewrite") {
      logRequest({ userId, functionName: FN, status: "invalid_input", detail: "bad mode" });
      return jsonResponse({ error: "Invalid mode" }, 400);
    }
    if (communication_context && (typeof communication_context !== "string" || communication_context.length > 500)) {
      return jsonResponse({ error: "Context too long" }, 400);
    }
    if (original_context && (typeof original_context !== "string" || original_context.length > 4000)) {
      return jsonResponse({ error: "Original context too long" }, 400);
    }

    // Admin quota bypass
    const { serviceClient } = auth;
    let isAdminBypass = false;
    if (skip_quota === true) {
      const { data: profileRow } = await serviceClient.from("profiles").select("role").eq("user_id", userId).single();
      isAdminBypass = profileRow?.role === "admin";
      if (isAdminBypass) console.log(`[${FN}] admin_quota_bypass`);
    }

    // Quota check
    // For respond triage: no usage charged (triage only)
    // For new sessions (no session_id): always check + will charge 1
    // For regenerations (has session_id): check if this regen is free or paid
    const isRespondTriage = mode === "respond" && respond_stage !== "generate" && !session_id;
    const isRegeneration = !!session_id && !_no_message_terminal && (clientIsRegeneration === true || (!selected_goal && respond_stage !== "generate"));
    let regenIsFree = false;

    if (!isAdminBypass && !isRespondTriage) {
      if (isRegeneration) {
        // Look up how many free regens have been used for this session
        const { data: sessionRow } = await serviceClient
          .from("communication_shield_sessions")
          .select("free_regenerations_used")
          .eq("id", session_id)
          .single();
        const freeUsed = sessionRow?.free_regenerations_used ?? 0;
        const FREE_REGEN_LIMIT = 2;
        if (freeUsed < FREE_REGEN_LIMIT) {
          regenIsFree = true;
          console.log(`[${FN}] regen free | session=${session_id} | free_used=${freeUsed}/${FREE_REGEN_LIMIT}`);
        } else {
          // Paid regen — check quota
          const { data: quotaRows, error: quotaError } = await serviceClient.rpc("check_message_rewrite_quota", { p_user_id: userId });
          if (quotaError || !quotaRows || quotaRows.length === 0) {
            console.error("Quota check failed:", quotaError);
            return jsonResponse({ error: "Could not verify quota" }, 500);
          }
          if (!quotaRows[0].allowed) {
            return jsonResponse({ error: "You've used all your message rewrites.", quota_exhausted: true }, 429);
          }
          console.log(`[${FN}] regen paid | session=${session_id} | free_used=${freeUsed} | used=${quotaRows[0].used}/${quotaRows[0].limit}`);
        }
      } else if (!session_id) {
        // New session — normal quota check
        const { data: quotaRows, error: quotaError } = await serviceClient.rpc("check_message_rewrite_quota", { p_user_id: userId });
        if (quotaError || !quotaRows || quotaRows.length === 0) {
          console.error("Quota check failed:", quotaError);
          return jsonResponse({ error: "Could not verify quota" }, 500);
        }
        console.log(`[${FN}] quota_check | used=${quotaRows[0].used}/${quotaRows[0].limit} | allowed=${quotaRows[0].allowed}`);
        if (!quotaRows[0].allowed) {
          return jsonResponse({ error: "You've used all your message rewrites.", quota_exhausted: true }, 429);
        }
      }
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    if (mode === "respond") {
      // Stage 1: Triage (no session_id, no respond_stage=generate)
      if (!session_id && respond_stage !== "generate") {
        const result = await handleRespondTriage(serviceClient, OPENAI_API_KEY, userId, message, isAdminBypass);
        logRequest({ userId, functionName: FN, status: "success", estimatedUsage: 0 });
        return result;
      }

      // Stage 2: Generate (has session_id)
      if (session_id) {
        const result = await handleRespondGenerate(
          serviceClient, OPENAI_API_KEY, userId, message, session_id,
          communication_context, !!boundary_override, isAdminBypass,
          isRegeneration, regenIsFree,
        );
        logRequest({ userId, functionName: FN, status: "success", estimatedUsage: 1 });
        return result;
      }

      // Fallback: shouldn't reach here
      return jsonResponse({ error: "Invalid respond request — missing session_id for generate stage" }, 400);
    }

    // Handle "No message needed" terminal from redirect_choice
    if (_no_message_terminal && session_id && mode === "rewrite") {
      const { serviceClient: sc } = auth;
      const scoreSnapshot = scoreOriginalMessage(message);
      const terminalRiskFlags = normalizeRiskFlags(
        Array.isArray(triage_risk_flags) ? triage_risk_flags as string[] : [],
        extractServerFlags(scoreSnapshot.notes),
      );

      await finalizeSessionWithResult(
        sc,
        session_id,
        "no_message",
        {
          primary_response: typeof triage_sendability_reason === "string" && triage_sendability_reason.trim()
            ? triage_sendability_reason.trim()
            : "No message recommended.",
          why_this_is_safer: "Limiting unnecessary communication can help reduce conflict and protect your position.",
        },
        terminalRiskFlags,
        {
          selected_goal: "No message needed",
          output_path: "no_message",
        },
        "no_message_needed",
      );
      if (!isAdminBypass) await sc.rpc("increment_message_rewrites", { p_user_id: userId });
      logRequest({ userId, functionName: FN, status: "success", estimatedUsage: 1 });
      return jsonResponse({ mode: "rewrite", output_path: "no_message", _noMessageNeeded: true, session_id });
    }

    // REWRITE MODE — staged orchestration
    const result = await handleRewriteMode(serviceClient, OPENAI_API_KEY, userId, message, selected_goal, session_id, isAdminBypass, isRegeneration, regenIsFree);
    logRequest({ userId, functionName: FN, status: "success", estimatedUsage: 1 });
    return result;

  } catch (e) {
    console.error(`[${FN}] unhandled_error | user=${userId} | error=${String(e)}`);
    logRequest({ userId, functionName: FN, status: "error", detail: String(e) });
    return jsonResponse({ error: "An error occurred processing your request." }, 500);
  }
});
