import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { CaseLogEntry, CaseLogAttachment, CaseLogEntryType } from "@/types/caseLog";

// ---------- Timeline (all entries for case) ----------
export function useCaseTimeline(caseId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["case_timeline", caseId],
    enabled: !!user && !!caseId,
    queryFn: async () => {
      const { data: entries, error } = await supabase
        .from("case_log_entries")
        .select("*")
        .eq("case_id", caseId!)
        .eq("user_id", user!.id)
        .order("event_date", { ascending: false })
        .order("event_time", { ascending: false });
      if (error) throw error;

      const ids = entries.map((e) => e.id);
      const counts: Record<string, number> = {};
      if (ids.length) {
        const { data: atts } = await supabase
          .from("case_log_attachments")
          .select("case_log_entry_id")
          .in("case_log_entry_id", ids);
        atts?.forEach((a) => {
          counts[a.case_log_entry_id] = (counts[a.case_log_entry_id] || 0) + 1;
        });
      }
      return entries.map((e) => ({ ...e, attachment_count: counts[e.id] || 0 })) as (CaseLogEntry & { attachment_count: number })[];
    },
  });
}

// ---------- Evidence (attachments joined to parent entry) ----------
export interface EvidenceRow {
  attachment: CaseLogAttachment;
  entry: CaseLogEntry | null;
}
export function useCaseEvidence(caseId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["case_evidence", caseId],
    enabled: !!user && !!caseId,
    queryFn: async (): Promise<EvidenceRow[]> => {
      const { data: atts, error } = await supabase
        .from("case_log_attachments")
        .select("*")
        .eq("case_id", caseId!)
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!atts?.length) return [];

      const entryIds = Array.from(new Set(atts.map((a) => a.case_log_entry_id)));
      const { data: entries } = await supabase
        .from("case_log_entries")
        .select("*")
        .in("id", entryIds);

      const map = new Map(entries?.map((e) => [e.id, e]) ?? []);
      return atts.map((a) => ({ attachment: a as CaseLogAttachment, entry: map.get(a.case_log_entry_id) ?? null }));
    },
  });
}

// ---------- Single entry + attachments ----------
export function useCaseEntry(entryId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["case_entry", entryId],
    enabled: !!user && !!entryId,
    queryFn: async () => {
      const { data: entry, error } = await supabase
        .from("case_log_entries")
        .select("*")
        .eq("id", entryId!)
        .single();
      if (error) throw error;
      const { data: attachments } = await supabase
        .from("case_log_attachments")
        .select("*")
        .eq("case_log_entry_id", entryId!);
      return { entry: entry as CaseLogEntry, attachments: (attachments ?? []) as CaseLogAttachment[] };
    },
  });
}

// ---------- Case-level analysis state ----------
export interface AnalysisRow {
  id: string;
  user_id: string;
  case_id: string;
  status: string;
  summary: any;
  entries_snapshot_max_updated_at: string | null;
  created_at: string;
}
export interface PatternRow {
  id: string;
  analysis_id: string;
  case_id: string;
  user_id: string;
  name: string;
  explanation: string | null;
  related_entry_ids: string[];
  first_entry_date: string | null;
  last_entry_date: string | null;
  created_at: string;
}

export function useLatestAnalysis(caseId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["case_analysis_latest", caseId],
    enabled: !!user && !!caseId,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("case_intelligence_analyses")
        .select("*")
        .eq("case_id", caseId!)
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error && (error as any).code !== "PGRST116") throw error;
      return (data ?? null) as AnalysisRow | null;
    },
  });
}

export function useAnalysisPatterns(analysisId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["case_analysis_patterns", analysisId],
    enabled: !!user && !!analysisId,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("case_intelligence_patterns")
        .select("*")
        .eq("analysis_id", analysisId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PatternRow[];
    },
  });
}

/** Calls the consume_case_intelligence_analysis RPC. Throws QuotaExceededError on 0 remaining. */
export class QuotaExceededError extends Error {
  used: number;
  limit: number;
  constructor(used: number, limit: number) {
    super("Out of Case Intelligence analyses for this billing period.");
    this.name = "QuotaExceededError";
    this.used = used;
    this.limit = limit;
  }
}

