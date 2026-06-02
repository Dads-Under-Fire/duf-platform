import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  jsonResponse,
  logRequest,
  checkRateLimit,
  authenticateRequest,
} from "../_shared/auth-rate-limit.ts";

// Canonical 9-pattern taxonomy — MUST stay in sync with src/lib/caseIntelligencePatterns.ts
const CANONICAL_PATTERNS = [
  { slug: "possession_interference", name: "Possession Interference / Failure to Surrender", definition: "Repeated conduct that blocks, delays, shortens, conditions, or disrupts court-ordered or agreed parenting time, exchanges, or surrender of the child." },
  { slug: "medical_decision_neglect", name: "Medical Decision Making / Delayed Medical Care or Notice", definition: "Repeated failures, delays, or unilateral conduct affecting medical care, treatment follow-up, appointments, medication, referrals, or timely medical notice to the other parent." },
  { slug: "medical_records_exclusion", name: "Removal or Exclusion from Child-Related Records / Providers / Systems", definition: "Repeated conduct excluding a parent from access to providers, portals, records, contact lists, notices, school/daycare systems, or other child-related information or participation channels." },
  { slug: "communication_violations", name: "Communication Violations", definition: "Repeated failures to use required communication channels, failure to respond appropriately, bypassing court-ordered tools, or repeated noncompliant communication behavior." },
  { slug: "harassment_threats_coercion", name: "Harassment / Threats / Coercive Language", definition: "Repeated hostile, threatening, intimidating, manipulative, or coercive communication directed at the other parent." },
  { slug: "unilateral_decision_making", name: "Unilateral Decision Making", definition: "Repeated significant decisions made without required notice, consultation, agreement, or co-parent participation in areas where joint involvement is expected." },
  { slug: "withholding_information", name: "Withholding Required Information", definition: "Repeated failure to provide important information the other parent should receive, including schedules, medical updates, school information, provider details, or logistics." },
  { slug: "escalation_after_accountability", name: "Escalation After Accountability", definition: "Repeated increases in conflict, obstruction, retaliation, or adverse conduct shortly after legal filings, complaints, boundary-setting, documentation, or attempts at accountability." },
  { slug: "failure_to_coparent", name: "Failure to Co-Parent / Persistent Conflict Pattern", definition: "Ongoing behavior showing chronic noncooperation, unnecessary conflict, refusal to coordinate, or repeated conduct undermining stable co-parenting across time. Broad synthesis category — apply only when narrower patterns do not capture the conduct." },
] as const;
const CANONICAL_SLUGS = CANONICAL_PATTERNS.map((p) => p.slug);
const CANONICAL_NAME_BY_SLUG: Record<string, string> = Object.fromEntries(
  CANONICAL_PATTERNS.map((p) => [p.slug, p.name]),
);

const FN = "analyze-case";
// Stage 1 (pattern classification) uses the strongest non-mini GPT model wired into this project.
const ANALYZE_MODEL = "gpt-5.4";
// Stage 2 (summary) keeps the lighter model — purely descriptive headline/overview.
const SUMMARY_MODEL = "gpt-5.4-mini";

// ── Structured output tool schemas ──
const ANALYZE_TOOL = {
  type: "function" as const,
  name: "report_patterns",
  description: "Classify the case entries into one or more canonical DUF v1 patterns.",
  parameters: {
    type: "object",
    properties: {
      patterns: {
        type: "array",
        items: {
          type: "object",
          properties: {
            slug: { type: "string", enum: CANONICAL_SLUGS },
            explanation: { type: "string", description: "Behavioral, neutral, court-safe summary. Not a legal conclusion." },
            related_entry_ids: { type: "array", items: { type: "string" } },
          },
          required: ["slug", "explanation", "related_entry_ids"],
          additionalProperties: false,
        },
      },
    },
    required: ["patterns"],
    additionalProperties: false,
  },
};

const SUMMARY_TOOL = {
  type: "function" as const,
  name: "report_summary",
  description: "Case-level summary headline and overview.",
  parameters: {
    type: "object",
    properties: {
      headline: { type: "string" },
      overview: { type: "string" },
    },
    required: ["headline", "overview"],
    additionalProperties: false,
  },
};

async function loadPrompt(serviceClient: any, stageKey: string): Promise<string | null> {
  const { data } = await serviceClient
    .from("ai_system_prompts")
    .select("prompt_text")
    .eq("feature_key", "case_intelligence")
    .eq("stage_key", stageKey)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.prompt_text ?? null;
}

async function callOpenAI(apiKey: string, body: Record<string, unknown>, model: string): Promise<any | null> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, model }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.warn(`[${FN}] openai_error model=${model} status=${res.status} ${txt.slice(0, 300)}`);
    return null;
  }
  return await res.json();
}

