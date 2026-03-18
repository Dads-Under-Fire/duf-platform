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
const MODEL_FALLBACK = "gpt-4o-mini"; // same model for retry; swap to a different model if desired

// ── Prompts (server-side only) ──
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
- Close the conversation loop rather than opening it`;

const RESPOND_INTRO = (originalContext?: string) =>
  `The user received a message from the other parent.${originalContext ? ` The original message received was: "${originalContext}"` : ""}

IMPORTANT — RECOMMENDATION LAYER:
Before drafting a response, evaluate whether responding is actually the safest choice based on communication strategy and legal positioning — NOT based on system availability or technical issues. Set "recommendation_type" to one of:
- "respond" — The message requires or benefits from a reply. Provide full response variants.
- "do_not_respond" — The safest action is NOT to reply based on real communication reasons such as: the message is bait or provocation, contains no actionable logistics, is emotional venting, or responding would escalate conflict. In this case, set "primary_response" to a clear explanation of why no response is recommended from a communication/legal strategy perspective. "shorter_version" and "firmer_version" should be empty strings. Optionally include a very short fallback message in "fallback_response" ONLY if the user may feel they absolutely must reply.
- "brief_boundary_response" — A very short neutral boundary statement is appropriate, but engaging further is not. Provide a minimal response in "primary_response" (1 sentence max). "shorter_version" can match. "firmer_version" should set a firmer boundary.

NEVER recommend "do_not_respond" for technical or system reasons. Only recommend it when silence or delay is the strategically safer communication choice.

Always prioritize protecting the user from unnecessary engagement.`;

const REWRITE_INTRO =
  "The user wants to REWRITE their own message so it is calmer, neutral, and court-safe.";

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
      risk_flags: { type: "array", items: { type: "string" }, description: "What was removed or improved" },
      why_this_is_safer: { type: "string", description: "1-2 sentences on why this recommendation is safer" },
    },
    required: ["recommendation_type", "primary_response", "shorter_version", "firmer_version", "fallback_response", "tone_assessment", "risk_flags", "why_this_is_safer"],
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
      risk_flags: { type: "array", items: { type: "string" }, description: "What was removed or improved" },
      why_this_is_safer: { type: "string", description: "1-2 sentences on why this is safer" },
    },
    required: ["primary_rewrite", "shorter_version", "firmer_version", "tone_assessment", "risk_flags", "why_this_is_safer"],
    additionalProperties: false,
  },
  strict: true,
};

// ── Validation helpers ──
const SHARED_REQUIRED = ["shorter_version", "firmer_version", "tone_assessment", "risk_flags", "why_this_is_safer"] as const;

const VALID_RECOMMENDATION_TYPES = ["respond", "do_not_respond", "brief_boundary_response"];

function validateRespondResult(r: Record<string, unknown>): string | null {
  if (typeof r.recommendation_type !== "string" || !VALID_RECOMMENDATION_TYPES.includes(r.recommendation_type)) return "missing/invalid recommendation_type";
  if (typeof r.primary_response !== "string" || !r.primary_response) return "missing primary_response";
  for (const k of SHARED_REQUIRED) {
    if (k === "risk_flags") {
      if (!Array.isArray(r[k])) return `missing ${k}`;
    } else if (typeof r[k] !== "string" || !(r[k] as string)) return `missing ${k}`;
  }
  return null;
}

function validateRewriteResult(r: Record<string, unknown>): string | null {
  if (typeof r.primary_rewrite !== "string" || !r.primary_rewrite) return "missing primary_rewrite";
  for (const k of SHARED_REQUIRED) {
    if (k === "risk_flags") {
      if (!Array.isArray(r[k])) return `missing ${k}`;
    } else if (typeof r[k] !== "string" || !(r[k] as string)) return `missing ${k}`;
  }
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
// These are used ONLY when AI completely fails. They are clearly marked as
// fallback/backup output and never include fake analysis fields.

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
  return fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: requestBody.replace(/"model":"[^"]+"/, `"model":"${model}"`),
  });
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

    const systemPrompt = `You are a custody communication specialist trained in court-admissible co-parent messaging.

${modeIntro}

${BASE_INSTRUCTIONS}
${contextInstruction}

