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
const MODEL = "gpt-5.4-mini";

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
Before drafting a response, evaluate whether responding is actually the safest choice. Set "recommendation_type" to one of:
- "respond" — The message requires or benefits from a reply. Provide full response variants.
- "do_not_respond" — The safest action is NOT to reply (e.g. bait, provocation, no actionable content, emotional venting). In this case, set "primary_response" to a clear explanation of why no response is recommended. "shorter_version" and "firmer_version" should also reflect the do-not-respond advice. Optionally include a very short fallback message in "fallback_response" ONLY if the user may feel they absolutely must reply.
- "brief_boundary_response" — A very short neutral boundary statement is appropriate, but engaging further is not. Provide a minimal response in "primary_response" (1 sentence max). "shorter_version" can match. "firmer_version" should set a firmer boundary.

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

function buildRateLimitedFallback(mode: "respond" | "rewrite") {
  if (mode === "respond") {
    return {
      mode,
      recommendation_type: "do_not_respond",
      primary_response: "No response is recommended right now because guidance is temporarily unavailable. Waiting briefly is safer than sending a reactive reply.",
      shorter_version: "Do not respond right now—pause and retry shortly.",
      firmer_version: "Do not send a reply at this time. Wait, then retry for a court-safe response.",
      fallback_response: "Received. I will respond after reviewing the schedule.",
      tone_assessment: "Protective / Pause Recommended",
      risk_flags: [
        "AI service temporarily unavailable",
        "Avoided potentially escalatory immediate response",
      ],
      why_this_is_safer: "A short pause reduces the chance of reactive language. Retrying shortly helps ensure a neutral, court-safe response.",
    };
  }

  return {
    mode,
    primary_rewrite: "Rewrite guidance is temporarily unavailable. Please wait a moment and retry before sending your message.",
    shorter_version: "Hold this message and retry shortly.",
    firmer_version: "Do not send yet—retry in a moment for a court-safe rewrite.",
    tone_assessment: "Pause Recommended",
    risk_flags: [
      "AI rewrite service temporarily unavailable",
      "Prevented sending an unreviewed draft",
    ],
    why_this_is_safer: "Waiting avoids sending language that may escalate conflict. A short retry window helps preserve neutral, court-safe wording.",
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
    // Note: plan info logged after quota check below
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

    // ── 6. OpenAI Responses API call (with retry on 429) ──
    const requestBody = JSON.stringify({
      model: MODEL,
      input: [
        { role: "developer", content: systemPrompt },
        { role: "user", content: message },
      ],
      tools: [tool],
      tool_choice: "required",
    });

    let response: Response | null = null;
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: requestBody,
      });

      if (response.status !== 429) break;

      // Retry with exponential backoff + jitter
      const retryAfter = response.headers.get("Retry-After");
      const waitMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : Math.pow(2, attempt) * 1000 + Math.random() * 500;
      console.log(`[${FN}] OpenAI 429, retry ${attempt + 1}/${MAX_RETRIES} after ${Math.round(waitMs)}ms`);
      await response.text(); // consume body
      await new Promise((r) => setTimeout(r, waitMs));
    }

    if (!response || !response.ok) {
      if (response?.status === 429) {
        logRequest({ userId, functionName: FN, status: "rate_limited", detail: "OpenAI 429 after retries" });
        return jsonResponse({ error: "The service is temporarily busy. Please try again in a moment." }, 429);
      }
      const t = response ? await response.text() : "no response";
      console.error("OpenAI error:", response?.status, t);
      throw new Error("OpenAI API error");
    }

    const aiData = await response.json();

    // Responses API: output[] → find function_call matching our tool
    const functionCall = aiData.output?.find(
      (item: any) => item.type === "function_call" && item.name === toolName
    );
    if (!functionCall) throw new Error("No function call in AI response");

    const result = JSON.parse(functionCall.arguments);

    // ── 7. Validate structured output ──
    const validationError = mode === "respond"
      ? validateRespondResult(result)
      : validateRewriteResult(result);

    if (validationError) {
      console.error(`[${FN}] validation_failed | user=${userId} | mode=${mode} | error=${validationError}`);
      logRequest({ userId, functionName: FN, status: "error", detail: `validation: ${validationError}` });
      return jsonResponse({ error: "AI returned an incomplete response. Please try again." }, 502);
    }

    // ── 8. Persist & increment (only after success) ──
    const primaryText = mode === "respond" ? result.primary_response : result.primary_rewrite;

    await serviceClient.from("message_rewrites").insert({
      user_id: userId,
      original_message: message,
      rewritten_message: primaryText,
      tone_assessment: result.tone_assessment,
      risk_flags: result.risk_flags,
      mode,
    });

    await serviceClient.rpc("increment_message_rewrites", { p_user_id: userId });

    console.log(`[${FN}] success | user=${userId} | mode=${mode} | recommendation=${result.recommendation_type ?? "n/a"} | tone=${result.tone_assessment}`);
    logRequest({ userId, functionName: FN, status: "success", estimatedUsage: 1 });

    // Return result with mode field so frontend knows which key to read
    return jsonResponse({ ...result, mode });
  } catch (e) {
    console.error(`[${FN}] unhandled_error | user=${userId} | error=${String(e)}`);
    logRequest({ userId, functionName: FN, status: "error", detail: String(e) });
    return jsonResponse({ error: "An error occurred processing your request." }, 500);
  }
});
