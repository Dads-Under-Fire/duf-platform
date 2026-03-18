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

// ── Prompts (server-side only) ──
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
- Redirect to neutral, forward-looking language
- Reference agreed schedules, plans, or policies when possible
- Keep the response minimal, controlled, and non-emotional
- Preferred safe patterns:
  • "I will follow the agreed schedule moving forward."
  • "I do not agree with that characterization. I will follow the agreed schedule moving forward."
  • "Please refer to the agreed parenting plan. I will continue to follow it moving forward."

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

const SCORING_INSTRUCTIONS = `STRICT SELF-SCORING — You MUST score your own output honestly using "self_score" (integer 1-10).
Legal safety takes priority over politeness. Do NOT inflate scores.

Start at 10 and subtract points based on these rules:
- -2 if emotional language remains (sorry, upset, frustrated, disappointed, hurt, angry, etc.)
- -2 if vague phrasing exists (maybe, kind of, trying to, sort of, hopefully, etc.)
- -1 to -2 if intent is indirect or unclear (reader wouldn't know what action to take)
- -2 if defensive tone or justification appears (explaining past actions, giving reasons)
- -3 if accusatory language remains (you always, you never, your fault, you caused)
- -3 if admission of fault exists (I forgot, I should have, I failed, I'm sorry, I apologize)
- -1 if unnecessarily verbose (could be said in fewer words without losing meaning)

Scoring guidelines:
- 10 = perfect — fully neutral, clear, precise, no emotional language, no risk
- 9 = very strong — minimal improvement needed
- 7-8 = acceptable but has minor issues
- 5-6 = risky, should be rewritten
- below 5 = high risk

HARD RULES:
- If ANY emotional or vague language exists, score MUST NOT exceed 8
- If MULTIPLE issues exist (2+ categories triggered), score should be 6-7 range
- Only give 10 if message is fully neutral, clear, precise, and natural
- A perfect 10 should be RARE — most outputs score 7-9

Also provide "self_score_deductions" — an array of strings describing each deduction you applied (e.g. "−2: emotional language - sorry"). If no deductions, use ["none"].

RISK FLAGS RULES:
- risk_flags MUST list every issue found in the original message (e.g. "Removed accusatory language", "De-escalated hostile tone", "Removed emotional bait")
- If the original input is already perfectly neutral with no issues, set risk_flags to ["No risk flags"]
- NEVER return an empty array for risk_flags`;

const BASE_INSTRUCTIONS = `All responses must:
- Be SHORT, DIRECT, and CONCISE — prefer 1-3 sentences maximum
- Be neutral and factual
- Avoid accusations, emotional language, sarcasm, and defensiveness
- Focus on child logistics: schedules, health, school, or transportation
- Ignore inflammatory language from the other parent
- De-escalate conflict
- Sound appropriate for review by a judge or custody evaluator
- Reference the parenting plan or custody agreement when relevant
- Acknowledge ONLY what is necessary — do not over-explain

NEVER use open-ended phrasing such as:
- "so we can discuss"
- "let me know your thoughts"
- "we can talk about this further"
- "I'd like to discuss"
- "perhaps we could"

Instead prefer responses that:
- Confirm logistics with finality
- State facts without inviting debate
- Set clear boundaries without aggression
- Close the conversation loop rather than opening it

${LEGAL_SAFETY_RULES}

${QUALITY_RULES}

${SCORING_INSTRUCTIONS}`;

