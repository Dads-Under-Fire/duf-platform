import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  jsonResponse,
  logRequest,
  checkRateLimit,
  authenticateRequest,
} from "../_shared/auth-rate-limit.ts";

const FN = "evidence-analyzer";
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const MODEL = "gpt-5.4";

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
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
    const { content, analysis_type } = body;

    if (!content || typeof content !== "string" || content.length > 50000) {
      logRequest({ userId, functionName: FN, status: "invalid_input", detail: "bad content" });
      return jsonResponse({ error: "Invalid content" }, 400);
    }

    const validTypes = ["general", "tone", "timeline", "contradiction", "legal"];
    const type = validTypes.includes(analysis_type) ? analysis_type : "general";

    const wordCount = countWords(content);

    // ── 4. Quota check ──
    const { serviceClient } = auth;

    const { data: quotaRows, error: quotaError } = await serviceClient.rpc(
      "check_evidence_analysis_quota",
      { p_user_id: userId, p_word_count: wordCount }
    );

    if (quotaError || !quotaRows || quotaRows.length === 0) {
      console.error("Quota check failed:", quotaError);
      logRequest({ userId, functionName: FN, status: "error", detail: "quota check failed" });
      return jsonResponse({ error: "Could not verify quota" }, 500);
    }

    if (!quotaRows[0].allowed) {
      const unit = quotaRows[0].unit;
      const msg = unit === "words"
        ? "You've reached your monthly evidence word limit."
        : "You've used all your free evidence analyses.";
      logRequest({ userId, functionName: FN, status: "rate_limited", detail: "quota exhausted" });
      return jsonResponse({ error: msg }, 429);
    }

    // ── 5. OpenAI Responses API call ──
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const typeInstructions: Record<string, string> = {
      general: "Perform a comprehensive analysis covering tone, factual claims, potential legal relevance, and recommended actions.",
      tone: "Focus specifically on tone analysis: identify emotional language, hostility, manipulation, gaslighting, or passive-aggression.",
      timeline: "Extract and organize all dates, times, and chronological events mentioned. Flag inconsistencies.",
      contradiction: "Identify contradictions, inconsistencies, or statements that conflict with common co-parenting agreements.",
      legal: "Analyze for legal relevance: identify statements that could be relevant in custody proceedings, violations of court orders, or admissible evidence.",
    };

    const systemPrompt = `You are a custody evidence analysis specialist. Analyze the provided text evidence for a custody or family law case.

${typeInstructions[type]}

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
          { role: "user", content: content },
        ],
        tools: [
          {
            type: "function",
            name: "analyze_evidence",
            description: "Return structured evidence analysis results",
            parameters: {
              type: "object",
              properties: {
                summary: { type: "string", description: "2-3 sentence executive summary" },
                tone_analysis: { type: "string", description: "Overall tone assessment" },
                key_findings: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      finding: { type: "string" },
                      severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
                    },
                    required: ["finding", "severity"],
                    additionalProperties: false,
                  },
                  description: "Important findings with severity levels",
                },
                red_flags: {
                  type: "array",
                  items: { type: "string" },
                  description: "Concerning patterns or statements",
                },
                recommended_actions: {
                  type: "array",
                  items: { type: "string" },
                  description: "Suggested next steps",
                },
                legal_relevance: { type: "string", description: "Legal context assessment" },
                word_count: { type: "number", description: "Words analyzed" },
              },
              required: ["summary", "tone_analysis", "key_findings", "red_flags", "recommended_actions", "legal_relevance", "word_count"],
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
    await serviceClient.from("evidence_analyses").insert({
      user_id: userId,
      original_content: content,
      analysis_result: JSON.stringify(result),
      analysis_type: type,
    });

    await serviceClient.rpc("increment_evidence_analyses", {
      p_user_id: userId,
      p_word_count: wordCount,
    });

    logRequest({ userId, functionName: FN, status: "success", estimatedUsage: wordCount });

    return jsonResponse({ ...result, word_count: wordCount });
  } catch (e) {
    console.error("evidence-analyzer error:", e);
    logRequest({ userId, functionName: FN, status: "error", detail: String(e) });
    return jsonResponse({ error: "An error occurred processing your request." }, 500);
  }
});
