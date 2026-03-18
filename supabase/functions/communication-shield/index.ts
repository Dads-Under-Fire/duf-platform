import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  jsonResponse,
  logRequest,
  checkRateLimit,
  authenticateRequest,
} from "../_shared/auth-rate-limit.ts";

const FN = "communication-shield";
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const MODEL = "gpt-5.4-mini";

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

    if (!quotaRows[0].allowed) {
      logRequest({ userId, functionName: FN, status: "rate_limited", detail: "quota exhausted" });
      return jsonResponse({ error: "You've used all your message rewrites." }, 429);
    }

    // ── 5. OpenAI Responses API call ──
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const contextInstruction = communication_context
      ? `\nThe user selected the following communication context: "${communication_context}". Tailor the response to match this intent while remaining neutral, factual, and court-safe.`
      : "";

    const systemPrompt = `You are a custody communication specialist trained in court-admissible co-parent messaging.

${mode === "respond"
  ? `The user received a message from the other parent. Generate a neutral, factual, court-safe RESPONSE to that message.${original_context ? ` The original message received was: "${original_context}"` : ""}`
  : "The user wants to REWRITE their own message so it is calmer, neutral, and court-safe."
}

All responses must:
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
${contextInstruction}

You MUST call the provided tool with your structured output.`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        input: [
          { role: "developer", content: systemPrompt },
          { role: "user", content: message },
        ],
        tools: [
          {
            type: "function",
            name: "format_response",
            description: "Return the structured court-safe response with three variants",
            parameters: {
              type: "object",
              properties: {
                primary_response: { type: "string", description: "The best default court-safe response" },
                shorter_version: { type: "string", description: "Shortest neutral version, 1 sentence" },
                firmer_version: { type: "string", description: "Neutral but more boundaried and direct" },
                tone_assessment: { type: "string", description: "Brief tone label e.g. Neutral / De-escalated" },
                risk_flags: { type: "array", items: { type: "string" }, description: "What was removed or improved" },
                why_this_is_safer: { type: "string", description: "1-2 sentences on why this is safer" },
              },
              required: ["primary_response", "shorter_version", "firmer_version", "tone_assessment", "risk_flags", "why_this_is_safer"],
              additionalProperties: false,
            },
            strict: true,
          },
        ],
        tool_choice: "required",
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        logRequest({ userId, functionName: FN, status: "rate_limited", detail: "OpenAI 429" });
        return jsonResponse({ error: "Rate limit exceeded. Please try again in a moment." }, 429);
      }
      const t = await response.text();
      console.error("OpenAI error:", response.status, t);
      throw new Error("OpenAI API error");
    }

    const aiData = await response.json();

    // Responses API returns output array with function_call items
    const functionCall = aiData.output?.find((item: any) => item.type === "function_call");
    if (!functionCall) throw new Error("No function call in AI response");

    const result = JSON.parse(functionCall.arguments);

    // ── 6. Persist & increment ──
    await serviceClient.from("message_rewrites").insert({
      user_id: userId,
      original_message: message,
      rewritten_message: result.primary_response,
      tone_assessment: result.tone_assessment,
      risk_flags: result.risk_flags,
      mode: mode || "respond",
    });

    await serviceClient.rpc("increment_message_rewrites", { p_user_id: userId });

    logRequest({ userId, functionName: FN, status: "success", estimatedUsage: 1 });

    return jsonResponse(result);
  } catch (e) {
    console.error("communication-shield error:", e);
    logRequest({ userId, functionName: FN, status: "error", detail: String(e) });
    return jsonResponse({ error: "An error occurred processing your request." }, 500);
  }
});