async function callTool(
  apiKey: string,
  systemPrompt: string,
  userPayload: string,
  tool: typeof ANALYZE_TOOL | typeof SUMMARY_TOOL,
  model: string,
): Promise<Record<string, unknown> | null> {
  const body = {
    input: [
      { role: "developer", content: systemPrompt },
      { role: "user", content: userPayload },
    ],
    tools: [tool],
    tool_choice: "required",
  };
  const data = await callOpenAI(apiKey, body, model);
  if (!data) return null;
  const fc = data.output?.find((it: any) => it.type === "function_call" && it.name === tool.name);
  if (!fc) return null;
  try {
    return JSON.parse(fc.arguments);
  } catch {
    return null;
  }
}

async function refundCredit(serviceClient: any, userId: string): Promise<void> {
  try {
    const { data: row } = await serviceClient.rpc("ensure_current_usage_period", { p_user_id: userId });
    const usageRow = Array.isArray(row) ? row[0] : row;
    if (!usageRow?.id) return;
    await serviceClient
      .from("usage_counters")
      .update({
        case_intelligence_analyses_used: Math.max(0, (usageRow.case_intelligence_analyses_used ?? 1) - 1),
        updated_at: new Date().toISOString(),
      })
      .eq("id", usageRow.id);
  } catch (e) {
    console.error(`[${FN}] refund_failed`, e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId, serviceClient } = await authenticateRequest(req, FN).catch((r) => {
      throw r;
    });

    if (!checkRateLimit(`${userId}:${FN}`, 5, 60_000)) {
      logRequest({ userId, functionName: FN, status: "rate_limited" });
      return jsonResponse({ error: "Too many requests. Try again in a moment." }, 429);
    }

    const body = await req.json().catch(() => ({}));
    const caseId = body?.case_id;
    if (!caseId || typeof caseId !== "string") {
      return jsonResponse({ error: "case_id is required" }, 400);
    }

    // Verify ownership
    const { data: caseRow, error: caseErr } = await serviceClient
      .from("cases")
      .select("id, user_id, case_name")
      .eq("id", caseId)
      .maybeSingle();
    if (caseErr || !caseRow || caseRow.user_id !== userId) {
      return jsonResponse({ error: "Case not found" }, 404);
    }

    // Load entries
    const { data: entries, error: entriesErr } = await serviceClient
      .from("case_log_entries")
      .select("*")
      .eq("case_id", caseId)
      .eq("user_id", userId)
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true });
    if (entriesErr) throw entriesErr;

    if (!entries || entries.length === 0) {
      // Don't consume credit
      return jsonResponse({ error: "No case log entries to analyze." }, 400);
    }

    const entryIds = entries.map((e: any) => e.id);
    const { data: attachments } = await serviceClient
      .from("case_log_attachments")
      .select("case_log_entry_id, file_name, file_type, file_size_bytes, evidence_note")
      .in("case_log_entry_id", entryIds);

    const attByEntry = new Map<string, any[]>();
    (attachments ?? []).forEach((a: any) => {
      const arr = attByEntry.get(a.case_log_entry_id) ?? [];
      arr.push(a);
      attByEntry.set(a.case_log_entry_id, arr);
    });

    const normalizedEntries = entries.map((e: any) => ({
      id: e.id,
      entry_type: e.entry_type,
      event_date: e.event_date,
      event_time: e.event_time,
      context: e.context,
      summary: e.summary,
      child_impact: e.child_impact,
      communication_involved: e.communication_involved,
      metadata: e.metadata ?? null,
      attachments: (attByEntry.get(e.id) ?? []).map((a) => ({
        file_name: a.file_name,
        file_type: a.file_type,
        file_size_bytes: a.file_size_bytes,
        evidence_note: a.evidence_note,
      })),
    }));

    const maxUpdated = entries.reduce<string | null>(
      (m: string | null, e: any) => (!m || e.updated_at > m ? e.updated_at : m),
      null,
    );

    // Load prompts
    const analyzePromptBase = await loadPrompt(serviceClient, "analyze_patterns");
    const summaryPromptBase = await loadPrompt(serviceClient, "summarize_analysis");
    if (!analyzePromptBase || !summaryPromptBase) {
      return jsonResponse({ error: "Case Intelligence prompts not configured." }, 500);
    }

    const taxonomyBlock =
      "CANONICAL DUF v1 PATTERN TAXONOMY — you MUST only emit slugs from this list:\n" +
      CANONICAL_PATTERNS.map((p) => `- ${p.slug} — ${p.name}\n  ${p.definition}`).join("\n") +
      "\n\nIMPORTANT: Patterns are behavioral classifications, not legal conclusions. " +
      "Use entry terminology (not event). Only include patterns supported by ≥2 entries. " +
      "related_entry_ids MUST be a subset of the entry IDs in the payload.";

    const analyzeSystem = `${analyzePromptBase}\n\n${taxonomyBlock}`;
    const userPayload = JSON.stringify({ case_name: caseRow.case_name, entries: normalizedEntries });

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return jsonResponse({ error: "OPENAI_API_KEY not configured" }, 500);
    }

    // Run analyze (strong model) + summary (mini) in parallel
    const [analyzeRaw, summaryRaw] = await Promise.all([
      callTool(OPENAI_API_KEY, analyzeSystem, userPayload, ANALYZE_TOOL, ANALYZE_MODEL),
      callTool(OPENAI_API_KEY, summaryPromptBase, userPayload, SUMMARY_TOOL, SUMMARY_MODEL),
    ]);

    if (!analyzeRaw || !summaryRaw) {
      return jsonResponse({ error: "AI analysis failed. Please try again." }, 502);
    }

    // Validate & filter patterns
    const validEntryIds = new Set(entryIds);
    const rawPatterns = Array.isArray((analyzeRaw as any).patterns) ? (analyzeRaw as any).patterns : [];
    const seenSlugs = new Set<string>();
    const cleanPatterns: Array<{
      slug: string;
      name: string;
      explanation: string;
      related_entry_ids: string[];
      first_entry_date: string | null;
      last_entry_date: string | null;
    }> = [];

    for (const p of rawPatterns) {
      if (!p || typeof p.slug !== "string") continue;
      if (!CANONICAL_SLUGS.includes(p.slug as any)) continue;
      if (seenSlugs.has(p.slug)) continue;
      const related = Array.isArray(p.related_entry_ids)
        ? p.related_entry_ids.filter((id: any) => typeof id === "string" && validEntryIds.has(id))
        : [];
      if (related.length === 0) continue;
      const dates = related
        .map((id: string) => entries.find((e: any) => e.id === id)?.event_date)
        .filter(Boolean)
        .sort();
      seenSlugs.add(p.slug);
      cleanPatterns.push({
        slug: p.slug,
        name: CANONICAL_NAME_BY_SLUG[p.slug],
        explanation: typeof p.explanation === "string" ? p.explanation : "",
        related_entry_ids: related,
        first_entry_date: dates[0] ?? null,
        last_entry_date: dates[dates.length - 1] ?? null,
      });
    }

    // ── Consume credit only now that we have a valid result we are about to persist ──
    const { data: quotaData, error: quotaErr } = await serviceClient.rpc(
      "consume_case_intelligence_analysis",
      { p_user_id: userId },
    );
    if (quotaErr) throw quotaErr;
    const quotaRow = Array.isArray(quotaData) ? quotaData[0] : quotaData;
    if (!quotaRow?.allowed) {
      return jsonResponse(
        { error: "quota_exceeded", used: quotaRow?.used ?? 0, limit: quotaRow?.limit ?? 0 },
        402,
      );
    }

    // ── Insert analysis row (refund on failure) ──
    const summary = {
      headline: (summaryRaw as any).headline ?? "",
      overview: (summaryRaw as any).overview ?? "",
      pattern_count: cleanPatterns.length,
      entry_count: entries.length,
      generated_at: new Date().toISOString(),
    };

    const { data: analysisRow, error: aErr } = await serviceClient
      .from("case_intelligence_analyses")
      .insert({
        user_id: userId,
        case_id: caseId,
        status: "completed",
        entries_snapshot_max_updated_at: maxUpdated,
        summary,
      })
      .select()
      .single();
    if (aErr) {
      await refundCredit(serviceClient, userId);
      throw aErr;
    }

    // ── Insert pattern rows; on failure, roll back the analysis row AND refund the credit ──
    if (cleanPatterns.length > 0) {
      const patternRows = cleanPatterns.map((p) => ({
        analysis_id: analysisRow.id,
        user_id: userId,
        case_id: caseId,
        slug: p.slug,
        name: p.name,
        explanation: p.explanation,
        related_entry_ids: p.related_entry_ids,
        first_entry_date: p.first_entry_date,
        last_entry_date: p.last_entry_date,
      }));
      const { error: pErr } = await serviceClient
        .from("case_intelligence_patterns")
        .insert(patternRows);
      if (pErr) {
        await serviceClient.from("case_intelligence_analyses").delete().eq("id", analysisRow.id);
        await refundCredit(serviceClient, userId);
        throw pErr;
      }
    }


    logRequest({ userId, functionName: FN, status: "success", estimatedUsage: 1 });
    return jsonResponse({
      analysis_id: analysisRow.id,
      pattern_count: cleanPatterns.length,
      entry_count: entries.length,
      summary,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(`[${FN}] error`, e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
