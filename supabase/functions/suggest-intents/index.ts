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
    const { message, mode } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are a custody communication specialist. Based on the message provided, suggest 4-6 short communication intent options that would be appropriate responses.

${mode === "respond"
  ? "The user received this message from the other parent and wants to respond."
  : "The user wrote this message and wants to rewrite it to be court-safe."
}

Analyze the tone, content, and context of the message. Generate intent options that are relevant to what the message is about. For example:
- If the message is hostile or insulting, include options like "Set a boundary", "Acknowledge without engaging"
- If the message is about schedules or lateness, include options like "Explain a delay", "Confirm the plan", "Propose alternative time"
- If the message is about logistics, include logistics-related intents
- If the message is about finances, include finance-related intents

Always include "General neutral response" as the last option.

If you cannot confidently classify the message or determine relevant intents, return this exact fallback list:
- "Set a boundary"
- "Ask for clarification"
- "Acknowledge without engaging"
- "General neutral response"

Each option should be a short phrase (2-5 words) describing the communication intent. Return exactly 4-6 options. Never return an empty list.

You MUST respond by calling the provided tool.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        tools: [
          {
            type: "function",
            function: {
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
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_intents" } },
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    let result: unknown;
    const rawArgs = toolCall.function.arguments;
    try {
      result = JSON.parse(rawArgs);
    } catch {
      // Attempt to recover truncated JSON array
      const lastBrace = rawArgs.lastIndexOf("}");
      if (lastBrace > 0) {
        try {
          result = JSON.parse(rawArgs.substring(0, lastBrace + 1) + "]");
          console.warn("Recovered truncated JSON from tool call arguments");
        } catch {
          console.error("Cannot repair truncated JSON:", rawArgs);
          result = { options: ["Set a boundary", "Ask for clarification", "Acknowledge without engaging", "General neutral response"] };
        }
      } else {
        console.error("Cannot parse tool call arguments:", rawArgs);
        result = { options: ["Set a boundary", "Ask for clarification", "Acknowledge without engaging", "General neutral response"] };
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-intents error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