You MUST call the provided tool with your structured output.`;

    const tool = mode === "respond" ? RESPOND_TOOL : REWRITE_TOOL;
    const toolName = tool.name;

    // ── 6. Three-tier OpenAI call ──
    const requestBody = JSON.stringify({
      model: MODEL_PRIMARY,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      tools: [{ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters, strict: tool.strict } }],
      tool_choice: { type: "function", function: { name: tool.name } },
    });

    let aiResult: Record<string, unknown> | null = null;
    let usedFallback = false;

    // Tier 1: Primary model attempt (with 429 retry)
    let response: Response | null = null;
    const MAX_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      response = await callOpenAI(OPENAI_API_KEY, MODEL_PRIMARY, requestBody);

      if (response.status !== 429) break;

      const retryAfter = response.headers.get("Retry-After");
      const waitMs = getRetryDelayMs(retryAfter, attempt);
      console.log(`[${FN}] Tier1 429, retry ${attempt + 1}/${MAX_RETRIES} after ${Math.round(waitMs)}ms`);
      await response.text();
      await new Promise((r) => setTimeout(r, waitMs));
    }

    // Try to extract result from Tier 1
    if (response && response.ok) {
      try {
        const aiData = await response.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall?.function?.arguments) {
          const parsed = JSON.parse(toolCall.function.arguments);
          const validationError = mode === "respond"
            ? validateRespondResult(parsed)
            : validateRewriteResult(parsed);
          if (!validationError) {
            aiResult = parsed;
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

    // Tier 2: Retry with fallback model (if Tier 1 failed)
    if (!aiResult) {
      console.log(`[${FN}] Tier2 attempting fallback model=${MODEL_FALLBACK}`);
      try {
        const tier2Response = await callOpenAI(OPENAI_API_KEY, MODEL_FALLBACK, requestBody);
        if (tier2Response.ok) {
          const aiData = await tier2Response.json();
          const functionCall = aiData.output?.find(
            (item: any) => item.type === "function_call" && item.name === toolName
          );
          if (functionCall) {
            const parsed = JSON.parse(functionCall.arguments);
            const validationError = mode === "respond"
              ? validateRespondResult(parsed)
              : validateRewriteResult(parsed);
            if (!validationError) {
              aiResult = parsed;
              console.log(`[${FN}] Tier2 succeeded`);
            } else {
              console.warn(`[${FN}] Tier2 validation failed: ${validationError}`);
            }
          }
        } else {
          const t2Err = await tier2Response.text();
          console.warn(`[${FN}] Tier2 failed: status=${tier2Response.status} body=${t2Err}`);
        }
      } catch (tier2Err) {
        console.warn(`[${FN}] Tier2 error: ${tier2Err}`);
      }
    }

    // Tier 3: Deterministic fallback (always succeeds)
    if (!aiResult) {
      console.log(`[${FN}] Tier3 deterministic fallback | mode=${mode} | context=${communication_context ?? "none"}`);
      const fallback = buildDeterministicFallback(mode, communication_context);
      usedFallback = true;

      // Persist fallback (no quota increment for fallback)
      await serviceClient.from("communication_shield_history").insert({
        user_id: userId,
        original_message: message,
        mode,
        primary_response: mode === "respond" ? (fallback as any).primary_response : null,
        primary_rewrite: mode === "rewrite" ? (fallback as any).primary_rewrite : null,
        recommendation_type: (fallback as any).recommendation_type ?? null,
        shorter_version: null,
        firmer_version: null,
        tone_assessment: "Fallback",
        risk_flags: [],
        why_this_is_safer: null,
      });

      logRequest({ userId, functionName: FN, status: "fallback", detail: `tier3 deterministic | mode=${mode}` });
      return jsonResponse(fallback);
    }

    // ── 7. AI succeeded — persist & increment ──
    await serviceClient.from("communication_shield_history").insert({
      user_id: userId,
      original_message: message,
      mode,
      primary_response: mode === "respond" ? (aiResult.primary_response as string) : null,
      primary_rewrite: mode === "rewrite" ? (aiResult.primary_rewrite as string) : null,
      recommendation_type: (aiResult.recommendation_type as string) ?? null,
      shorter_version: aiResult.shorter_version as string,
      firmer_version: aiResult.firmer_version as string,
      tone_assessment: aiResult.tone_assessment as string,
      risk_flags: aiResult.risk_flags as string[],
      why_this_is_safer: aiResult.why_this_is_safer as string,
    });

    await serviceClient.rpc("increment_message_rewrites", { p_user_id: userId });

    console.log(`[${FN}] success | user=${userId} | mode=${mode} | recommendation=${aiResult.recommendation_type ?? "n/a"} | tone=${aiResult.tone_assessment}`);
    logRequest({ userId, functionName: FN, status: "success", estimatedUsage: 1 });

    return jsonResponse({ ...aiResult, mode });
  } catch (e) {
    console.error(`[${FN}] unhandled_error | user=${userId} | error=${String(e)}`);
    logRequest({ userId, functionName: FN, status: "error", detail: String(e) });
    return jsonResponse({ error: "An error occurred processing your request." }, 500);
  }
});
