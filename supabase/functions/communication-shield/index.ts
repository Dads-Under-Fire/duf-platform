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
   
   Deduction rules for original_score (start at 10):
   - -3 if threats or intimidation
   - -3 if admission of fault (sorry, my fault, I forgot, I should have)
   - -3 if strong accusations (you always, you never, your fault, you caused)
   - -2 if emotional language (upset, frustrated, hurt, angry, disappointed)
   - -2 if hostile or aggressive tone
   - -2 if passive aggression or sarcasm
   - -2 if over-explaining or justification
   - -2 if apology language (sorry, I apologize)
   - -1 if vague phrasing (maybe, kind of, hopefully)
   - -1 if escalation risk
   
   HARD RULES for original_score:
   - If admissions, threats, or strong accusations exist → must score 1-4
   - If emotional or vague language exists → must not exceed 7-8
   - Only score 9-10 if message is already fully neutral and concise

   Also provide "original_score_notes" — array of strings describing each issue found.

2. "rewrite_quality_score" (integer 1-10): Evaluate ONLY your rewritten/generated output quality.
   A score of 10 should be EXCEPTIONALLY RARE — reserved only for rewrites that require zero improvement.
   
   Score the rewrite quality:
   - 1-3 = poor rewrite (unsafe, emotional, or unusable)
   - 4-5 = weak rewrite (multiple flaws, needs significant revision)
   - 6-7 = acceptable but noticeably flawed
   - 8-9 = strong rewrite with minor issues
   - 10 = near-perfect — NO meaningful improvement possible
   
   Deduction rules for rewrite_quality_score (start at 10, apply ALL that match):
    - -3 if accusatory language remains in output
    - -3 if admission of fault or apology language exists in output
    - -2 if emotional language remains
    - -2 if vague phrasing exists (maybe, hopefully, kind of, sometime soon)
    - -2 if defensive tone or justification appears (because, due to, let me explain)
    - -2 if overly formal or unnatural phrasing (hereby, pursuant to, please be advised, kindly be informed)
    - -2 if unnecessarily verbose (more than 2-3 sentences when fewer would suffice)
    - -2 if too passive or weak (perhaps we could, if that's okay, I was wondering)
    - -2 if adds meaning, context, or framing not clearly present in original message
    - -2 if the original contained specific logistics (times, dates, actions) but the rewrite replaced them with generic phrases like "the agreed schedule" or "moving forward"
    - -1 if generic or bland wording when a more specific/clear phrasing was possible
    - -1 if indirect or unclear intent (so we can discuss, let me know your thoughts)
    - -1 if slightly controlling or patronizing tone
    - -1 if the original was already clean and the rewrite made it MORE formal or wordy without improving safety
    
    HARD CAPS for rewrite_quality_score (these override all other scoring):
    - If ANY admission trap language remains in the rewrite (asks for confirmation of past events, restates wrongdoing, includes questions that create legal exposure like "Can you confirm...?", "Do you agree...?", "Were you late...?") → MAX score = 6
    - If ANY threat language remains in the rewrite → MAX score = 7
    - If the rewrite introduces NEW legal risk not present in the original → MAX score = 5
    - If ANY emotional, vague, or apologetic language exists → must not exceed 8
    - If 2+ issue categories apply → score must be 6-7 range
    - If 3+ issue categories apply → score must be 5-6 range
    - A rewrite being safer than the original does NOT automatically make it a 10
    - If the original message was already clean/safe, do NOT reward unnecessary rewriting — if the rewrite adds formality or wording without improving safety, reduce score
    
    REQUIREMENTS for 9-10 score (ALL must be true):
    - Fully neutral tone — no emotional, accusatory, or defensive language
    - Zero admission risk — no confirmation questions, no restating of past conduct
    - Zero escalation potential — nothing that could provoke further conflict
    - Preserves logistics cleanly — specific details retained without introducing risk
    - Concise, natural-sounding, and would require zero meaningful improvement
    - DEFAULT assumption: most rewrites have at least minor room for improvement → default to 8-9 for good rewrites
   
   Also provide "rewrite_quality_notes" — array of strings describing each deduction. If you give 10, you MUST justify it with "none — rewrite is concise, neutral, natural, and requires no improvement".

RISK FLAGS RULES:
- risk_flags MUST list every issue found in the ORIGINAL message
- Risk flags describe the ORIGINAL message only, NOT the rewrite quality
- If the original input is already perfectly neutral with no issues, set risk_flags to ["No risk flags"]
- NEVER return an empty array for risk_flags
- NEVER return "No risk flags" if the message contains ANY emotional, reactive, accusatory, or manipulative language — even in a single word
- SHORT MESSAGES: A message being short does NOT make it neutral. Single words like "Unbelievable", "Seriously?", "Whatever", "Fine." are emotional and MUST be flagged.
- Use SPECIFIC, ACCURATE flag labels. Choose from this taxonomy:

  SEVERE (threats/hostility):
  - "Threat or intimidation" — only if message contains actual threats, ultimatums, or intimidating language
  - "Hostile or aggressive tone" — only if message contains insults, name-calling, or overtly aggressive language
  - "Controlling or coercive language" — only if message attempts to dictate, demand, or manipulate behavior
  - "Direct confrontation" — only if message directly challenges, provokes, or picks a fight

  MODERATE (emotional/accusatory/manipulative):
  - "Accusatory tone" — blaming, finger-pointing ("you always", "you never", "your fault")
  - "Emotional language detected" — frustration, anger, hurt, exasperation, disbelief expressed openly — INCLUDING short reactive messages like "Unbelievable", "Seriously?", "Ridiculous", "Wow"
  - "Passive-aggressive tone" — indirect hostility, sarcasm, backhanded comments
  - "Defensive tone" — justifying, explaining away, protecting oneself
  - "Admission of fault" — apologies, self-blame, accepting responsibility in a legally risky way
  - "Admission trap" — when the message tries to force agreement, confirmation, or admission of past conduct (e.g. "So you agree that...", "You admit that...", "So basically you're saying...", "Then you acknowledge...")

  MINOR (style/clarity):
  - "Over-explaining or justification" — providing unnecessary reasons, backstory, or explanations (e.g. "I was late because traffic was bad")
  - "Uncertainty in commitment" — hedging, vague promises ("maybe", "I'll try", "hopefully")
  - "Vague or imprecise language" — unclear references, ambiguous phrasing
  - "Unnecessarily verbose" — message is longer than needed for its content
  - "Apology language" — sorry/apologize without full admission

  DO NOT USE these overly broad labels:
  - ❌ "Escalation risk" — too vague
  - ❌ "Potentially problematic" — always specify the problem
  - ❌ "Could be misinterpreted" — name the actual issue
   - ❌ "No risk flags" when ANY emotional, reactive, or manipulative language exists

  REWRITE-MODE ADDITIONAL FLAGS (use these when mode is rewrite):
  - "Past-fact confirmation risk" — when the original message tries to get the other party to agree with a disputed prior event, characterization, or version of what happened (e.g. "So you admit you were late", "You agree that you canceled", "Last time you said...")
  - "Financial demand or assumption" — when the message relies on an asserted or assumed change in finances, money responsibility, expense expectations, or income (e.g. "You're making more money now", "You should be paying more", "Since your raise...", "You owe me for...")
  - "Irrelevant or non-child-related topic" — when the message is primarily emotional, nostalgic, personal-property related, relationship-processing, or otherwise outside core co-parenting logistics or child-related communication (e.g. "I miss our family", "Remember when we used to...", "I want my couch back", "You hurt me deeply")

  EDGE CASE RULES:
  - Single-word or very short emotional messages (e.g. "Unbelievable", "Seriously?", "Ridiculous") → MUST flag as "Emotional language detected" and score 5-6
  - Messages attempting to force agreement or admission (e.g. "So you agree that you were late last week") → MUST flag as "Admission trap" AND "Past-fact confirmation risk" and score 3-5
  - Messages containing BOTH logistics AND emotional language → flag the emotional language AND address the logistics`;

const PERSPECTIVE_RULES = `PERSPECTIVE PRESERVATION — ABSOLUTE RULES:
- NEVER change the speaker's perspective. If the user wrote "I will pick up", do NOT rewrite as "You will pick up" or "The children will be picked up."
- NEVER assume commitments or actions on behalf of either party that were not in the original message.
- The rewritten message MUST preserve who is making the request, who is performing the action, and who is being addressed.
- If the original says "I" → the rewrite says "I". If it says "you" → handle carefully to avoid accusatory tone, but do NOT flip perspective.

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
- Use direct statements: "I will", "Please confirm", "The schedule is", "Drop-off is at 5pm."

CLARITY AND SPECIFICITY:
- Where possible, add clarity by specifying time, date, location, or required action.
- Outputs must be direct and actionable, not vague.
- Prefer "Drop-off is at 5pm today at [location]" over "We should coordinate drop-off."
- If the original message contains specific details, preserve AND clarify them.
- If the original is vague, make the rewrite MORE specific where context allows.`;

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

${PERSPECTIVE_RULES}

${LEGAL_SAFETY_RULES}

${QUALITY_RULES}

${SCORING_INSTRUCTIONS}

JSON VALIDATION RULE:
Your output MUST be valid JSON via the provided tool call. If any field is missing or malformed, regenerate the entire output. Every field must be populated with real content — never null, empty, or placeholder.`;

const RESPOND_INTRO = (originalContext?: string) =>
  `The user received a message from the other parent.${originalContext ? ` The original message received was: "${originalContext}"` : ""}

IMPORTANT — RECOMMENDATION LAYER:
Before drafting a response, FIRST evaluate whether responding is actually the safest choice. This evaluation must be based on communication strategy and legal positioning — NOT on system availability or technical issues.

Analyze the incoming message carefully. Set "recommendation_type" to one of:

- "respond" — The message contains ANY actionable logistics, scheduling, custody coordination, pickup/drop-off times, agreements, arrangements, or threats related to arrangements (e.g. keeping a child longer, changing plans unilaterally). Even if the tone is hostile, insulting, or emotionally charged — if there is ANY logistical or custody-relevant content, you MUST respond to the actionable portion and ignore the emotional bait. Provide full response variants (primary_rewrite, shorter_version, firmer_version).

- "do_not_respond" — The safest action is NOT to reply. Choose this ONLY when the incoming message:
  • Is PURELY insulting, baiting, or emotionally provocative with ZERO logistical content
  • Contains ONLY character attacks, mockery, or emotional venting
  • Has absolutely NO actionable co-parenting issue, schedule reference, or custody matter
  • Would likely escalate conflict if engaged with
  • Is designed solely to provoke a reaction rather than coordinate parenting
  Examples that qualify for do_not_respond: "You're a terrible father." / "No one wants you around." / "You disgust me."
  IMPORTANT: Do NOT select do_not_respond if the message mentions ANY of: times, dates, pickup, drop-off, schedule, custody, keeping the child, arrangements, school, health, or agreements — even buried in hostility.
  When choosing do_not_respond:
  • Set "primary_rewrite" to a clear 1-2 sentence explanation of WHY no response is recommended, from a communication/legal strategy perspective. Example: "This message contains no logistical content and is designed to provoke a reaction. Responding would create unnecessary conflict in the record."
  • Set "shorter_version" and "firmer_version" to empty strings ""
  • Optionally set "fallback_response" to a very short neutral message ONLY if the user feels they absolutely must reply (e.g. "Received.")

- "brief_boundary_response" — A very short neutral boundary statement is appropriate, but engaging further is not. The message may contain a minor logistical element buried in hostility. Provide a minimal response in "primary_rewrite" (1 sentence max). "shorter_version" can match. "firmer_version" should set a firmer boundary.

CRITICAL DECISION RULES:
- Never recommend "do_not_respond" for technical or system reasons.
- Never recommend "do_not_respond" when there is ANY logistical, scheduling, or custody-relevant content in the message — regardless of hostile tone.
- When the message is hostile BUT contains logistics: select "respond", address ONLY the logistics, completely ignore insults and emotional content.
- When the message contains accusations or legal traps: select "respond" but do NOT explain past events, do NOT justify actions, do NOT admit or deny claims. Redirect to forward-looking, neutral language. Example: "I will follow the agreed schedule moving forward."
- When the message is an ADMISSION TRAP (tries to force agreement about past conduct): the response MUST be entirely forward-looking. NEVER confirm, deny, restate, or ask about past events. NEVER output questions like "Can you confirm...?", "Do you agree...?", or "Were you late...?" — these create legal exposure for the user.

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
- Good examples (use these patterns, preserving specific context when available):
  • "I will be at the scheduled pickup location today." (context-specific)
  • "Drop-off will be at 5pm per the agreement." (context-specific)
  • "I will follow the agreed schedule moving forward." (only when no specific logistics in original)
  • "I do not agree with that characterization." (for accusations without logistics)
  • "Please refer to the agreed parenting plan." (for general disputes)

Always prioritize protecting the user from unnecessary engagement and legal risk.`;

const REWRITE_INTRO = `The user wants to REWRITE their own drafted outgoing co-parent message into neutral, factual, court-safe language.

PURPOSE:
- Preserve the user's SAFEST FUNCTIONAL INTENT while reducing legal risk, emotional language, escalation, and ambiguity.
- The output must read as something the user could copy-paste and send immediately.
- The goal is NOT to preserve every emotional nuance. The goal is to preserve the safest functional intent in a neutral, disciplined way.

CRITICAL RULES — PERSPECTIVE AND ACCOUNTABILITY:
- NEVER change the speaker's perspective. If the user wrote "I" → rewrite says "I". If "you" → handle carefully but do NOT flip perspective.
- NEVER speak on behalf of the other party.
- NEVER convert a request into a statement of action. If the original asks the other party to confirm, act, or clarify, the rewrite MUST remain a request.
- NEVER generate "I will" unless the original clearly states the sender is making that commitment.
- Preserve accountability direction. Do not reframe the issue as shared responsibility unless that is explicitly appropriate from the original.

CONFIRMATION REQUEST PRESERVATION:
- If the original asks the other party to confirm a future action (e.g. "Can you confirm you'll be there Saturday?"), the rewrite MUST remain a confirmation request.
- Do NOT convert "Can you confirm..." or "Will you..." into a directive like "Be there Saturday" or "You will be there Saturday."
- Do NOT convert a confirmation request into a statement of the sender's own action.
- Acceptable: "Please confirm the Saturday pickup time." / "Will you be at the pickup location at 3pm?"
- Unacceptable: "I will be at the pickup location at 3pm." (when the original asked the OTHER party to confirm)

ASSUMPTION-TO-FACT PROHIBITION:
- Do NOT assert that the other party's finances, motives, intentions, compliance history, or circumstances have changed unless that fact is ALREADY clearly established in the original AND is safe to preserve.
- Do NOT harden soft language ("I think you might be..." → "You are...").
- Do NOT infer or state reasons for the other party's behavior.
- If the original contains speculation or assumptions, the rewrite should NARROW or REMOVE them — never strengthen them into stated facts.
- Especially avoid asserting anything about: money, income changes, new partners, mental health, substance use, compliance history, or intent.

EMOTIONAL CONTENT NARROWING:
- If the original message is primarily emotional, nostalgic, relational, or not materially related to co-parenting logistics, parenting issues, or necessary communication:
  - The rewrite should NARROW it to the functional core or NEUTRALIZE it — not polish it into a deeper or more articulate emotional discussion.
  - Strip sentimental, guilt-tripping, or relationship-processing language.
  - If there is NO functional intent beneath the emotion, the rewrite should be extremely brief and logistics-focused.
- The goal is NOT to preserve every emotional nuance. The goal is to preserve the SAFEST FUNCTIONAL INTENT in a neutral, disciplined way.

CONTROLLING/PATRONIZING LANGUAGE PROHIBITION:
- Do NOT add controlling or patronizing closing language to any variant.
- Specifically BANNED closing phrases:
  • "Please confirm you understand this change."
  • "Please confirm you understand."
  • "I expect you to..."
  • "You need to..."
  • "I trust you will..."
  • "I assume you will..."
  • "Make sure you..."
  • "Ensure that you..."
  • "See to it that..."
- Firmer phrasing must still remain court-safe and non-controlling. Assertive ≠ controlling.
- Acceptable firm closers: "Please confirm the pickup time." / "The schedule is as agreed." / "I will follow the parenting plan."

SHARED RESPONSIBILITY RULE:
- Avoid "we," "us," "let's," or other mutual framing unless clearly necessary and explicitly supported by the original.
- Do NOT turn "you need to follow the schedule" into "we need to follow the schedule."
- Do NOT turn a directed request into a collaborative suggestion.

TONE RULES — FIRM, NOT SUBMISSIVE:
- Neutral, factual, composed, professional, court-safe.
- Firm when needed, never aggressive.
- NEVER use passive or submissive phrasing. Specifically BANNED:
  • "I would appreciate" / "I would appreciate it if"
  • "I feel" / "I feel like" / "I feel that"
  • "I was hoping" / "I was wondering"
  • "If that's okay" / "If you don't mind"
  • "Perhaps we could" / "Maybe we should"
  • "Would it be possible" / "Could you possibly"
  • "I just wanted to" / "I just think"
  • "It seems like" / "It appears that"
- Use direct statements: "Please confirm", "The schedule is", "Drop-off is at 5pm."

CLARITY RULES:
- Improve clarity and actionability where possible.
- Add time/date/location/action ONLY when present or clearly implied in the original.
- Reduce vagueness without inventing facts.
- Preserve and clarify specific logistical details from the original (times, dates, locations, actions).
- NEVER replace specific details with generic phrases like "the agreed schedule" or "moving forward" when the original contained concrete information.

CONTEXT PRESERVATION RULES:
- If the original says "today" → the rewrite MUST say "today"
- If the original mentions "pickup" → the rewrite MUST mention "pickup"
- If the original mentions a specific time like "3pm" → the rewrite MUST include "3pm"
- If the original references a specific action → the rewrite MUST reference that action
- "I will follow the agreed schedule" is only acceptable when the original message itself was vague and contained no specific logistics

ADMISSION TRAP REWRITE RULES (overrides context preservation):
If the original message attempts to force an admission, confirm past wrongdoing, or reference past violations in a yes/no format:
- The rewrite MUST NOT ask for confirmation of past events
- The rewrite MUST NOT restate or imply wrongdoing
- The rewrite MUST NOT include questions that create legal exposure
- Convert the entire message to FORWARD-LOOKING language only
- Focus on schedule adherence, expectations, or logistics
- Remove ALL references to past behavior, past violations, or past events
- Examples:
  INPUT: "So you're admitting you didn't follow the schedule last weekend?"
  CORRECT: "Please follow the agreed schedule moving forward."
  WRONG: "Please confirm the schedule was not followed."
  INPUT: "So you agree that you were late to pickup last Tuesday?"
  CORRECT: "I will be at the scheduled pickup time going forward."
  WRONG: "Can you confirm you were late last Tuesday?"

LEGAL SAFETY CONSTRAINTS:
- No admissions of fault
- No emotional language
- No escalation, threats, or sarcasm
- No apologies or expressions of regret

ALL THREE VARIANTS (primary_rewrite, shorter_version, firmer_version) must follow ALL rules above. They should differ in tone/length but NOT in specificity or safety.

OUTPUT FIELDS:
- primary_rewrite = best overall rewrite — neutral, clear, firm, legally safe, actionable
- shorter_version = shorter safe rewrite, 1 sentence max
- firmer_version = more assertive but still court-safe rewrite
- why_this_is_safer = brief explanation of why the rewrite is safer
- tone_assessment = short label like "Neutral", "Firm", "Calm"
- risk_flags = array of issues found in the ORIGINAL message
- original_score = score for how risky the original message is (1=very risky, 10=already safe)
- rewrite_quality_score = score for how strong and safe the rewrite is (1=poor, 10=excellent)
- original_score_notes = notes explaining original score deductions
- rewrite_quality_notes = notes explaining rewrite score deductions

REWRITE QUALITY SCORING — ADDITIONAL DEDUCTIONS:
Apply these deductions to rewrite_quality_score in ADDITION to standard deductions:
- -2 if a confirmation request was converted into a directive or self-commitment
- -2 if an assumption or speculation was hardened into an asserted fact
- -2 if emotional content was polished/articulated instead of narrowed/neutralized
- -2 if controlling or patronizing closing language was introduced
- -1 if the rewrite preserves emotional nuance that has no functional purpose

VALIDATION — SELF-CHECK BEFORE OUTPUTTING:
- If the rewrite changes perspective → regenerate
- If the rewrite turns a request into a statement of action → regenerate
- If the rewrite introduces shared responsibility improperly → regenerate
- If the rewrite adds admissions, escalation, or unnecessary softness → regenerate
- If the rewrite uses any BANNED passive phrases → regenerate
- If a confirmation request became a directive → regenerate
- If an assumption became an asserted fact → regenerate
- If emotional bait was polished instead of narrowed → regenerate
- If controlling/patronizing closing language was added → regenerate

REWRITE MODE RULES:
- Never recommend "do not respond" — rewrite mode always produces a rewritten message
- Never return system/failure-style language like "retry shortly" or "guidance unavailable"
- Never return placeholder text — always produce a real, complete rewrite`;

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
      primary_rewrite: { type: "string", description: "The court-safe response, or explanation of why not to respond" },
      shorter_version: { type: "string", description: "Shortest neutral version, 1 sentence" },
      firmer_version: { type: "string", description: "Neutral but more boundaried and direct" },
      fallback_response: { type: "string", description: "Optional very short fallback if user must reply despite do_not_respond recommendation" },
      tone_assessment: { type: "string", description: "Brief tone label e.g. Neutral / De-escalated" },
      risk_flags: { type: "array", items: { type: "string" }, description: "Issues found in the ORIGINAL message. Use ['No risk flags'] if original was already neutral." },
      why_this_is_safer: { type: "string", description: "1-2 sentences on why this recommendation is safer" },
      three_alternatives: { type: "array", items: { type: "string" }, description: "Exactly 3 alternatives: [more direct, slightly softer, highly structured/formal]" },
      original_score: { type: "integer", description: "Risk score of the ORIGINAL message only (1=very risky, 10=already safe)" },
      original_score_notes: { type: "array", items: { type: "string" }, description: "Issues found in original message, e.g. '−3: accusatory language'. Use ['none'] if clean." },
      rewrite_quality_score: { type: "integer", description: "Quality score of YOUR generated output only (1=poor, 10=excellent)" },
      rewrite_quality_notes: { type: "array", items: { type: "string" }, description: "Deductions on your output quality, e.g. '−2: slightly verbose'. Use ['none'] if perfect." },
    },
    required: ["recommendation_type", "primary_rewrite", "shorter_version", "firmer_version", "fallback_response", "tone_assessment", "risk_flags", "why_this_is_safer", "three_alternatives", "original_score", "original_score_notes", "rewrite_quality_score", "rewrite_quality_notes"],
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
      primary_rewrite: { type: "string", description: "The best court-safe rewrite of the user's message — neutral, clear, firm, legally safe, actionable" },
      shorter_version: { type: "string", description: "Shortest neutral version, 1 sentence" },
      firmer_version: { type: "string", description: "More assertive but still court-safe rewrite" },
      tone_assessment: { type: "string", description: "Brief tone label e.g. Neutral / Firm / Calm" },
      risk_flags: { type: "array", items: { type: "string" }, description: "Issues found in the ORIGINAL message. Use ['No risk flags'] if original was already neutral." },
      why_this_is_safer: { type: "string", description: "1-2 sentences on why this rewrite is safer" },
      original_score: { type: "integer", description: "Risk score of the ORIGINAL message only (1=very risky, 10=already safe)" },
      original_score_notes: { type: "array", items: { type: "string" }, description: "Issues found in original message, e.g. '−2: emotional language'. Use ['none'] if clean." },
      rewrite_quality_score: { type: "integer", description: "Quality score of YOUR rewritten output only (1=poor, 10=excellent)" },
      rewrite_quality_notes: { type: "array", items: { type: "string" }, description: "Deductions on your rewrite quality, e.g. '−1: slightly verbose'. Use ['none'] if perfect." },
    },
    required: ["primary_rewrite", "shorter_version", "firmer_version", "tone_assessment", "risk_flags", "why_this_is_safer", "original_score", "original_score_notes", "rewrite_quality_score", "rewrite_quality_notes"],
    additionalProperties: false,
  },
  strict: true,
};

