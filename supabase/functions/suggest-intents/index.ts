import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  jsonResponse,
  logRequest,
  checkRateLimit,
  authenticateRequest,
} from "../_shared/auth-rate-limit.ts";

const FN = "suggest-intents";
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const MODEL = "gpt-4o-mini";
const FALLBACK = { options: ["Confirm the plan", "Decline the request", "Clarify timing", "Request missing details"] };

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
    const { message, mode } = body;

    if (!message || typeof message !== "string" || message.length > 4000) {
      logRequest({ userId, functionName: FN, status: "invalid_input", detail: "bad message" });
      return jsonResponse({ error: "Invalid message" }, 400);
    }
    if (mode !== "respond" && mode !== "rewrite") {
      logRequest({ userId, functionName: FN, status: "invalid_input", detail: "bad mode" });
      return jsonResponse({ error: "Invalid mode" }, 400);
    }

    // ── 4. OpenAI Responses API call ──
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const systemPrompt = `You are a custody communication specialist. The user received a message from their co-parent and needs to choose HOW to respond.

Generate 4-6 short, PRACTICAL response intent options (2-5 words each) that represent concrete answer paths.

GOOD intent examples (use these as models):
- Confirm the plan
- Decline the request
- Clarify timing
- Request missing details
- Confirm later
- Keep it logistics-only
- Set a boundary while answering
- Confirm attendance
- Clarify payment details
- Request documentation
- Decline and suggest alternative
- Acknowledge and confirm

BAD intent examples (NEVER generate these — too abstract):
- Express frustration
- Discuss alternatives
- Address miscommunication
- General neutral response
- Address past involvement
- Acknowledge feelings
- Share perspective

RULES:
- Every option must map to a CONCRETE action the user could take in their reply
- If the message contains a yes/no question, include "Confirm" and "Decline" options
- If the message mentions scheduling, include timing-specific options
- If the message mentions money/costs, include financial-specific options
- Do NOT end with "General neutral response" — every option should be specific
- Focus on WHAT the reply will say, not how it will feel`;


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
            name: "suggest_intents",
            description: "Return suggested communication intent options",
            parameters: {
              type: "object",
              properties: {
                options: {
                  type: "array",
                  items: { type: "string" },
                  description: "4-6 short communication intent phrases",
                },
              },
              required: ["options"],
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
        // Non-critical function: return fallback intents instead of propagating 429
        return jsonResponse(FALLBACK);
      }
      if (response.status === 402) {
        logRequest({ userId, functionName: FN, status: "error", detail: "OpenAI 402" });
        return jsonResponse({ error: "Usage limit reached. Please add credits." }, 402);
      }
      const t = await response.text();
      console.error("OpenAI error:", response.status, t);
      logRequest({ userId, functionName: FN, status: "error", detail: `OpenAI ${response.status}` });
      return jsonResponse(FALLBACK);
    }

    const aiData = await response.json();

    // Responses API returns output array with function_call items
    const functionCall = aiData.output?.find((item: any) => item.type === "function_call");
    if (!functionCall) {
      console.error("No function call in response, returning fallback");
      logRequest({ userId, functionName: FN, status: "error", detail: "no function call" });
      return jsonResponse(FALLBACK);
    }

    let result: unknown;
    try {
      result = JSON.parse(functionCall.arguments);
    } catch {
      console.error("JSON parse failed, returning fallback");
      result = FALLBACK;
    }

    logRequest({ userId, functionName: FN, status: "success", estimatedUsage: 1 });
    return jsonResponse(result as Record<string, unknown>);
  } catch (e) {
    console.error("suggest-intents error:", e);
    logRequest({ userId, functionName: FN, status: "error", detail: String(e) });
    return jsonResponse(FALLBACK);
  }
});