const RESPOND_INTRO = (originalContext?: string) =>
  `The user received a message from the other parent.${originalContext ? ` The original message received was: "${originalContext}"` : ""}

IMPORTANT — RECOMMENDATION LAYER:
Before drafting a response, FIRST evaluate whether responding is actually the safest choice. This evaluation must be based on communication strategy and legal positioning — NOT on system availability or technical issues.

Analyze the incoming message carefully. Set "recommendation_type" to one of:

- "respond" — The message contains ANY actionable logistics, scheduling, custody coordination, pickup/drop-off times, agreements, arrangements, or threats related to arrangements (e.g. keeping a child longer, changing plans unilaterally). Even if the tone is hostile, insulting, or emotionally charged — if there is ANY logistical or custody-relevant content, you MUST respond to the actionable portion and ignore the emotional bait. Provide full response variants (primary_response, shorter_version, firmer_version).

- "do_not_respond" — The safest action is NOT to reply. Choose this ONLY when the incoming message:
  • Is PURELY insulting, baiting, or emotionally provocative with ZERO logistical content
  • Contains ONLY character attacks, mockery, or emotional venting
  • Has absolutely NO actionable co-parenting issue, schedule reference, or custody matter
  • Would likely escalate conflict if engaged with
  • Is designed solely to provoke a reaction rather than coordinate parenting
  Examples that qualify for do_not_respond: "You're a terrible father." / "No one wants you around." / "You disgust me."
  IMPORTANT: Do NOT select do_not_respond if the message mentions ANY of: times, dates, pickup, drop-off, schedule, custody, keeping the child, arrangements, school, health, or agreements — even buried in hostility.
  When choosing do_not_respond:
  • Set "primary_response" to a clear 1-2 sentence explanation of WHY no response is recommended, from a communication/legal strategy perspective. Example: "This message contains no logistical content and is designed to provoke a reaction. Responding would create unnecessary conflict in the record."
  • Set "shorter_version" and "firmer_version" to empty strings ""
  • Optionally set "fallback_response" to a very short neutral message ONLY if the user feels they absolutely must reply (e.g. "Received.")

- "brief_boundary_response" — A very short neutral boundary statement is appropriate, but engaging further is not. The message may contain a minor logistical element buried in hostility. Provide a minimal response in "primary_response" (1 sentence max). "shorter_version" can match. "firmer_version" should set a firmer boundary.

CRITICAL DECISION RULES:
- Never recommend "do_not_respond" for technical or system reasons.
- Never recommend "do_not_respond" when there is ANY logistical, scheduling, or custody-relevant content in the message — regardless of hostile tone.
- When the message is hostile BUT contains logistics: select "respond", address ONLY the logistics, completely ignore insults and emotional content.
- When the message contains accusations or legal traps: select "respond" but do NOT explain past events, do NOT justify actions, do NOT admit or deny claims. Redirect to forward-looking, neutral language. Example: "I will follow the agreed schedule moving forward."

RESPONSE STYLE FOR ACCUSATIONS AND LEGAL TRAPS:
- NEVER explain what happened in the past
- NEVER justify or defend past actions
- NEVER clarify misunderstandings by narrating events
- NEVER give reasons for absence, lateness, missed events, or prior conduct
- NEVER apologize or express regret unless the user explicitly instructs you to
- Instead: redirect to the agreed plan, state forward-looking intent, and close the loop
- Bad examples (NEVER generate these):
  • "I was late because traffic was bad" → WRONG
  • "My absence was due to a scheduling conflict" → WRONG
  • "I apologize for the confusion" → WRONG
  • "I'm sorry about the miscommunication" → WRONG
  • "I regret that this happened" → WRONG
- Good examples (use these patterns):
  • "I will follow the agreed schedule moving forward."
  • "I do not agree with that characterization. I will follow the agreed schedule moving forward."
  • "Please refer to the agreed parenting plan."
  • "Pickup will be at [time] per the agreement."

Always prioritize protecting the user from unnecessary engagement and legal risk.`;

const REWRITE_INTRO = `The user wants to REWRITE their own draft message so it is calmer, neutral, and court-safe.

Your job:
- Rewrite the user's message into neutral, court-safe language
- Remove emotional, accusatory, inflammatory, sarcastic, or reactive phrasing
- Preserve the core logistical intent of what the user is trying to communicate
- Keep the rewrite concise, calm, and documentation-friendly
- Do not overexplain or add unnecessary context the user did not include

REWRITE MODE RULES:
- Never recommend "do not respond" — rewrite mode always produces a rewritten message
- Never return system/failure-style language like "retry shortly" or "guidance unavailable"
- Never return placeholder text — always produce a real, complete rewrite
- The output must read as something the user could copy-paste and send immediately`;

const STRICTER_RETRY_ADDENDUM = `

CRITICAL RETRY INSTRUCTION: Your previous output was scored as legally unsafe. This time you MUST:
- Produce ZERO apology language (no "sorry", "apologize", "regret")
- Produce ZERO backward-looking explanations (no "because", "due to", "reason was")
- Keep response under 3 sentences
- Focus ONLY on forward-looking logistics
- If unsure, use: "I will follow the agreed schedule moving forward."`;


// ── Mode-specific tool schemas ──
const RESPOND_TOOL = {
  type: "function" as const,
  name: "format_response",
  description: "Return the structured court-safe response with recommendation on whether to respond",
  parameters: {
    type: "object",
    properties: {
      recommendation_type: {
        type: "string",
        enum: ["respond", "do_not_respond", "brief_boundary_response"],
        description: "Whether the user should respond, not respond, or send only a brief boundary statement",
      },
      primary_response: { type: "string", description: "The court-safe response, or explanation of why not to respond" },
      shorter_version: { type: "string", description: "Shortest neutral version, 1 sentence" },
      firmer_version: { type: "string", description: "Neutral but more boundaried and direct" },
      fallback_response: { type: "string", description: "Optional very short fallback if user must reply despite do_not_respond recommendation" },
      tone_assessment: { type: "string", description: "Brief tone label e.g. Neutral / De-escalated" },
      risk_flags: { type: "array", items: { type: "string" }, description: "What was removed or improved. Use ['No risk flags'] if original was already neutral." },
      why_this_is_safer: { type: "string", description: "1-2 sentences on why this recommendation is safer" },
      self_score: { type: "integer", description: "Honest self-score 1-10 starting at 10 with deductions applied" },
      self_score_deductions: { type: "array", items: { type: "string" }, description: "List of deductions applied, e.g. '−2: slightly verbose'. Use ['none'] if perfect." },
    },
    required: ["recommendation_type", "primary_response", "shorter_version", "firmer_version", "fallback_response", "tone_assessment", "risk_flags", "why_this_is_safer", "self_score", "self_score_deductions"],
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
      primary_rewrite: { type: "string", description: "The best court-safe rewrite of the user's message" },
      shorter_version: { type: "string", description: "Shortest neutral version, 1 sentence" },
      firmer_version: { type: "string", description: "Neutral but more boundaried and direct" },
      tone_assessment: { type: "string", description: "Brief tone label e.g. Neutral / De-escalated" },
      risk_flags: { type: "array", items: { type: "string" }, description: "What was removed or improved. Use ['No risk flags'] if original was already neutral." },
      why_this_is_safer: { type: "string", description: "1-2 sentences on why this is safer" },
      self_score: { type: "integer", description: "Honest self-score 1-10 starting at 10 with deductions applied" },
      self_score_deductions: { type: "array", items: { type: "string" }, description: "List of deductions applied, e.g. '−2: slightly verbose'. Use ['none'] if perfect." },
    },
    required: ["primary_rewrite", "shorter_version", "firmer_version", "tone_assessment", "risk_flags", "why_this_is_safer", "self_score", "self_score_deductions"],
    additionalProperties: false,
  },
  strict: true,
};