async function consumeCaseIntelligenceAnalysis(userId: string) {
  const { data, error } = await (supabase.rpc as any)("consume_case_intelligence_analysis", {
    p_user_id: userId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.allowed) {
    throw new QuotaExceededError(row?.used ?? 0, row?.limit ?? 0);
  }
  return row as { allowed: boolean; used: number; limit: number };
}

export function useRunAnalysis(caseId: string | null) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!user || !caseId) throw new Error("Missing case");

      // 1. Consume quota first — throws QuotaExceededError if out.
      await consumeCaseIntelligenceAnalysis(user.id);

      const { data: entries, error: eErr } = await supabase
        .from("case_log_entries")
        .select("id, entry_type, event_date, updated_at")
        .eq("case_id", caseId)
        .eq("user_id", user.id);
      if (eErr) throw eErr;
      const maxUpdated = entries?.reduce<string | null>(
        (m, e) => (!m || e.updated_at > m ? e.updated_at : m),
        null,
      ) ?? null;

      const { data: analysis, error: aErr } = await (supabase.from as any)("case_intelligence_analyses")
        .insert({
          user_id: user.id,
          case_id: caseId,
          status: "completed",
          entries_snapshot_max_updated_at: maxUpdated,
          summary: { generated_at: new Date().toISOString(), entry_count: entries?.length ?? 0 },
        })
        .select()
        .single();
      if (aErr) throw aErr;

      // Stub heuristic: group by entry_type, ≥3 = pattern.
      const byType = new Map<string, typeof entries>();
      entries?.forEach((e) => {
        const arr = byType.get(e.entry_type) ?? [];
        arr.push(e);
        byType.set(e.entry_type, arr);
      });
      const patternRows: any[] = [];
      byType.forEach((arr, type) => {
        if (arr.length >= 3) {
          const dates = arr.map((e) => e.event_date).sort();
          patternRows.push({
            analysis_id: analysis.id,
            user_id: user.id,
            case_id: caseId,
            name: `Recurring ${type.replace(/_/g, " ")}`,
            explanation: `${arr.length} ${type.replace(/_/g, " ")} entries detected across the case.`,
            related_entry_ids: arr.map((e) => e.id),
            first_entry_date: dates[0],
            last_entry_date: dates[dates.length - 1],
          });
        }
      });
      if (patternRows.length) {
        await (supabase.from as any)("case_intelligence_patterns").insert(patternRows);
      }
      return analysis;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case_analysis_latest", caseId] });
      qc.invalidateQueries({ queryKey: ["case_analysis_patterns"] });
      qc.invalidateQueries({ queryKey: ["usage_counters"] });
    },
  });
}

/** Mutation used by Generate Case Report — consumes 1 Case Intelligence analysis. */
export function useGenerateCaseReport() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      await consumeCaseIntelligenceAnalysis(user.id);
      return true;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usage_counters"] });
    },
  });
}

// Compute staleness given timeline entries + latest analysis
export function computeAnalysisState(
  latest: AnalysisRow | null,
  entries: { id: string; updated_at: string }[] | undefined,
) {
  if (!latest) return { status: "never" as const, newCount: 0, newEntryIds: new Set<string>() };
  const cutoff = latest.created_at;
  const newer = entries?.filter((e) => e.updated_at > cutoff) ?? [];
  if (newer.length > 0) {
    return { status: "stale" as const, newCount: newer.length, newEntryIds: new Set(newer.map((e) => e.id)) };
  }
  return { status: "current" as const, newCount: 0, newEntryIds: new Set<string>() };
}

// ---------- Filters helpers ----------
export const ENTRY_TYPES_LIST: CaseLogEntryType[] = [
  "general_incident",
  "parenting_time_exchange",
  "communication",
  "medical",
  "school_daycare",
  "expense",
];

// Re-export for backwards compatibility — single source of truth in lib/format.
export { formatFileSize } from "@/lib/format";

