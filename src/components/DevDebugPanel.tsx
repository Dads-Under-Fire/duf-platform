// Dev-only QA/debug overlay. Hidden in production builds (gated by
// import.meta.env.DEV) and additionally toggled per-browser via localStorage
// flag `duf_debug` ("1" to show). Press Ctrl+Shift+D to toggle at runtime.
//
// To remove entirely: delete this file and its mount in AppLayout.tsx.
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { useActiveCase } from "@/hooks/useActiveCase";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "duf_debug";

function useDebugVisibility() {
  const [visible, setVisible] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        setVisible((v) => {
          const next = !v;
          try {
            window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
          } catch { /* ignore */ }
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return [visible, setVisible] as const;
}

function fmt(d?: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return String(d);
  }
}

export function DevDebugPanel() {
  // Hard gate: never render in production builds.
  if (!import.meta.env.DEV) return null;

  const [visible, setVisible] = useDebugVisibility();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { user } = useAuth();
  const { plan, subscription, usage, limits, intendedPlan } = useProfile();
  const { cases, activeCaseId } = useActiveCase();

  const activeCase = useMemo(
    () => cases.find((c) => c.id === activeCaseId) ?? null,
    [cases, activeCaseId],
  );

  const { data: entryStats } = useQuery({
    queryKey: ["debug_entries", user?.id, activeCaseId],
    enabled: !!user && !!activeCaseId && visible,
    refetchInterval: 5000,
    queryFn: async () => {
      const { count, error } = await (supabase.from as any)("case_log_entries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("case_id", activeCaseId!);
      if (error) throw error;
      const { data: latest } = await (supabase.from as any)("case_log_entries")
        .select("updated_at")
        .eq("user_id", user!.id)
        .eq("case_id", activeCaseId!)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return {
        count: count ?? 0,
        latestUpdatedAt: (latest?.updated_at as string | null) ?? null,
      };
    },
  });

  const { data: attachStats } = useQuery({
    queryKey: ["debug_attachments", user?.id, activeCaseId],
    enabled: !!user && !!activeCaseId && visible,
    refetchInterval: 5000,
    queryFn: async () => {
      const { count, error } = await (supabase.from as any)("case_log_attachments")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("case_id", activeCaseId!);
      if (error) throw error;
      return { count: count ?? 0 };
    },
  });

  const { data: latestAnalysis } = useQuery({
    queryKey: ["debug_latest_analysis", user?.id, activeCaseId],
    enabled: !!user && !!activeCaseId && visible,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data } = await (supabase.from as any)("case_intelligence_analyses")
        .select("id, status, created_at, entries_snapshot_max_updated_at")
        .eq("user_id", user!.id)
        .eq("case_id", activeCaseId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
  });

  const { data: newSinceAnalysis } = useQuery({
    queryKey: [
      "debug_new_since_analysis",
      user?.id,
      activeCaseId,
      latestAnalysis?.entries_snapshot_max_updated_at,
    ],
    enabled: !!user && !!activeCaseId && visible,
    refetchInterval: 5000,
    queryFn: async () => {
      const since = latestAnalysis?.entries_snapshot_max_updated_at;
      let q = (supabase.from as any)("case_log_entries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("case_id", activeCaseId!);
      if (since) q = q.gt("updated_at", since);
      const { count } = await q;
      return count ?? 0;
    },
  });

  if (!visible) return null;

  const analysisStatus: "never" | "current" | "stale" = !latestAnalysis
    ? "never"
    : (newSinceAnalysis ?? 0) > 0
    ? "stale"
    : "current";

  const Row = ({ k, v, mono = false }: { k: string; v: React.ReactNode; mono?: boolean }) => (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</span>
      <span className={cn("text-right text-[11px] text-foreground break-all", mono && "font-mono")}>{v}</span>
    </div>
  );

  return (
    <div
      className="fixed bottom-3 right-3 z-[9999] w-[320px] rounded-lg border border-amber-500/50 bg-background/95 backdrop-blur shadow-lg text-foreground"
      style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 border-b border-amber-500/40 bg-amber-500/10 rounded-t-lg"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
          DUF · Dev Debug
        </span>
        <span className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Ctrl+Shift+D</span>
          <span
            onClick={(e) => {
              e.stopPropagation();
              setVisible(false);
              try { window.localStorage.setItem(STORAGE_KEY, "0"); } catch { /* ignore */ }
            }}
            className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
            role="button"
          >
            ✕
          </span>
        </span>
      </button>

      {!collapsed && (
        <div className="px-3 py-2 space-y-2 max-h-[70vh] overflow-y-auto">
          <section>
            <div className="text-[10px] font-semibold text-muted-foreground mb-1">ROUTE / USER</div>
            <Row k="path" v={location.pathname + (location.search || "")} mono />
            <Row k="user" v={user?.email ?? "—"} mono />
            <Row k="user_id" v={user?.id ?? "—"} mono />
          </section>

          <section>
            <div className="text-[10px] font-semibold text-muted-foreground mb-1">ACTIVE CASE</div>
            <Row k="name" v={activeCase?.case_name ?? "—"} />
            <Row k="id" v={activeCaseId ?? "—"} mono />
            <Row k="cases total" v={cases.length} />
          </section>

          <section>
            <div className="text-[10px] font-semibold text-muted-foreground mb-1">CASE LOG</div>
            <Row k="entries" v={entryStats?.count ?? "…"} />
            <Row k="last entry update" v={fmt(entryStats?.latestUpdatedAt)} />
            <Row k="attachments" v={attachStats?.count ?? "…"} />
          </section>

          <section>
            <div className="text-[10px] font-semibold text-muted-foreground mb-1">CASE INTELLIGENCE</div>
            <Row
              k="analysis status"
              v={
                <span
                  className={cn(
                    analysisStatus === "current" && "text-emerald-500",
                    analysisStatus === "stale" && "text-amber-500",
                    analysisStatus === "never" && "text-muted-foreground",
                  )}
                >
                  {analysisStatus}
                </span>
              }
            />
            <Row k="latest run" v={fmt(latestAnalysis?.created_at as string | undefined)} />
            <Row k="snapshot @" v={fmt(latestAnalysis?.entries_snapshot_max_updated_at as string | undefined)} />
            <Row k="new/updated since" v={newSinceAnalysis ?? 0} />
          </section>

          <section>
            <div className="text-[10px] font-semibold text-muted-foreground mb-1">PLAN / BILLING</div>
            <Row k="plan" v={plan} />
            <Row k="status" v={subscription?.status ?? "—"} />
            <Row k="interval" v={subscription?.billing_interval ?? "—"} />
            <Row k="cancel@end" v={String(!!subscription?.cancel_at_period_end)} />
            <Row k="pending" v={subscription?.pending_plan ?? "—"} />
            <Row k="pending eff." v={fmt(subscription?.pending_effective_at)} />
            <Row k="period end" v={fmt(subscription?.billing_period_end)} />
            <Row k="intended_plan" v={intendedPlan ?? "—"} />
            <Row k="stripe_cust" v={subscription?.stripe_customer_id ?? "—"} mono />
            <Row k="stripe_sub" v={subscription?.stripe_subscription_id ?? "—"} mono />
          </section>

          <section>
            <div className="text-[10px] font-semibold text-muted-foreground mb-1">USAGE THIS PERIOD</div>
            <Row
              k="rewrites"
              v={`${usage?.message_rewrites_used ?? 0} / ${
                limits.unlimited_rewrites ? "∞" : limits.message_rewrites
              }`}
            />
            <Row
              k="case intel"
              v={`${usage?.case_intelligence_analyses_used ?? 0} / ${limits.case_intelligence_analyses}`}
            />
            <Row k="period start" v={fmt(usage?.period_start)} />
            <Row k="period end" v={fmt(usage?.period_end)} />
          </section>
        </div>
      )}
    </div>
  );
}
