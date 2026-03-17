import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, mode, original_context, communication_context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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

You MUST respond by calling the provided tool with your structured output. Provide:
- primary_response: The best default court-safe response, concise and focused on logistics
- shorter_response: The shortest neutral version (1 sentence) that communicates the same point
- firmer_response: Still neutral and court-safe, but more boundaried and direct — sets a clear limit
- tone_assessment: A brief label like "Neutral / De-escalated" or "Professional / Factual"
- risk_flags: An array of bullet points describing what was removed, changed, or improved
- why_this_is_safer: 1-2 short sentences explaining why this response is safer than an emotional reaction`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "format_response",
              description: "Return the structured court-safe response with three variants",
              parameters: {
                type: "object",
                properties: {
                  primary_response: { type: "string", description: "The best default court-safe response" },
                  shorter_response: { type: "string", description: "Shortest neutral version, 1 sentence" },
                  firmer_response: { type: "string", description: "Neutral but more boundaried and direct" },
                  tone_assessment: { type: "string", description: "Brief tone label e.g. Neutral / De-escalated" },
                  risk_flags: {
                    type: "array",
                    items: { type: "string" },
                    description: "What was removed or improved",
                  },
                  why_this_is_safer: { type: "string", description: "1-2 sentences on why this is safer than an emotional reaction" },
                },
                required: ["primary_response", "shorter_response", "firmer_response", "tone_assessment", "risk_flags", "why_this_is_safer"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "format_response" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("rewrite-message error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