// ── Validation helpers ──
const VALID_RECOMMENDATION_TYPES = ["respond", "do_not_respond", "brief_boundary_response"];
const PLACEHOLDER_PATTERN = /\[.*?\]/;

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

// ── Scoring: Original Message (server-side verification) ──
function scoreOriginalMessage(originalMessage: string): { score: number; notes: string[] } {
  const notes: string[] = [];
  let deductions = 0;
  let issueCategories = 0;

  const text = originalMessage;

  // Threats / intimidation (-3)
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
    /\bi was wrong\b/i, /\bi made a mistake\b/i, /\bi admit\b/i,
    /\bi regret\b/i,
  ];
  let faultHits = 0;
  for (const p of faultPatterns) { if (p.test(text)) { faultHits++; notes.push(`fault: ${p.source}`); } }
  if (faultHits > 0) { deductions += 3; issueCategories++; notes.push("-3: admission of fault"); }

  // Strong accusations (-3)
  const accusatoryPatterns = [
    /\byou always\b/i, /\byou never\b/i, /\byour fault\b/i,
    /\byou caused\b/i, /\byou did this\b/i, /\byou('re| are) (wrong|lying|the problem|the reason)\b/i,
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

  // Short emotional message detection — single-word or very short reactive messages
  const trimmed = text.trim();
  const wordCount = trimmed.split(/\s+/).length;
  const shortEmotionalPatterns = [
    /^unbelievable[.!?]*$/i, /^seriously[.!?]*$/i, /^ridiculous[.!?]*$/i,
    /^wow[.!?]*$/i, /^fine[.!?]*$/i, /^great[.!?]*$/i, /^nice[.!?]*$/i,
    /^really[.!?]*$/i, /^typical[.!?]*$/i, /^incredible[.!?]*$/i,
    /^amazing[.!?]*$/i, /^perfect[.!?]*$/i, /^lovely[.!?]*$/i,
    /^figures?[.!?]*$/i, /^right[.!?]*$/i, /^sure[.!?]*$/i,
    /^of course[.!?]*$/i, /^clearly[.!?]*$/i,
  ];
  let shortEmotionalHit = false;
  if (wordCount <= 4) {
    for (const p of shortEmotionalPatterns) {
      if (p.test(trimmed)) { shortEmotionalHit = true; notes.push(`short_emotional: ${p.source}`); break; }
    }
    // Also catch short messages ending with ! or ? that express exasperation
    if (!shortEmotionalHit && wordCount <= 3 && /[!?]{1,}$/.test(trimmed) && !/^(yes|no|ok|okay|confirmed|done|received|noted)[.!?]*$/i.test(trimmed)) {
      shortEmotionalHit = true;
      notes.push("short_emotional: short reactive message with punctuation");
    }
  }
  if (shortEmotionalHit && emotionalHits === 0) {
    emotionalHits++;
    notes.push("-2: short emotional/reactive message");
    deductions += 2;
    issueCategories++;
  }

  if (emotionalHits > 0 && !shortEmotionalHit) { deductions += 2; issueCategories++; notes.push("-2: emotional language"); }

  // Admission trap detection (-3)
  const admissionTrapPatterns = [
    /\bso you agree\b/i, /\byou admit\b/i, /\bthen you acknowledge\b/i,
    /\bso basically you('re| are) saying\b/i, /\bso you('re| are) saying\b/i,
    /\bso you confirm\b/i, /\byou('re| are) confirming\b/i,
    /\bso you('re| are) admitting\b/i, /\byou just admitted\b/i,
    /\bso you acknowledge\b/i, /\bthen you agree\b/i,
    /\bso you concede\b/i, /\byou('re| are) conceding\b/i,
    /\bso we can agree that\b/i, /\byou already said\b/i,
    /\byou told me that\b/i, /\byou said yourself\b/i,
  ];
  let admissionTrapHits = 0;
  for (const p of admissionTrapPatterns) { if (p.test(text)) { admissionTrapHits++; notes.push(`admission_trap: ${p.source}`); } }
  if (admissionTrapHits > 0) { deductions += 3; issueCategories++; notes.push("-3: admission trap"); }

  // Hostile/aggressive tone (-2)
  const hostilePatterns = [
    /\byou('re| are) (pathetic|disgusting|terrible|worthless|selfish)\b/i,
    /\bshut up\b/i, /\bgo to hell\b/i, /\byou disgust me\b/i,
    /\bnobody (wants|likes|cares about) you\b/i,
  ];
  let hostileHits = 0;
  for (const p of hostilePatterns) { if (p.test(text)) { hostileHits++; notes.push(`hostile: ${p.source}`); } }
  if (hostileHits > 0) { deductions += 2; issueCategories++; notes.push("-2: hostile/aggressive tone"); }

  // Passive aggression / sarcasm (-2)
  const passiveAggressivePatterns = [
    /\bthanks for nothing\b/i, /\bwhatever\b/i, /\bgood luck with that\b/i,
    /\bnice try\b/i, /\bsure,? (right|okay)\b/i, /\boh really\b/i,
    /\bthat's rich\b/i, /\bclassic you\b/i,
  ];
  let paHits = 0;
  for (const p of passiveAggressivePatterns) { if (p.test(text)) { paHits++; notes.push(`passive_aggressive: ${p.source}`); } }
  if (paHits > 0) { deductions += 2; issueCategories++; notes.push("-2: passive aggression/sarcasm"); }

  // Over-explaining / justification (-2)
  const justificationPatterns = [
    /\bbecause\b/i, /\bdue to\b/i, /\bthe reason\b/i,
    /\blet me explain\b/i, /\bwhat happened was\b/i,
    /\bi was just\b/i, /\bin my defense\b/i, /\bto be fair\b/i,
  ];
  let justHits = 0;
  for (const p of justificationPatterns) { if (p.test(text)) { justHits++; notes.push(`justification: ${p.source}`); } }
  if (justHits > 0) { deductions += 2; issueCategories++; notes.push("-2: over-explaining/justification"); }

  // Apology language (-2)
  let apologyHits = 0;
  for (const p of APOLOGY_PATTERNS) { if (p.test(text)) { apologyHits++; notes.push(`apology: ${p.source}`); } }
  if (apologyHits > 0 && faultHits === 0) { // avoid double-counting with fault
    deductions += 2; issueCategories++; notes.push("-2: apology language");
  }

  // Vague phrasing (-1)
  const vaguePatterns = [
    /\bmaybe\b/i, /\bkind of\b/i, /\bhopefully\b/i,
    /\bi think\b/i, /\bi guess\b/i, /\bprobably\b/i,
    /\bsort of\b/i, /\bi suppose\b/i,
  ];
  let vagueHits = 0;
  for (const p of vaguePatterns) { if (p.test(text)) { vagueHits++; notes.push(`vague: ${p.source}`); } }
  if (vagueHits > 0) { deductions += 1; issueCategories++; notes.push("-1: vague phrasing"); }

  // Escalation risk (-1) — only if not already caught by more specific categories
  let escalationHits = 0;
  for (const p of [...ESCALATION_PATTERNS, ...INSULT_ENGAGEMENT_PATTERNS]) {
    if (p.test(text) && !accusatoryHits) { escalationHits++; }
  }
  if (escalationHits > 0 && accusatoryHits === 0) { deductions += 1; issueCategories++; notes.push("-1: escalation risk"); }

  // ── Additional classification flags (no score deduction, flagging only) ──

  // Past-fact confirmation risk
  const pastFactPatterns = [
    /\bso you (agree|admit|acknowledge|confirm|concede)\b/i,
    /\byou (agreed|admitted|acknowledged|confirmed|said|told me)\b/i,
    /\blast time you\b/i, /\byou already said\b/i,
    /\byou said yourself\b/i, /\bremember when you\b/i,
    /\byou promised\b/i, /\byou were (late|absent|wrong)\b/i,
    /\byou didn't (show|come|follow|pick)\b/i,
    /\byou missed\b/i, /\byou failed to\b/i,
    /\byou canceled\b/i, /\byou cancelled\b/i,
  ];
  let pastFactHits = 0;
  for (const p of pastFactPatterns) { if (p.test(text)) { pastFactHits++; } }
  if (pastFactHits > 0) { notes.push("flag: Past-fact confirmation risk"); }

  // Financial demand or assumption
  const financialPatterns = [
    /\b(you|your) (owe|pay|paying|income|salary|raise|money|finances?)\b/i,
    /\bchild support\b/i, /\balimony\b/i,
    /\byou('re| are) making more\b/i, /\bsince your (raise|promotion|new job)\b/i,
    /\byou should be paying\b/i, /\byou need to pay\b/i,
    /\breimburse\b/i, /\bsplit the cost\b/i,
    /\byou can afford\b/i, /\byour (new|extra) income\b/i,
    /\bexpense(s)?\b/i, /\bcost(s)?\b/i,
  ];
  let financialHits = 0;
  for (const p of financialPatterns) { if (p.test(text)) { financialHits++; } }
  if (financialHits > 0) { notes.push("flag: Financial demand or assumption"); }

  // Irrelevant or non-child-related topic
  const irrelevantPatterns = [
    /\bi miss (us|you|our (family|life|marriage|relationship))\b/i,
    /\bremember when we\b/i, /\bwe used to\b/i,
    /\bi (still )?(love|care about) you\b/i,
    /\b(my|your) (stuff|things|belongings|furniture|couch|clothes)\b/i,
    /\bgive (me )?back my\b/i, /\breturn my\b/i,
    /\byou hurt me\b/i, /\byou broke my heart\b/i,
    /\bour relationship\b/i, /\bour marriage\b/i,
    /\bwhy did (you|we) (break up|divorce|separate|split)\b/i,
    /\bi('m| am) (lonely|lost without you|nothing without you)\b/i,
  ];
  let irrelevantHits = 0;
  for (const p of irrelevantPatterns) { if (p.test(text)) { irrelevantHits++; } }
  if (irrelevantHits > 0) { notes.push("flag: Irrelevant or non-child-related topic"); }

  let score = Math.max(1, 10 - deductions);

  // Hard caps
  if (threatHits > 0 || faultHits > 0 || accusatoryHits > 0) {
    score = Math.min(score, 4);
    notes.push("cap: threats/admissions/accusations caps at 4");
  }
  if (admissionTrapHits > 0) {
    score = Math.min(score, 5);
    notes.push("cap: admission trap caps at 5");
  }
  if (shortEmotionalHit) {
    score = Math.min(score, 6);
    notes.push("cap: short emotional message caps at 6");
  }
  if (emotionalHits > 0 || vagueHits > 0) {
    score = Math.min(score, 8);
  }

  score = Math.max(1, Math.min(10, score));

  return { score, notes };
}

// ── Scoring: Output Quality (server-side verification) ──
interface OutputQualityResult {
  score: number | null;
  notes: string[];
  quality_score_status: "excellent" | "acceptable" | "weak" | "reject" | null;
}

// Keep the old interface name as an alias for compatibility within this file
type RewriteQualityResult = OutputQualityResult;

const OVERLY_FORMAL_PATTERNS = [
  /\bhereby\b/i, /\bwherein\b/i, /\bnotwithstanding\b/i,
  /\bpursuant to\b/i, /\bin accordance with\b/i,
  /\bthe aforementioned\b/i, /\bthe undersigned\b/i,
  /\bit is imperative\b/i, /\bi wish to inform you\b/i,
  /\bplease be advised\b/i, /\bkindly be informed\b/i,
];

const PASSIVE_WEAK_PATTERNS = [
  /\bperhaps we could\b/i, /\bmaybe we should\b/i,
  /\bi was wondering if\b/i, /\bif that's okay with you\b/i,
  /\bwould it be possible\b/i, /\bif you don't mind\b/i,
  /\bi just wanted to\b/i, /\bi was hoping\b/i,
  /\bi would appreciate\b/i, /\bi feel\b/i, /\bi feel like\b/i,
  /\bi feel that\b/i, /\bcould you possibly\b/i,
  /\bi just think\b/i, /\bit seems like\b/i, /\bit appears that\b/i,
];

const VAGUE_REWRITE_PATTERNS = [
  /\bsometime soon\b/i, /\bat some point\b/i,
  /\bwhen you get a chance\b/i, /\bwhenever works\b/i,
  /\bin the near future\b/i, /\bas needed\b/i,
  /\bmaybe\b/i, /\bkind of\b/i, /\btrying to\b/i,
  /\bsort of\b/i, /\bhopefully\b/i, /\bi think\b/i,
  /\bi guess\b/i, /\bprobably\b/i, /\bi suppose\b/i,
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
    // Also score three_alternatives if present (respond mode only)
    if (Array.isArray(result.three_alternatives)) {
      for (const alt of result.three_alternatives) {
        if (typeof alt === "string") textFields.push(alt);
      }
    }
  } else {
    if (typeof result.primary_rewrite === "string") textFields.push(result.primary_rewrite);
    if (typeof result.shorter_version === "string") textFields.push(result.shorter_version);
    if (typeof result.firmer_version === "string") textFields.push(result.firmer_version);
  }

  const allText = textFields.join(" ");
  if (!allText.trim()) {
    return { score: null, notes: ["empty_output"], quality_score_status: null };
  }

  let issueCategories = 0;

  // 1. Emotional language (-2)
  const emotionalPatterns = [
    ...APOLOGY_PATTERNS,
    /\bi feel\b/i, /\bit makes me\b/i, /\bi('m| am) upset\b/i,
    /\bi('m| am) frustrated\b/i, /\bi('m| am) hurt\b/i,
    /\byou make me\b/i, /\bthis is your fault\b/i,
    /\bsorry\b/i, /\bupset\b/i, /\bfrustrated\b/i,
    /\bhurt\b/i, /\bangry\b/i, /\bdisappointed\b/i,
    /\bworried\b/i, /\bscared\b/i, /\bheartbroken\b/i,
  ];
  let emotionalHits = 0;
  for (const p of emotionalPatterns) { if (p.test(allText)) { emotionalHits++; notes.push(`emotional: ${p.source}`); } }
  if (emotionalHits > 0) { deductions += 2; issueCategories++; notes.push("-2: emotional language in output"); }

  // 2. Vague phrasing (-2)
  let vagueHits = 0;
  for (const p of VAGUE_REWRITE_PATTERNS) { if (p.test(allText)) { vagueHits++; notes.push(`vague: ${p.source}`); } }
  if (vagueHits > 0) { deductions += 2; issueCategories++; notes.push("-2: vague phrasing in output"); }

  // 3. Defensive tone (-2)
  const defensivePatterns = [
    ...ADMISSION_PATTERNS,
    /\bbecause\b/i, /\bdue to\b/i, /\bthe reason\b/i,
    /\blet me explain\b/i, /\bwhat happened was\b/i,
    /\bi was just\b/i, /\bi only\b/i, /\bi didn't mean\b/i,
    /\bin my defense\b/i, /\bto be fair\b/i,
  ];
  let defensiveHits = 0;
  for (const p of defensivePatterns) { if (p.test(allText)) { defensiveHits++; notes.push(`defensive: ${p.source}`); } }
  if (defensiveHits > 0) { deductions += 2; issueCategories++; notes.push("-2: defensive/justification in output"); }

  // 4. Accusatory language (-3)
  const accusatoryPatterns = [
    ...ESCALATION_PATTERNS, ...INSULT_ENGAGEMENT_PATTERNS,
    /\byour fault\b/i, /\byou caused\b/i, /\byou did this\b/i,
    /\byou('re| are) the (problem|reason)\b/i,
  ];
  let accusatoryHits = 0;
  for (const p of accusatoryPatterns) { if (p.test(allText)) { accusatoryHits++; notes.push(`accusatory: ${p.source}`); } }
  if (accusatoryHits > 0) { deductions += 3; issueCategories++; notes.push("-3: accusatory language in output"); }

  // 5. Admission of fault (-3)
  const faultPatterns = [
    /\bi forgot\b/i, /\bi should have\b/i, /\bi failed\b/i,
    /\bi('m| am) sorry\b/i, /\bi apologize\b/i, /\bi regret\b/i,
    /\bi admit\b/i, /\bmy fault\b/i, /\bi was wrong\b/i, /\bi made a mistake\b/i,
  ];
  let faultHits = 0;
  for (const p of faultPatterns) { if (p.test(allText)) { faultHits++; notes.push(`fault: ${p.source}`); } }
  if (faultHits > 0) { deductions += 3; issueCategories++; notes.push("-3: admission of fault in output"); }

  // 6. Overly formal (-2)
  let formalHits = 0;
  for (const p of OVERLY_FORMAL_PATTERNS) { if (p.test(allText)) { formalHits++; notes.push(`formal: ${p.source}`); } }
  if (formalHits > 0) { deductions += 2; issueCategories++; notes.push("-2: overly formal/unnatural"); }

  // 7. Verbosity (-2)
  const primaryText = (result.primary_rewrite as string ?? "");
  const sentenceCount = primaryText.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
  if (sentenceCount > 3 || primaryText.length > 400) {
    deductions += 2; issueCategories++;
    notes.push(`-2: verbose (${sentenceCount} sentences, ${primaryText.length} chars)`);
  }

  // 8. Too passive/weak (-2)
  let weakHits = 0;
  for (const p of PASSIVE_WEAK_PATTERNS) { if (p.test(allText)) { weakHits++; notes.push(`weak: ${p.source}`); } }
  if (weakHits > 0) { deductions += 2; issueCategories++; notes.push("-2: too passive/weak"); }

  // 9. Indirect intent (-1)
  const indirectPatterns = [
    /\bso we can discuss\b/i, /\blet me know your thoughts\b/i,
    /\bwe can talk about this\b/i, /\bi'd like to discuss\b/i,
  ];
  let indirectHits = 0;
  for (const p of indirectPatterns) { if (p.test(allText)) { indirectHits++; notes.push(`indirect: ${p.source}`); } }
  if (indirectHits > 0) { deductions += 1; issueCategories++; notes.push("-1: indirect intent"); }

  // 10. Placeholder brackets
  if (PLACEHOLDER_PATTERN.test(allText)) {
    deductions += 3; issueCategories++;
    notes.push("-3: placeholder brackets");
  }

  // 11. Controlling / patronizing tone (-2 in rewrite, -1 in respond)
  const controllingPatterns = [
    /\byou need to\b/i, /\byou must\b/i, /\byou should\b/i,
    /\bi expect you to\b/i, /\bi need you to\b/i,
    /\bgoing forward,? you will\b/i, /\bi trust that you\b/i,
    /\bplease confirm you understand\b/i, /\bi assume you will\b/i,
    /\bmake sure you\b/i, /\bensure that you\b/i,
    /\bsee to it that\b/i, /\bi trust you will\b/i,
  ];
  let controlHits = 0;
  for (const p of controllingPatterns) { if (p.test(allText)) { controlHits++; notes.push(`controlling: ${p.source}`); } }
  if (controlHits > 0) {
    const controlDeduction = mode === "rewrite" ? 2 : 1;
    deductions += controlDeduction;
    issueCategories++;
    notes.push(`-${controlDeduction}: controlling/patronizing tone`);
  }

  // 12. Generic/bland wording (-1)
  const genericPatterns = [
    /\bi appreciate your (cooperation|understanding|patience)\b/i,
    /\bthank you for your (cooperation|understanding|patience)\b/i,
    /\bi look forward to\b/i, /\bmoving forward together\b/i,
    /\bin the best interest of\b/i,
  ];
  let genericHits = 0;
  for (const p of genericPatterns) { if (p.test(allText)) { genericHits++; notes.push(`generic: ${p.source}`); } }
  if (genericHits > 0) { deductions += 1; issueCategories++; notes.push("-1: generic/bland wording"); }

  // 13. Unnecessary formalization
  const wordCount = allText.split(/\s+/).length;
  if (wordCount > 60) { deductions += 1; issueCategories++; notes.push(`-1: high word count (${wordCount})`); }

  let serverScore = Math.max(1, 10 - deductions);

  // Hard caps
  if (emotionalHits > 0 || vagueHits > 0) { serverScore = Math.min(serverScore, 8); }
  if (issueCategories >= 2) { serverScore = Math.min(serverScore, 7); }
  if (issueCategories >= 3) { serverScore = Math.min(serverScore, 6); }

  // Incorporate AI self-score (take minimum)
  const aiSelfScore = typeof result.rewrite_quality_score === "number" ? result.rewrite_quality_score : null;
  if (aiSelfScore !== null) {
    notes.push(`ai_self_score: ${aiSelfScore}`);
    if (Array.isArray(result.rewrite_quality_notes)) {
      notes.push(`ai_deductions: ${(result.rewrite_quality_notes as string[]).join("; ")}`);
    }
  }

  let total: number;
  if (aiSelfScore !== null && aiSelfScore >= 1 && aiSelfScore <= 10) {
    total = Math.min(serverScore, aiSelfScore);
  } else {
    total = serverScore;
  }

  // Final 10 gate
  if (total >= 10 && (issueCategories > 0 || sentenceCount > 2 || primaryText.length > 200)) {
    total = 9;
    notes.push("cap: 10 requires zero issues + concise output");
  }

  total = Math.max(1, Math.min(10, total));

  let status: OutputQualityResult["quality_score_status"];
  if (total >= 9) status = "excellent";
  else if (total >= 7) status = "acceptable";
  else if (total >= 5) status = "weak";
  else status = "reject";

  return { score: total, notes, quality_score_status: status };
}

// Keep old function name as alias for callers
const scoreRewriteQuality = scoreOutputQuality;

function validateThreeAlternatives(r: Record<string, unknown>): string | null {
  if (!Array.isArray(r.three_alternatives)) return "missing three_alternatives";
  if (r.three_alternatives.length !== 3) return `three_alternatives must have exactly 3 items, got ${r.three_alternatives.length}`;
  for (let i = 0; i < 3; i++) {
    if (!isNonEmptyString(r.three_alternatives[i])) return `three_alternatives[${i}] is empty`;
    if (containsPlaceholder(r.three_alternatives[i])) return `three_alternatives[${i}] contains placeholder`;
    const unsafeMatch = containsUnsafeLanguage(r.three_alternatives[i]);
    if (unsafeMatch) return `three_alternatives[${i}] contains unsafe language (${unsafeMatch})`;
  }
  return null;
}

function validateRespondResult(r: Record<string, unknown>): string | null {
  if (typeof r.recommendation_type !== "string" || !VALID_RECOMMENDATION_TYPES.includes(r.recommendation_type)) return "missing/invalid recommendation_type";
  if (!isNonEmptyString(r.primary_rewrite)) return "missing primary_rewrite";
  if (containsPlaceholder(r.primary_rewrite)) return "primary_rewrite contains placeholder text";

  if (r.recommendation_type === "respond" || r.recommendation_type === "brief_boundary_response") {
    if (!isNonEmptyString(r.shorter_version)) return "missing shorter_version for respond";
    if (!isNonEmptyString(r.firmer_version)) return "missing firmer_version for respond";
    if (containsPlaceholder(r.shorter_version)) return "shorter_version contains placeholder text";
    if (containsPlaceholder(r.firmer_version)) return "firmer_version contains placeholder text";

    for (const field of ["primary_rewrite", "shorter_version", "firmer_version"] as const) {
      const unsafeMatch = containsUnsafeLanguage(r[field]);
      if (unsafeMatch) return `${field} contains unsafe legal language (${unsafeMatch})`;
    }
  }

  for (const k of ["tone_assessment", "why_this_is_safer"] as const) {
    if (!isNonEmptyString(r[k])) return `missing ${k}`;
    if (containsPlaceholder(r[k])) return `${k} contains placeholder text`;
  }
  if (!Array.isArray(r.risk_flags)) return "missing risk_flags";
  const altError = validateThreeAlternatives(r);
  if (altError) return altError;
  return null;
}

// ── Rewrite semantic validation (pre-save) ──
const SHARED_RESPONSIBILITY_PATTERNS = [
  /\bwe need to\b/i, /\bwe should\b/i, /\bwe must\b/i,
  /\blet's\b/i, /\blet us\b/i, /\bwe can\b/i,
  /\bwe both\b/i, /\btogether we\b/i, /\bour shared\b/i,
];

const NEW_COMMITMENT_PATTERNS = [
  /\bi will\b/i, /\bi'll\b/i, /\bi commit\b/i,
  /\bi promise\b/i, /\bi pledge\b/i, /\bi guarantee\b/i,
  /\bi am going to\b/i, /\bi'm going to\b/i,
];

const HOSTILE_FIRMNESS_PATTERNS = [
  /\byou need to understand\b/i, /\bi demand\b/i,
  /\bi insist\b/i, /\byou('re| are) not allowed\b/i,
  /\byou have no right\b/i, /\bdo as i say\b/i,
  /\byou('re| are) forbidden\b/i, /\bi('m| am) warning you\b/i,
];

interface SemanticIssue {
  field: string;
  type: string;
  detail: string;
  severity: "hard" | "soft";
}

function validateRewriteSemantics(
  original: string,
  result: Record<string, unknown>,
): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  const origLower = original.toLowerCase();

  const rewriteFields = [
    { key: "primary_rewrite", label: "primary_rewrite" },
    { key: "shorter_version", label: "shorter_version" },
    { key: "firmer_version", label: "firmer_version" },
  ] as const;

  const originalIsRequest = /\b(please|can you|could you|will you|would you|you need|confirm|let me know)\b/i.test(origLower)
    || /\?/.test(original);

  const originalHasCommitment = /\bi will\b/i.test(origLower)
    || /\bi'll\b/i.test(origLower)
    || /\bi am going to\b/i.test(origLower)
    || /\bi'm going to\b/i.test(origLower)
    || /\bi commit\b/i.test(origLower)
    || /\bi promise\b/i.test(origLower);

  const originalHasShared = /\b(we need|we should|we must|let's|let us|we can|we both)\b/i.test(origLower);

  const originalDirectsAtYou = /\b(you need|you should|you must|you have to|you haven't|you didn't|you failed|you were late|you missed)\b/i.test(origLower);

  for (const { key, label } of rewriteFields) {
    const text = result[key];
    if (typeof text !== "string" || !text.trim()) continue;

    // 1. Perspective flip: original is a request → output says "I will"
    // Skip for firmer_version — it's designed to be more assertive
    if (key !== "firmer_version" && originalIsRequest && !originalHasCommitment) {
      for (const p of NEW_COMMITMENT_PATTERNS) {
        if (p.test(text)) {
          // Allow safe forward-looking "I will" statements
          const isSafeCommitment = /\bi will (follow|adhere to|comply with|be at|confirm|ensure)/i.test(text);
          if (!isSafeCommitment) {
            issues.push({ field: label, type: "perspective_flip", detail: `request converted to commitment: ${p.source}`, severity: "hard" });
            break;
          }
        }
      }
    }

    // 2. Shared responsibility reframing
    if (originalDirectsAtYou && !originalHasShared) {
      for (const p of SHARED_RESPONSIBILITY_PATTERNS) {
        if (p.test(text)) {
          issues.push({ field: label, type: "shared_responsibility", detail: `directed responsibility reframed as shared: ${p.source}`, severity: "hard" });
          break;
        }
      }
    }

    // 3. Over-softening — soft issue, deducts from quality score but doesn't hard-reject
    for (const p of PASSIVE_WEAK_PATTERNS) {
      if (p.test(text)) {
        issues.push({ field: label, type: "over_softening", detail: `passive/weak phrasing: ${p.source}`, severity: "soft" });
        break;
      }
    }

    // 4. New commitments not in original — skip for firmer_version
    if (key !== "firmer_version" && !originalHasCommitment) {
      if (/\bi will\b/i.test(text) || /\bi'll\b/i.test(text)) {
        const isSafeCommitment = /\bi will (follow|adhere to|comply with|be at|confirm|ensure)/i.test(text);
        if (!isSafeCommitment) {
          issues.push({ field: label, type: "new_commitment", detail: `"I will" commitment not in original`, severity: "soft" });
        }
      }
    }

    // 5. Hostile firmness (firmer_version only)
    if (key === "firmer_version") {
      for (const p of HOSTILE_FIRMNESS_PATTERNS) {
        if (p.test(text)) {
          issues.push({ field: label, type: "hostile_firmness", detail: `firmer_version too aggressive: ${p.source}` });
          break;
        }
      }
    }

    // 6. Controlling/patronizing closers (all variants)
    const controllingCloserPatterns = [
      /\bplease confirm you understand\b/i,
      /\bi expect you to\b/i,
      /\bi trust that you will\b/i,
      /\bi assume you will\b/i,
      /\bmake sure you\b/i,
      /\bensure that you\b/i,
      /\bsee to it that\b/i,
    ];
    for (const p of controllingCloserPatterns) {
      if (p.test(text)) {
        issues.push({ field: label, type: "controlling_closer", detail: `controlling/patronizing closing: ${p.source}` });
        break;
      }
    }

    // 7. Confirmation request converted to directive
    if (originalIsRequest && !originalHasCommitment) {
      const originalAsksOther = /\b(can you|could you|will you|would you|are you going to|please confirm)\b/i.test(origLower);
      if (originalAsksOther) {
        const isDirective = /\b(you will|you are to)\b/i.test(text) && !/\b(will you|can you|could you|would you|please confirm|confirm (that |whether )?(you will|he will|she will|they will))\b/i.test(text);
        if (isDirective) {
          issues.push({ field: label, type: "confirmation_to_directive", detail: `confirmation request converted to directive` });
        }
      }
    }
  }

  return issues;
}

const SEMANTIC_RETRY_ADDENDUM = `

CRITICAL RETRY — SEMANTIC VALIDATION FAILED. Your previous output violated these rules:

1. NEVER convert a request into "I will" — if the original asks the other party to do something, keep it as a request.
2. NEVER reframe directed responsibility as "we need to" or "let's" — preserve who the original holds accountable.
3. NEVER soften the message with passive phrases like "I would appreciate", "perhaps we could", "if that's okay".
4. NEVER add "I will" commitments unless the original explicitly contains them.
5. firmer_version must be assertive but NEVER hostile, controlling, or patronizing (no "I expect you to", "you need to understand", "I demand").
6. NEVER convert a confirmation request into a directive. If the original asks "Can you confirm...?" or "Will you...?", the rewrite MUST remain a request.
7. NEVER add controlling or patronizing closers like "Please confirm you understand", "I expect you to", "Make sure you", "Ensure that you".
8. NEVER harden assumptions into facts. If the original speculates about the other party's finances, motives, or intent, narrow or remove it — do not assert it as fact.
9. If the original is primarily emotional with no logistical content, NARROW it to a brief logistics-focused message — do NOT polish the emotion.

Regenerate ALL variants following these rules strictly.`;

function validateRewriteResult(r: Record<string, unknown>): string | null {
  if (!isNonEmptyString(r.primary_rewrite)) return "missing primary_rewrite";
  if (containsPlaceholder(r.primary_rewrite)) return "primary_rewrite contains placeholder text";

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
  if (!Number.isNaN(retryAt)) { const delta = retryAt - Date.now(); if (delta > 0) return delta; }
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

function buildDeterministicFallback(mode: "respond" | "rewrite", communicationContext?: string) {
  if (mode === "rewrite") {
    return { mode, is_fallback: true, primary_rewrite: REWRITE_FALLBACK, three_alternatives: [] };
  }
  const fallbackText = matchIntent(communicationContext);
  return { mode, is_fallback: true, recommendation_type: "respond", primary_rewrite: fallbackText, primary_response: fallbackText, three_alternatives: [] };
}

// ── OpenAI call helper ──
async function callOpenAI(apiKey: string, model: string, requestBody: string): Promise<Response> {
  return fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: requestBody.replace(/"model":"[^"]+"/, `"model":"${model}"`),
  });
}

async function attemptAICall(
  apiKey: string, model: string, requestBody: string,
  mode: "respond" | "rewrite", toolName: string, label: string,
): Promise<Record<string, unknown> | null> {
  try {
    const response = await callOpenAI(apiKey, model, requestBody);
    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.warn(`[${FN}] ${label} failure_type=api_error | status=${response.status} | body=${errBody.slice(0, 200)}`);
      return null;
    }
    const aiData = await response.json();
    const functionCall = aiData.output?.find((item: any) => item.type === "function_call" && item.name === toolName);
    if (!functionCall) {
      console.warn(`[${FN}] ${label} failure_type=empty_response | no function_call in output`);
      return null;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(functionCall.arguments);
    } catch (jsonErr) {
      console.warn(`[${FN}] ${label} failure_type=json_parse_error | ${jsonErr}`);
      return null;
    }
    const validationError = mode === "respond" ? validateRespondResult(parsed) : validateRewriteResult(parsed);
    if (validationError) {
      console.warn(`[${FN}] ${label} failure_type=validation_rejection | ${validationError}`);
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn(`[${FN}] ${label} failure_type=api_error | ${err}`);
    return null;
  }
}

function extractServerFlags(notes: string[]): string[] {
  return notes
    .filter(n => n.startsWith("flag: "))
    .map(n => n.replace("flag: ", ""));
}

function normalizeRiskFlags(flags: string[] | undefined, serverFlags: string[] = []): string[] {
  const combined = [...(flags && Array.isArray(flags) ? flags : [])];
  for (const sf of serverFlags) {
    if (!combined.includes(sf)) combined.push(sf);
  }
  if (combined.length === 0) return ["No risk flags"];
  return combined;
}

// ── Build DB insert row — mode-aware scoring ──
function buildInsertRow(
  userId: string, message: string, mode: "respond" | "rewrite",
  result: Record<string, unknown>,
  originalScore: { score: number; notes: string[] },
  outputScore: RewriteQualityResult,
) {
  const row = {
    user_id: userId,
    original_message: message,
    mode,
    primary_response: mode === "respond" ? (result.primary_rewrite as string ?? null) : null,
    primary_rewrite: (result.primary_rewrite as string ?? null),
    recommendation_type: (result.recommendation_type as string) ?? null,
    shorter_version: (result.shorter_version as string) ?? null,
    firmer_version: (result.firmer_version as string) ?? null,
    tone_assessment: (result.tone_assessment as string) ?? "Fallback",
    risk_flags: normalizeRiskFlags(result.risk_flags as string[] | undefined, extractServerFlags(originalScore.notes)),
    why_this_is_safer: (result.why_this_is_safer as string) ?? null,
    // ── Scoring: always write original_score ──
    original_score: originalScore.score,
    original_score_notes: JSON.parse(JSON.stringify(originalScore.notes)),
    // ── Rewrite scoring: only for rewrite mode ──
    rewrite_quality_score: mode === "rewrite" ? outputScore.score : null as number | null,
    rewrite_quality_notes: mode === "rewrite" ? JSON.parse(JSON.stringify(outputScore.notes)) : null,
    // ── Legacy granular fields — leave null (not actively calculated) ──
    quality_score_total: null as number | null,
    admission_risk_score: null as number | null,
    escalation_safety_score: null as number | null,
    actionability_score: null as number | null,
    focus_discipline_score: null as number | null,
    court_safe_phrasing_score: null as number | null,
    quality_score_status: null as string | null,
    quality_score_notes: null as Record<string, unknown> | null,
  };
  console.log(`[${FN}] buildInsertRow | mode=${mode} | original_score=${row.original_score} | rewrite_quality_score=${row.rewrite_quality_score}`);
  return row;
}

// ── Prompt loading from database ──
interface LoadedPrompt {
  promptText: string;
  versionLabel: string;
  source: "database" | "hardcoded_fallback";
  fallbackReason?: string;
}

function assembleHardcodedPrompt(mode: "respond" | "rewrite", originalContext?: string): string {
  if (mode === "rewrite") {
    return `${REWRITE_INTRO}\n\n${BASE_INSTRUCTIONS}`;
  }
  return `${RESPOND_INTRO(originalContext)}\n\n${BASE_INSTRUCTIONS}\n\n${ALTERNATIVES_INSTRUCTIONS}`;
}

async function loadActivePrompt(
  serviceClient: any,
  featureKey: string,
  mode: "respond" | "rewrite",
  originalContext?: string,
): Promise<LoadedPrompt> {
  try {
    const { data, error } = await serviceClient
      .from("ai_system_prompts")
      .select("prompt_text, version_label")
      .eq("feature_key", featureKey)
      .eq("mode", mode)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (error || !data) {
      const reason = error ? `db_error: ${JSON.stringify(error)}` : "no_active_row";
      console.error(`[${FN}] ⚠️ PROMPT_FALLBACK | reason=${reason} | feature=${featureKey} | mode=${mode}`);
      console.error(`[${FN}] ⚠️ Using hardcoded prompt — database is the intended source of truth. Check ai_system_prompts table.`);
      return {
        promptText: assembleHardcodedPrompt(mode, originalContext),
        versionLabel: "hardcoded",
        source: "hardcoded_fallback",
        fallbackReason: reason,
      };
    }

    let promptText = data.prompt_text as string;

    // Replace respond mode placeholder with actual context
    if (mode === "respond") {
      const contextSentence = originalContext
        ? ` The original message received was: "${originalContext}"`
        : "";
      promptText = promptText.replace("{{ORIGINAL_CONTEXT_SENTENCE}}", contextSentence);
    }

    console.log(`[${FN}] prompt_load | source=database | feature=${featureKey} | mode=${mode} | version=${data.version_label} | length=${promptText.length}`);
    return {
      promptText,
      versionLabel: data.version_label as string,
      source: "database",
    };
  } catch (err) {
    const reason = `exception: ${String(err)}`;
    console.error(`[${FN}] ⚠️ PROMPT_FALLBACK | reason=${reason} | feature=${featureKey} | mode=${mode}`);
    console.error(`[${FN}] ⚠️ Using hardcoded prompt — database is the intended source of truth. Check ai_system_prompts table.`);
    return {
      promptText: assembleHardcodedPrompt(mode, originalContext),
      versionLabel: "hardcoded",
      source: "hardcoded_fallback",
      fallbackReason: reason,
    };
  }
}

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
    const { message, mode, original_context, communication_context, skip_quota } = body;

    if (!message || typeof message !== "string" || message.length > 4000) {
      logRequest({ userId, functionName: FN, status: "invalid_input", detail: "bad message" });
      return jsonResponse({ error: "Invalid message" }, 400);
    }
    console.log(`[${FN}] request_start | user=${userId} | mode=${mode} | msg_len=${message?.length ?? 0}`);

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

    // Check if admin requesting quota bypass
    const { serviceClient } = auth;
    let isAdminBypass = false;
    if (skip_quota === true) {
      const { data: profileRow } = await serviceClient
        .from("profiles")
        .select("role")
        .eq("user_id", userId)
        .single();
      isAdminBypass = profileRow?.role === "admin";
      if (isAdminBypass) {
        console.log(`[${FN}] admin_quota_bypass | user=${userId}`);
      }
    }

    // Quota check (skip for admin bypass)
    if (!isAdminBypass) {
      const { data: quotaRows, error: quotaError } = await serviceClient.rpc("check_message_rewrite_quota", { p_user_id: userId });
      if (quotaError || !quotaRows || quotaRows.length === 0) {
        console.error("Quota check failed:", quotaError);
        return jsonResponse({ error: "Could not verify quota" }, 500);
      }
      console.log(`[${FN}] quota_check | used=${quotaRows[0].used}/${quotaRows[0].limit} | allowed=${quotaRows[0].allowed}`);
      if (!quotaRows[0].allowed) {
        return jsonResponse({ error: "You've used all your message rewrites." }, 429);
      }
    }

    // Score the original message (server-side, independent of AI)
    const originalScoreResult = scoreOriginalMessage(message);
    console.log(`[${FN}] original_score: ${originalScoreResult.score}/10 | notes=${JSON.stringify(originalScoreResult.notes)}`);

    // ── Load prompt from database (with hardcoded fallback) ──
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const loadedPrompt = await loadActivePrompt(serviceClient, "communication_shield", mode, original_context);

    const contextInstruction = communication_context
      ? `\nThe user selected the following communication context: "${communication_context}". Tailor the response to match this intent while remaining neutral, factual, and court-safe.`
      : "";

    const buildSystemPrompt = (addendum = "") => `You are a custody communication specialist trained in court-admissible co-parent messaging.

${loadedPrompt.promptText}
${contextInstruction}${addendum}

You MUST call the provided tool with your structured output.`;

    const tool = mode === "respond" ? RESPOND_TOOL : REWRITE_TOOL;
    const toolName = tool.name;

    if (loadedPrompt.source === "hardcoded_fallback") {
      console.warn(`[${FN}] ⚠️ USING HARDCODED FALLBACK | version=${loadedPrompt.versionLabel} | reason=${loadedPrompt.fallbackReason}`);
    } else {
      console.log(`[${FN}] prompt_version=${loadedPrompt.versionLabel} | source=${loadedPrompt.source}`);
    }

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
    let rewriteScore: RewriteQualityResult | null = null;

    // Tier 1: Primary model
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

    if (response && response.ok) {
      try {
        const aiData = await response.json();
        const functionCall = aiData.output?.find((item: any) => item.type === "function_call" && item.name === toolName);
        if (functionCall) {
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(functionCall.arguments);
          } catch (jsonErr) {
            console.warn(`[${FN}] Tier1 failure_type=json_parse_error | ${jsonErr}`);
            parsed = null as any;
          }
          if (parsed) {
            const validationError = mode === "respond" ? validateRespondResult(parsed) : validateRewriteResult(parsed);
            if (!validationError) {
              const s = scoreRewriteQuality(parsed, mode);
              console.log(`[${FN}] Tier1 rewrite_quality_score: ${s.score}/10 (${s.quality_score_status})`);

              // Semantic validation for rewrite mode
              let semanticFailed = false;
              if (mode === "rewrite") {
                const semanticIssues = validateRewriteSemantics(message, parsed);
                if (semanticIssues.length > 0) {
                  semanticFailed = true;
                  console.log(`[${FN}] Tier1 failure_type=semantic_rejection | ${JSON.stringify(semanticIssues)}`);
                }
              }

              if (!semanticFailed && (s.quality_score_status === "excellent" || s.quality_score_status === "acceptable")) {
                aiResult = parsed;
                rewriteScore = s;
              } else {
                const retryAddendum = semanticFailed ? SEMANTIC_RETRY_ADDENDUM : STRICTER_RETRY_ADDENDUM;
                console.log(`[${FN}] Tier1 ${semanticFailed ? "semantic" : "score"} issue, attempting stricter retry`);
                const stricterBody = buildRequestBody(retryAddendum);
                const retryResult = await attemptAICall(OPENAI_API_KEY, MODEL_PRIMARY, stricterBody, mode, toolName, "Tier1-strict-retry");
                if (retryResult) {
                  const s2 = scoreRewriteQuality(retryResult, mode);
                  console.log(`[${FN}] Tier1-strict-retry score: ${s2.score}/10 (${s2.quality_score_status})`);
                  let retrySemanticOk = true;
                  if (mode === "rewrite") {
                    const retryIssues = validateRewriteSemantics(message, retryResult);
                    if (retryIssues.length > 0) {
                      retrySemanticOk = false;
                      console.log(`[${FN}] Tier1-strict-retry failure_type=semantic_rejection | ${JSON.stringify(retryIssues)}`);
                    }
                  }
                  if (retrySemanticOk && (s2.quality_score_status === "excellent" || s2.quality_score_status === "acceptable")) {
                    aiResult = retryResult;
                    rewriteScore = s2;
                  }
                }
              }
            } else {
              console.warn(`[${FN}] Tier1 failure_type=validation_rejection | ${validationError}`);
            }
          }
        } else {
          console.warn(`[${FN}] Tier1 failure_type=empty_response | no function_call in output`);
        }
      } catch (parseErr) {
        console.warn(`[${FN}] Tier1 failure_type=json_parse_error | ${parseErr}`);
      }
    } else {
      const errText = response ? await response.text() : "no response";
      console.warn(`[${FN}] Tier1 failure_type=api_error | status=${response?.status} | body=${errText.slice(0, 200)}`);
    }

    // Tier 2: Fallback model
    if (!aiResult) {
      console.log(`[${FN}] Tier2 attempting fallback model=${MODEL_FALLBACK}`);
      const stricterBody = buildRequestBody(STRICTER_RETRY_ADDENDUM);
      const tier2Body = mode === "rewrite" ? buildRequestBody(SEMANTIC_RETRY_ADDENDUM) : stricterBody;
      const tier2Result = await attemptAICall(OPENAI_API_KEY, MODEL_FALLBACK, tier2Body, mode, toolName, "Tier2");
      if (tier2Result) {
        const s = scoreRewriteQuality(tier2Result, mode);
        console.log(`[${FN}] Tier2 score: ${s.score}/10 (${s.quality_score_status})`);
        let tier2SemanticOk = true;
        if (mode === "rewrite") {
          const tier2Issues = validateRewriteSemantics(message, tier2Result);
          if (tier2Issues.length > 0) {
            tier2SemanticOk = false;
            console.log(`[${FN}] Tier2 semantic issues: ${JSON.stringify(tier2Issues)}`);
          }
        }
        if (tier2SemanticOk && s.quality_score_status !== "reject") {
          aiResult = tier2Result;
          rewriteScore = s;
        }
      }
    }

    // Tier 3: Rewrite mode → return error; Respond mode → deterministic fallback
    if (!aiResult) {
      if (mode === "rewrite") {
        console.log(`[${FN}] Tier3 rewrite mode — returning error (no fallback)`);
        logRequest({ userId, functionName: FN, status: "error", detail: `all_tiers_failed | mode=rewrite | original_score=${originalScoreResult.score}` });
        return jsonResponse({ error: "Unable to generate rewrite. Please try again." }, 503);
      }

      console.log(`[${FN}] Tier3 deterministic fallback | mode=respond`);
      const fallback = buildDeterministicFallback(mode, communication_context);
      const fallbackScore: RewriteQualityResult = {
        score: 7, notes: ["deterministic_fallback"], quality_score_status: "acceptable",
      };

      const { error: insertErr } = await serviceClient.from("communication_shield_history").insert(
        buildInsertRow(userId, message, mode, fallback as any, originalScoreResult, fallbackScore)
      );
      if (insertErr) console.error(`[${FN}] Tier3 insert error:`, JSON.stringify(insertErr));

      logRequest({ userId, functionName: FN, status: "error", detail: `tier3 fallback | mode=respond | original_score=${originalScoreResult.score}` });
      return jsonResponse(fallback);
    }

    // AI succeeded — persist & increment
    // Also incorporate AI's original_score (take minimum with server-side)
    const aiOriginalScore = typeof aiResult.original_score === "number" ? aiResult.original_score : null;
    if (aiOriginalScore !== null && aiOriginalScore >= 1 && aiOriginalScore <= 10) {
      originalScoreResult.score = Math.min(originalScoreResult.score, aiOriginalScore);
      originalScoreResult.notes.push(`ai_original_score: ${aiOriginalScore}`);
      if (Array.isArray(aiResult.original_score_deductions)) {
        originalScoreResult.notes.push(`ai_original_deductions: ${(aiResult.original_score_deductions as string[]).join("; ")}`);
      }
    }

    const insertPayload = buildInsertRow(userId, message, mode, aiResult, originalScoreResult, rewriteScore!);
    const { error: insertErr } = await serviceClient.from("communication_shield_history").insert(insertPayload);
    if (insertErr) console.error(`[${FN}] insert error:`, JSON.stringify(insertErr));

    if (!isAdminBypass) {
      await serviceClient.rpc("increment_message_rewrites", { p_user_id: userId });
    }

    console.log(`[${FN}] success | mode=${mode} | prompt_version=${loadedPrompt.versionLabel} | prompt_source=${loadedPrompt.source} | original_score=${originalScoreResult.score}/10 | rewrite_quality=${rewriteScore!.score}/10 (${rewriteScore!.quality_score_status})`);
    logRequest({ userId, functionName: FN, status: "success", estimatedUsage: 1 });

    // For respond mode, also populate primary_response for backward compatibility
    const responsePayload: Record<string, unknown> = {
      ...aiResult,
      mode,
      risk_flags: normalizeRiskFlags(aiResult.risk_flags as string[] | undefined, extractServerFlags(originalScoreResult.notes)),
      original_score: originalScoreResult.score,
      prompt_version: loadedPrompt.versionLabel,
      prompt_source: loadedPrompt.source,
      ...(loadedPrompt.fallbackReason ? { prompt_fallback_reason: loadedPrompt.fallbackReason } : {}),
    };
    if (mode === "rewrite") {
      responsePayload.rewrite_quality_score = rewriteScore!.score;
    }
    if (mode === "respond") {
      responsePayload.primary_response = aiResult.primary_rewrite;
      responsePayload.three_alternatives = Array.isArray(aiResult.three_alternatives) ? aiResult.three_alternatives : [];
    }
    return jsonResponse(responsePayload);
  } catch (e) {
    console.error(`[${FN}] unhandled_error | user=${userId} | error=${String(e)}`);
    logRequest({ userId, functionName: FN, status: "error", detail: String(e) });
    return jsonResponse({ error: "An error occurred processing your request." }, 500);
  }
});