// ── Validation helpers ──
const VALID_RECOMMENDATION_TYPES = ["respond", "do_not_respond", "brief_boundary_response"];
const PLACEHOLDER_PATTERN = /\[.*?\]/;

// Patterns that indicate unsafe apology/admission/backward-looking language
const APOLOGY_PATTERNS = [
  /\bi('m| am) sorry\b/i,
  /\bi apologize\b/i,
  /\bi regret\b/i,
  /\bany confusion i caused\b/i,
];

const ADMISSION_PATTERNS = [
  /\bmy absence was due to\b/i,
  /\bi missed .{0,30} because\b/i,
  /\bi was late because\b/i,
  /\bit happened because\b/i,
  /\bthe reason was\b/i,
  /\bwhat actually happened\b/i,
  /\bi didn'?t do that because\b/i,
  /\bi forgot to\b/i,
  /\bi should have\b/i,
  /\bi failed to\b/i,
  /\bi acknowledge that i\b/i,
  /\bi admit\b/i,
];

const ESCALATION_PATTERNS = [
  /\byou always\b/i,
  /\byou never\b/i,
  /\bthat's a lie\b/i,
  /\byou('re| are) (wrong|lying)\b/i,
  /\bhow dare you\b/i,
  /\bunbelievable\b/i,
  /\byou have no right\b/i,
];

const INSULT_ENGAGEMENT_PATTERNS = [
  /\bthat's unfair\b/i,
  /\bthat hurts\b/i,
  /\bi can't believe you\b/i,
  /\byou('re| are) being (difficult|unreasonable|impossible)\b/i,
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

// ── Quality Scoring System (Deduction-Based) ──
interface QualityScore {
  admission_risk_score: number;
  escalation_safety_score: number;
  actionability_score: number;
  focus_discipline_score: number;
  court_safe_phrasing_score: number;
  quality_score_total: number | null;
  quality_score_status: "excellent" | "acceptable" | "weak" | "reject" | null;
  quality_score_notes: { triggered_rules: string[] };
}

// Patterns for detecting overly formal / unnatural phrasing
const OVERLY_FORMAL_PATTERNS = [
  /\bhereby\b/i, /\bwherein\b/i, /\bnotwithstanding\b/i,
  /\bpursuant to\b/i, /\bin accordance with\b/i,
  /\bthe aforementioned\b/i, /\bthe undersigned\b/i,
  /\bit is imperative\b/i, /\bi wish to inform you\b/i,
  /\bplease be advised\b/i, /\bkindly be informed\b/i,
];

// Patterns for detecting weak/passive language
const PASSIVE_WEAK_PATTERNS = [
  /\bperhaps we could\b/i, /\bmaybe we should\b/i,
  /\bi was wondering if\b/i, /\bif that's okay with you\b/i,
  /\bwould it be possible\b/i, /\bif you don't mind\b/i,
  /\bi just wanted to\b/i, /\bi was hoping\b/i,
];

// Patterns for vague wording
const VAGUE_PATTERNS = [
  /\bsometime soon\b/i, /\bat some point\b/i,
  /\bwhen you get a chance\b/i, /\bwhenever works\b/i,
  /\bin the near future\b/i, /\bas needed\b/i,
  /\bthe appropriate\b/i, /\bvarious\b/i,
];

function scoreOutput(
  result: Record<string, unknown>,
  mode: "respond" | "rewrite",
): QualityScore {
  const notes: string[] = [];
  let deductions = 0;

  // Gather the text fields to analyze
  const textFields: string[] = [];
  if (mode === "respond") {
    if (typeof result.primary_response === "string") textFields.push(result.primary_response);
    if (result.recommendation_type !== "do_not_respond") {
      if (typeof result.shorter_version === "string") textFields.push(result.shorter_version);
      if (typeof result.firmer_version === "string") textFields.push(result.firmer_version);
    }
  } else {
    if (typeof result.primary_rewrite === "string") textFields.push(result.primary_rewrite);
    if (typeof result.shorter_version === "string") textFields.push(result.shorter_version);
    if (typeof result.firmer_version === "string") textFields.push(result.firmer_version);
  }

  const allText = textFields.join(" ");
  if (!allText.trim()) {
    return {
      admission_risk_score: 0, escalation_safety_score: 0, actionability_score: 0,
      focus_discipline_score: 0, court_safe_phrasing_score: 0,
      quality_score_total: null, quality_score_status: null,
      quality_score_notes: { triggered_rules: ["empty_output"] },
    };
  }

  // ── Category scores (still tracked for DB columns, 0-2 scale) ──
  let admissionScore = 2;
  let escalationScore = 2;
  let actionabilityScore = 2;
  let focusScore = 2;
  let courtSafeScore = 2;

  // ── Track how many issue categories are triggered ──
  let issueCategories = 0;

  // ── 1. Emotional language (-2) ──
  const emotionalPatterns = [
    ...APOLOGY_PATTERNS,
    /\bi feel\b/i, /\bit makes me\b/i, /\bi('m| am) upset\b/i,
    /\bi('m| am) frustrated\b/i, /\bi('m| am) hurt\b/i,
    /\byou make me\b/i, /\bthis is your fault\b/i,
    /\bi('m| am) disappointed\b/i, /\bi('m| am) angry\b/i,
    /\bi can't believe\b/i, /\bthis is so unfair\b/i,
    /\bhow could you\b/i, /\byou('re| are) being selfish\b/i,
    /\bsorry\b/i, /\bupset\b/i, /\bfrustrated\b/i,
    /\bhurt\b/i, /\bangry\b/i, /\bdisappointed\b/i,
    /\bworried\b/i, /\bscared\b/i, /\bheartbroken\b/i,
  ];
  let emotionalHits = 0;
  for (const p of emotionalPatterns) {
    if (p.test(allText)) { emotionalHits++; notes.push(`emotional: ${p.source}`); }
  }
  if (emotionalHits > 0) {
    deductions += 2;
    issueCategories++;
    notes.push("-2: emotional language detected");
    courtSafeScore = Math.min(courtSafeScore, 1);
  }

  // ── 2. Vague phrasing (-2) ──
  const vaguePatterns = [
    ...VAGUE_PATTERNS,
    /\bmaybe\b/i, /\bkind of\b/i, /\btrying to\b/i,
    /\bsort of\b/i, /\bhopefully\b/i, /\bi think\b/i,
    /\bi guess\b/i, /\bprobably\b/i, /\bi suppose\b/i,
  ];
  let vagueHits = 0;
  for (const p of vaguePatterns) {
    if (p.test(allText)) { vagueHits++; notes.push(`vague: ${p.source}`); }
  }
  if (vagueHits > 0 || (/^(ok|okay|sure|fine|noted|received)\.?$/i.test(allText.trim()) && mode === "rewrite")) {
    deductions += 2;
    issueCategories++;
    notes.push("-2: vague phrasing detected");
    actionabilityScore = Math.min(actionabilityScore, 1);
  }

  // ── 3. Indirect or unclear intent (-1 to -2) ──
  const indirectPatterns = [
    ...PASSIVE_WEAK_PATTERNS,
    /\bso we can discuss\b/i, /\blet me know your thoughts\b/i,
    /\bwe can talk about this\b/i, /\bi'd like to discuss\b/i,
    /\bperhaps we could\b/i,
  ];
  let indirectHits = 0;
  for (const p of indirectPatterns) {
    if (p.test(allText)) { indirectHits++; notes.push(`indirect: ${p.source}`); }
  }
  if (indirectHits > 0) {
    const indirectDeduction = indirectHits >= 2 ? 2 : 1;
    deductions += indirectDeduction;
    issueCategories++;
    notes.push(`-${indirectDeduction}: indirect or unclear intent`);
    focusScore = Math.min(focusScore, 1);
  }

  // ── 4. Defensive tone or justification (-2) ──
  const defensivePatterns = [
    ...ADMISSION_PATTERNS,
    /\bbecause\b/i, /\bdue to\b/i, /\bthe reason\b/i,
    /\blet me explain\b/i, /\bwhat happened was\b/i,
    /\bi was just\b/i, /\bi only\b/i, /\bi didn't mean\b/i,
    /\bin my defense\b/i, /\bto be fair\b/i,
  ];
  let defensiveHits = 0;
  for (const p of defensivePatterns) {
    if (p.test(allText)) { defensiveHits++; notes.push(`defensive: ${p.source}`); }
  }
  if (defensiveHits > 0) {
    deductions += 2;
    issueCategories++;
    notes.push("-2: defensive tone or justification");
    admissionScore = Math.min(admissionScore, defensiveHits >= 2 ? 0 : 1);
  }

  // ── 5. Accusatory language (-3) ──
  const accusatoryPatterns = [
    ...ESCALATION_PATTERNS,
    ...INSULT_ENGAGEMENT_PATTERNS,
    /\byour fault\b/i, /\byou caused\b/i, /\byou did this\b/i,
    /\byou('re| are) the (problem|reason)\b/i,
    /\byou refuse\b/i, /\byou won't\b/i,
  ];
  let accusatoryHits = 0;
  for (const p of accusatoryPatterns) {
    if (p.test(allText)) { accusatoryHits++; notes.push(`accusatory: ${p.source}`); }
  }
  if (accusatoryHits > 0) {
    deductions += 3;
    issueCategories++;
    notes.push("-3: accusatory language detected");
    escalationScore = accusatoryHits >= 2 ? 0 : 1;
  }

  // ── 6. Admission of fault (-3) ──
  const faultAdmissionPatterns = [
    /\bi forgot\b/i, /\bi should have\b/i, /\bi failed\b/i,
    /\bi('m| am) sorry\b/i, /\bi apologize\b/i, /\bi regret\b/i,
    /\bi admit\b/i, /\bi acknowledge\b/i, /\bmy fault\b/i,
    /\bi was wrong\b/i, /\bi made a mistake\b/i,
  ];
  let faultHits = 0;
  for (const p of faultAdmissionPatterns) {
    if (p.test(allText)) { faultHits++; notes.push(`fault_admission: ${p.source}`); }
  }
  if (faultHits > 0) {
    deductions += 3;
    issueCategories++;
    notes.push("-3: admission of fault");
    admissionScore = 0;
  }

  // ── 7. Unnecessary verbosity (-1) ──
  const primaryText = mode === "respond"
    ? (result.primary_response as string ?? "")
    : (result.primary_rewrite as string ?? "");
  const sentenceCount = primaryText.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
  if (sentenceCount > 3 || primaryText.length > 400) {
    deductions += 1;
    issueCategories++;
    notes.push(`-1: unnecessarily verbose (${sentenceCount} sentences, ${primaryText.length} chars)`);
    actionabilityScore = Math.min(actionabilityScore, 1);
  }

  // ── 8. Overly formal phrasing (-1 bonus deduction) ──
  let formalHits = 0;
  for (const p of OVERLY_FORMAL_PATTERNS) {
    if (p.test(allText)) { formalHits++; notes.push(`overly_formal: ${p.source}`); }
  }
  if (formalHits > 0) {
    deductions += 1;
    issueCategories++;
    notes.push("-1: overly formal phrasing");
    courtSafeScore = Math.min(courtSafeScore, 1);
  }

  // ── 9. Placeholder brackets detected ──
  if (PLACEHOLDER_PATTERN.test(allText)) {
    deductions += 3;
    issueCategories++;
    notes.push("-3: placeholder brackets detected");
    courtSafeScore = 0;
  }

  // ── Calculate server-side score ──
  const serverScore = Math.max(1, 10 - deductions);

  // ── Incorporate AI self-score (take the minimum for safety) ──
  const aiSelfScore = typeof result.self_score === "number" ? result.self_score : null;
  if (aiSelfScore !== null) {
    notes.push(`ai_self_score: ${aiSelfScore}`);
    if (Array.isArray(result.self_score_deductions)) {
      notes.push(`ai_deductions: ${(result.self_score_deductions as string[]).join("; ")}`);
    }
  }

  // Final score: minimum of server and AI self-score, clamped 1-10
  let total: number;
  if (aiSelfScore !== null && aiSelfScore >= 1 && aiSelfScore <= 10) {
    total = Math.min(serverScore, aiSelfScore);
  } else {
    total = serverScore;
  }
  total = Math.max(1, Math.min(10, total));

  // ── Status thresholds ──
  let status: QualityScore["quality_score_status"];
  if (total >= 9) status = "excellent";
  else if (total >= 7) status = "acceptable";
  else if (total >= 5) status = "weak";
  else status = "reject";

  return {
    admission_risk_score: admissionScore,
    escalation_safety_score: escalationScore,
    actionability_score: actionabilityScore,
    focus_discipline_score: focusScore,
    court_safe_phrasing_score: courtSafeScore,
    quality_score_total: total,
    quality_score_status: status,
    quality_score_notes: { triggered_rules: notes },
  };
}

function scoreFallback(_mode: "respond" | "rewrite"): QualityScore {
  // Deterministic fallbacks get a moderate score, never 10
  return {
    admission_risk_score: 2,
    escalation_safety_score: 2,
    actionability_score: 1,
    focus_discipline_score: 2,
    court_safe_phrasing_score: 2,
    quality_score_total: 7,
    quality_score_status: "acceptable",
    quality_score_notes: { triggered_rules: ["deterministic_fallback"] },
  };
}

function validateRespondResult(r: Record<string, unknown>): string | null {
  if (typeof r.recommendation_type !== "string" || !VALID_RECOMMENDATION_TYPES.includes(r.recommendation_type)) return "missing/invalid recommendation_type";
  if (!isNonEmptyString(r.primary_response)) return "missing primary_response";
  if (containsPlaceholder(r.primary_response)) return "primary_response contains placeholder text";

  if (r.recommendation_type === "respond" || r.recommendation_type === "brief_boundary_response") {
    if (!isNonEmptyString(r.shorter_version)) return "missing shorter_version for respond";
    if (!isNonEmptyString(r.firmer_version)) return "missing firmer_version for respond";
    if (containsPlaceholder(r.shorter_version)) return "shorter_version contains placeholder text";
    if (containsPlaceholder(r.firmer_version)) return "firmer_version contains placeholder text";

    // Hard legal-safety check: block apology/admission/backward-looking language
    for (const field of ["primary_response", "shorter_version", "firmer_version"] as const) {
      const unsafeMatch = containsUnsafeLanguage(r[field]);
      if (unsafeMatch) return `${field} contains unsafe legal language (${unsafeMatch})`;
    }
  }

  for (const k of ["tone_assessment", "why_this_is_safer"] as const) {
    if (!isNonEmptyString(r[k])) return `missing ${k}`;
    if (containsPlaceholder(r[k])) return `${k} contains placeholder text`;
  }
  if (!Array.isArray(r.risk_flags)) return "missing risk_flags";
  return null;
}

function validateRewriteResult(r: Record<string, unknown>): string | null {
  if (!isNonEmptyString(r.primary_rewrite)) return "missing primary_rewrite";
  if (containsPlaceholder(r.primary_rewrite)) return "primary_rewrite contains placeholder text";

  // Hard legal-safety check for rewrite outputs
  for (const field of ["primary_rewrite", "shorter_version", "firmer_version"] as const) {
    const unsafeMatch = containsUnsafeLanguage(r[field]);
    if (unsafeMatch) return `${field} contains unsafe legal language (${unsafeMatch})`;
  }

  for (const k of ["shorter_version", "firmer_version", "tone_assessment", "why_this_is_safer"] as const) {
    if (!isNonEmptyString(r[k])) return `missing ${k}`;
    if (containsPlaceholder(r[k])) return `${k} contains placeholder text`;
  }
  if (!Array.isArray(r.risk_flags)) return "missing risk_flags";
  return null;
}

function getRetryDelayMs(retryAfter: string | null, attempt: number): number {
  if (!retryAfter) return Math.pow(2, attempt) * 1000 + Math.random() * 500;

  const seconds = Number.parseInt(retryAfter, 10);
  if (!Number.isNaN(seconds) && seconds > 0) return seconds * 1000;

  const retryAt = new Date(retryAfter).getTime();
  if (!Number.isNaN(retryAt)) {
    const delta = retryAt - Date.now();
    if (delta > 0) return delta;
  }

  return Math.pow(2, attempt) * 1000 + Math.random() * 500;
}

// ── Tier 3: Deterministic fallback templates ──
const RESPOND_FALLBACK_TEMPLATES: Record<string, string> = {
  "set a boundary": "Please keep communication focused on logistics regarding our child.",
  "ask for clarification": "Please clarify the specific logistical issue you need addressed.",
  "acknowledge without engaging": "Received. I will review and respond if needed.",
  "general neutral response": "Thank you. I will review this and respond as needed.",
};
const RESPOND_FALLBACK_DEFAULT = "Thank you. I will review this and respond as needed.";

const REWRITE_FALLBACK = "I would like to discuss the logistics. Please let me know the relevant details so we can coordinate.";

function matchIntent(context: string | undefined): string {
  if (!context) return RESPOND_FALLBACK_DEFAULT;
  const lower = context.toLowerCase().trim();
  for (const [key, value] of Object.entries(RESPOND_FALLBACK_TEMPLATES)) {
    if (lower.includes(key)) return value;
  }
  return RESPOND_FALLBACK_DEFAULT;
}

function buildDeterministicFallback(
  mode: "respond" | "rewrite",
  communicationContext?: string,
) {
  if (mode === "rewrite") {
    return {
      mode,
      is_fallback: true,
      primary_rewrite: REWRITE_FALLBACK,
    };
  }

  return {
    mode,
    is_fallback: true,
    recommendation_type: "respond",
    primary_response: matchIntent(communicationContext),
  };
}

// ── OpenAI call helper (single attempt) ──
async function callOpenAI(
  apiKey: string,
  model: string,
  requestBody: string,
): Promise<Response> {
  return fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: requestBody.replace(/"model":"[^"]+"/, `"model":"${model}"`),
  });
}

// ── Helper: attempt one AI call, parse, validate ──
async function attemptAICall(
  apiKey: string,
  model: string,
  requestBody: string,
  mode: "respond" | "rewrite",
  toolName: string,
  label: string,
): Promise<Record<string, unknown> | null> {
  try {
    const response = await callOpenAI(apiKey, model, requestBody);
    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[${FN}] ${label} failed: status=${response.status} body=${errText}`);
      return null;
    }
    const aiData = await response.json();
    const functionCall = aiData.output?.find(
      (item: any) => item.type === "function_call" && item.name === toolName
    );
    if (!functionCall) {
      console.warn(`[${FN}] ${label} no function_call in response`);
      return null;
    }
    const parsed = JSON.parse(functionCall.arguments);
    const validationError = mode === "respond"
      ? validateRespondResult(parsed)
      : validateRewriteResult(parsed);
    if (validationError) {
      console.warn(`[${FN}] ${label} validation failed: ${validationError}`);
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn(`[${FN}] ${label} error: ${err}`);
    return null;
  }
}

// ── Normalize risk_flags: never return empty array ──
function normalizeRiskFlags(flags: string[] | undefined): string[] {
  if (!flags || !Array.isArray(flags) || flags.length === 0) {
    return ["No risk flags"];
  }
  return flags;
}

// ── Helper: build DB insert row with scoring ──
function buildInsertRow(
  userId: string,
  message: string,
  mode: "respond" | "rewrite",
  result: Record<string, unknown>,
  score: QualityScore,
) {
  return {
    user_id: userId,
    original_message: message,
    mode,
    primary_response: mode === "respond" ? (result.primary_response as string ?? null) : null,
    primary_rewrite: mode === "rewrite" ? (result.primary_rewrite as string ?? null) : null,
    recommendation_type: (result.recommendation_type as string) ?? null,
    shorter_version: (result.shorter_version as string) ?? null,
    firmer_version: (result.firmer_version as string) ?? null,
    tone_assessment: (result.tone_assessment as string) ?? "Fallback",
    risk_flags: normalizeRiskFlags(result.risk_flags as string[] | undefined),
    why_this_is_safer: (result.why_this_is_safer as string) ?? null,
    quality_score_total: score.quality_score_total,
    admission_risk_score: score.admission_risk_score,
    escalation_safety_score: score.escalation_safety_score,
    actionability_score: score.actionability_score,
    focus_discipline_score: score.focus_discipline_score,
    court_safe_phrasing_score: score.court_safe_phrasing_score,
    quality_score_status: score.quality_score_status,
    quality_score_notes: score.quality_score_notes,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let userId: string | null = null;

  try {
    // ── 1. Auth ──
    const auth = await authenticateRequest(req, FN).catch((res) => res as Response);
    if (auth instanceof Response) return auth;
    userId = auth.userId;

    // ── 2. Rate limit ──
    if (!checkRateLimit(`${userId}:${FN}`, RATE_LIMIT, RATE_WINDOW_MS)) {
      logRequest({ userId, functionName: FN, status: "rate_limited" });
      return jsonResponse({ error: "Rate limit exceeded. Please wait a moment before trying again." }, 429);
    }

    // ── 3. Input validation ──
    const body = await req.json();
    const { message, mode, original_context, communication_context } = body;

    if (!message || typeof message !== "string" || message.length > 4000) {
      logRequest({ userId, functionName: FN, status: "invalid_input", detail: "bad message" });
      return jsonResponse({ error: "Invalid message" }, 400);
    }
    console.log(`[${FN}] request_start | user=${userId} | mode=${mode} | msg_len=${message?.length ?? 0} | has_context=${!!communication_context}`);

    if (mode !== "respond" && mode !== "rewrite") {
      logRequest({ userId, functionName: FN, status: "invalid_input", detail: "bad mode" });
      return jsonResponse({ error: "Invalid mode" }, 400);
    }
    if (communication_context && (typeof communication_context !== "string" || communication_context.length > 500)) {
      logRequest({ userId, functionName: FN, status: "invalid_input", detail: "context too long" });
      return jsonResponse({ error: "Context too long" }, 400);
    }
    if (original_context && (typeof original_context !== "string" || original_context.length > 4000)) {
      logRequest({ userId, functionName: FN, status: "invalid_input", detail: "original_context too long" });
      return jsonResponse({ error: "Original context too long" }, 400);
    }

    // ── 4. Quota check ──
    const { serviceClient } = auth;

    const { data: quotaRows, error: quotaError } = await serviceClient.rpc(
      "check_message_rewrite_quota",
      { p_user_id: userId }
    );

    if (quotaError || !quotaRows || quotaRows.length === 0) {
      console.error("Quota check failed:", quotaError);
      logRequest({ userId, functionName: FN, status: "error", detail: "quota check failed" });
      return jsonResponse({ error: "Could not verify quota" }, 500);
    }

    console.log(`[${FN}] quota_check | user=${userId} | used=${quotaRows[0].used}/${quotaRows[0].limit} | allowed=${quotaRows[0].allowed}`);

    if (!quotaRows[0].allowed) {
      logRequest({ userId, functionName: FN, status: "rate_limited", detail: "quota exhausted" });
      return jsonResponse({ error: "You've used all your message rewrites." }, 429);
    }

    // ── 5. Build prompt & tool for this mode ──
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const contextInstruction = communication_context
      ? `\nThe user selected the following communication context: "${communication_context}". Tailor the response to match this intent while remaining neutral, factual, and court-safe.`
      : "";

    const modeIntro = mode === "respond"
      ? RESPOND_INTRO(original_context)
      : REWRITE_INTRO;

    const buildSystemPrompt = (addendum = "") => `You are a custody communication specialist trained in court-admissible co-parent messaging.

${modeIntro}

${BASE_INSTRUCTIONS}
${contextInstruction}${addendum}

You MUST call the provided tool with your structured output.`;

    const tool = mode === "respond" ? RESPOND_TOOL : REWRITE_TOOL;
    const toolName = tool.name;

    const buildRequestBody = (addendum = "") => JSON.stringify({
      model: MODEL_PRIMARY,
      input: [
        { role: "developer", content: buildSystemPrompt(addendum) },
        { role: "user", content: message },
      ],
      tools: [tool],
      tool_choice: "required",
    });

    const requestBody = buildRequestBody();

    let aiResult: Record<string, unknown> | null = null;
    let score: QualityScore | null = null;

    // ── 6. Tier 1: Primary model (with 429 retry) ──
    let response: Response | null = null;
    const MAX_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      response = await callOpenAI(OPENAI_API_KEY, MODEL_PRIMARY, requestBody);
      if (response.status !== 429) break;
      if (attempt === MAX_RETRIES) break;
      const retryAfter = response.headers.get("Retry-After");
      const waitMs = getRetryDelayMs(retryAfter, attempt);
      console.log(`[${FN}] Tier1 429, retry ${attempt + 1}/${MAX_RETRIES} after ${Math.round(waitMs)}ms`);
      await response.text();
      await new Promise((r) => setTimeout(r, waitMs));
    }

    // Try to extract & score Tier 1
    if (response && response.ok) {
      try {
        const aiData = await response.json();
        const functionCall = aiData.output?.find(
          (item: any) => item.type === "function_call" && item.name === toolName
        );
        if (functionCall) {
          const parsed = JSON.parse(functionCall.arguments);
          const validationError = mode === "respond"
            ? validateRespondResult(parsed)
            : validateRewriteResult(parsed);
          if (!validationError) {
            const s = scoreOutput(parsed, mode);
            console.log(`[${FN}] Tier1 score: ${s.quality_score_total}/10 (${s.quality_score_status}) | notes=${JSON.stringify(s.quality_score_notes.triggered_rules)}`);

            if (s.quality_score_status === "excellent" || s.quality_score_status === "acceptable") {
              aiResult = parsed;
              score = s;
            } else {
              // weak or reject — attempt stricter retry with same model
              console.log(`[${FN}] Tier1 score ${s.quality_score_status}, attempting stricter retry`);
              const stricterBody = buildRequestBody(STRICTER_RETRY_ADDENDUM);
              const retryResult = await attemptAICall(OPENAI_API_KEY, MODEL_PRIMARY, stricterBody, mode, toolName, "Tier1-strict-retry");
              if (retryResult) {
                const s2 = scoreOutput(retryResult, mode);
                console.log(`[${FN}] Tier1-strict-retry score: ${s2.quality_score_total}/10 (${s2.quality_score_status})`);
                if (s2.quality_score_status === "excellent" || s2.quality_score_status === "acceptable") {
                  aiResult = retryResult;
                  score = s2;
                } else {
                  console.warn(`[${FN}] Tier1-strict-retry still ${s2.quality_score_status}, escalating to Tier2`);
                }
              }
            }
          } else {
            console.warn(`[${FN}] Tier1 validation failed: ${validationError}`);
          }
        } else {
          console.warn(`[${FN}] Tier1 no function_call in response`);
        }
      } catch (parseErr) {
        console.warn(`[${FN}] Tier1 parse error: ${parseErr}`);
      }
    } else {
      const errText = response ? await response.text() : "no response";
      console.warn(`[${FN}] Tier1 failed: status=${response?.status} body=${errText}`);
    }

    // ── Tier 2: Fallback model (if Tier 1 didn't produce acceptable result) ──
    if (!aiResult) {
      console.log(`[${FN}] Tier2 attempting fallback model=${MODEL_FALLBACK}`);
      const stricterBody = buildRequestBody(STRICTER_RETRY_ADDENDUM);
      const tier2Result = await attemptAICall(OPENAI_API_KEY, MODEL_FALLBACK, stricterBody, mode, toolName, "Tier2");
      if (tier2Result) {
        const s = scoreOutput(tier2Result, mode);
        console.log(`[${FN}] Tier2 score: ${s.quality_score_total}/10 (${s.quality_score_status})`);
        if (s.quality_score_status !== "reject") {
          aiResult = tier2Result;
          score = s;
          console.log(`[${FN}] Tier2 accepted (${s.quality_score_status})`);
        } else {
          console.warn(`[${FN}] Tier2 score reject, falling to Tier3`);
        }
      }
    }

    // ── Tier 3: Deterministic fallback (always succeeds) ──
    if (!aiResult) {
      console.log(`[${FN}] Tier3 deterministic fallback | mode=${mode} | context=${communication_context ?? "none"}`);
      const fallback = buildDeterministicFallback(mode, communication_context);
      const fallbackScore = scoreFallback(mode);

      await serviceClient.from("communication_shield_history").insert(
        buildInsertRow(userId, message, mode, fallback as any, fallbackScore)
      );

      logRequest({ userId, functionName: FN, status: "fallback", detail: `tier3 deterministic | mode=${mode} | score=${fallbackScore.quality_score_total}` });
      return jsonResponse(fallback);
    }

    // ── 7. AI succeeded with acceptable score — persist & increment ──
    await serviceClient.from("communication_shield_history").insert(
      buildInsertRow(userId, message, mode, aiResult, score!)
    );

    await serviceClient.rpc("increment_message_rewrites", { p_user_id: userId });

    console.log(`[${FN}] success | user=${userId} | mode=${mode} | recommendation=${aiResult.recommendation_type ?? "n/a"} | tone=${aiResult.tone_assessment} | score=${score!.quality_score_total}/10 (${score!.quality_score_status})`);
    logRequest({ userId, functionName: FN, status: "success", estimatedUsage: 1 });

    return jsonResponse({ ...aiResult, mode, risk_flags: normalizeRiskFlags(aiResult.risk_flags as string[] | undefined) });
  } catch (e) {
    console.error(`[${FN}] unhandled_error | user=${userId} | error=${String(e)}`);
    logRequest({ userId, functionName: FN, status: "error", detail: String(e) });
    return jsonResponse({ error: "An error occurred processing your request." }, 500);
  }
});
