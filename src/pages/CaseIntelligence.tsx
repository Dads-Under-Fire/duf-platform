import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { useActiveCase } from "@/hooks/useActiveCase";
import { useCreateCase, useDeleteCase } from "@/hooks/useCases";
import { useCaseEvidence, useCaseTimeline } from "@/hooks/useCaseIntelligence";
import { CaseSelector } from "@/components/case-log/CaseSelector";
import { CreateCasePrompt } from "@/components/case-log/CreateCasePrompt";
import { EvidenceTab } from "@/components/case-intelligence/EvidenceTab";
import { TimelineTab } from "@/components/case-intelligence/TimelineTab";
import { PatternsTab } from "@/components/case-intelligence/PatternsTab";
import { CaseReportTab } from "@/components/case-intelligence/CaseReportTab";
import { EntryDetailsDrawer } from "@/components/case-intelligence/EntryDetailsDrawer";
import { cn } from "@/lib/utils";
import type { CaseLogEntryType } from "@/types/caseLog";

type TabKey = "evidence" | "timeline" | "patterns" | "report";
const TABS: { key: TabKey; label: string }[] = [
  { key: "evidence", label: "Evidence" },
  { key: "timeline", label: "Timeline" },
  { key: "patterns", label: "Patterns" },
  { key: "report", label: "Case Report" },
];

export interface TabFilterState {
  entryType: CaseLogEntryType | "";
  sort: "newest" | "oldest";
  fromDate: string;
  toDate: string;
}
const defaultFilters: TabFilterState = { entryType: "", sort: "newest", fromDate: "", toDate: "" };

function EvidenceFilesCount({ caseId }: { caseId: string }) {
  const { data } = useCaseEvidence(caseId);
  const total = data?.length ?? 0;
  return (
    <p className="text-sm text-muted-foreground whitespace-nowrap">
      Evidence Files <span>({total})</span>
    </p>
  );
}

function TimelineLastEntry({ caseId }: { caseId: string }) {
  const { data } = useCaseTimeline(caseId);
  const last = data?.[0]?.event_date;
  if (!last) return null;
  return (
    <p className="text-sm text-muted-foreground whitespace-nowrap">
      Last entry: {format(parseISO(last), "MM/dd/yy")}
    </p>
  );
}

export default function CaseIntelligence() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as TabKey) || "timeline";
  const setTab = (k: TabKey) => {
    const next = new URLSearchParams(params);
    next.set("tab", k);
    setParams(next, { replace: true });
    setSelectedEntryId(null);
  };

  const { cases, casesLoading, activeCaseId, setActiveCaseId } = useActiveCase();
  const createCase = useCreateCase();
  const deleteCase = useDeleteCase();

  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [timelineFilters, setTimelineFilters] = useState<TabFilterState>(defaultFilters);
  const [evidenceFilters, setEvidenceFilters] = useState<TabFilterState>(defaultFilters);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef<number | null>(null);

  // Restore selection + filters + scroll if returning from Case Log edit flow
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("caseIntel.returnContext");
      if (!raw) return;
      const ctx = JSON.parse(raw);
      if (ctx?.sourceArea !== "case-intelligence") return;
      if (ctx.caseId && ctx.caseId !== activeCaseId) setActiveCaseId(ctx.caseId);
      if (ctx.sourceTab && ctx.sourceTab !== tab) {
        const next = new URLSearchParams(params);
        next.set("tab", ctx.sourceTab);
        setParams(next, { replace: true });
      }
      if (ctx.filters) {
        if (ctx.sourceTab === "timeline") setTimelineFilters(ctx.filters);
        else if (ctx.sourceTab === "evidence") setEvidenceFilters(ctx.filters);
      }
      if (ctx.drawerOpen && ctx.entryId) setSelectedEntryId(ctx.entryId);
      if (typeof ctx.scrollY === "number") pendingScrollRef.current = ctx.scrollY;
      sessionStorage.removeItem("caseIntel.returnContext");
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply pending scroll after children mount
  useEffect(() => {
    if (pendingScrollRef.current == null) return;
    const target = pendingScrollRef.current;
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ top: target });
      pendingScrollRef.current = null;
    }, 250);
    return () => clearTimeout(t);
  }, [tab, selectedEntryId]);

  const handleEditEntry = (entryId: string, sourceTab: "timeline" | "evidence") => {
    try {
      sessionStorage.setItem(
        "caseIntel.returnContext",
        JSON.stringify({
          sourceArea: "case-intelligence",
          sourceTab,
          caseId: activeCaseId,
          entryId,
          drawerOpen: true,
          filters: sourceTab === "timeline" ? timelineFilters : evidenceFilters,
          scrollY: scrollRef.current?.scrollTop ?? 0,
          savedAt: Date.now(),
        }),
      );
    } catch {}
    navigate(`/?editEntry=${entryId}`);
  };

  if (casesLoading) {
    return (
      <div className="p-6 space-y-3">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-32 w-full bg-muted/50 rounded animate-pulse" />
      </div>
    );
  }

  if (cases.length === 0) {
    return (
      <div className="h-full">
        <CreateCasePrompt
          onCreateCase={async (name) => {
            const c = await createCase.mutateAsync(name);
            setActiveCaseId(c.id);
          }}
          isLoading={createCase.isPending}
        />
      </div>
    );
  }

  const drawerOpen = !!selectedEntryId && (tab === "timeline" || tab === "evidence");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0">
        <CaseSelector
          cases={cases}
          activeCaseId={activeCaseId}
          onSelectCase={setActiveCaseId}
          onCreateCase={async (name) => {
            const c = await createCase.mutateAsync(name);
            setActiveCaseId(c.id);
          }}
          onDeleteCase={async (id) => deleteCase.mutateAsync(id)}
          isCreating={createCase.isPending}
          isDeleting={deleteCase.isPending}
        />
        <div className="px-6 pt-4 pb-4 flex items-center justify-between gap-4 border-b border-border">
          <nav className="flex gap-1 overflow-x-auto -mx-1 px-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "inline-flex items-center justify-center h-12 min-h-0 px-4 py-0 rounded-md text-sm leading-none whitespace-nowrap transition-colors font-medium",
                  tab === t.key
                    ? "bg-primary text-[#0f0f0f]"
                    : "text-foreground hover:text-foreground/80",
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
          {tab === "evidence" && activeCaseId && (
            <EvidenceFilesCount caseId={activeCaseId} />
          )}
          {tab === "timeline" && activeCaseId && (
            <TimelineLastEntry caseId={activeCaseId} />
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div
          ref={scrollRef}
          className={cn(
            "flex-1 overflow-auto",
            tab === "evidence" || tab === "timeline" ? "" : "p-4 md:p-6",
          )}
        >
          {!activeCaseId ? (
            <p className="text-sm text-muted-foreground p-6">Select a case to continue.</p>
          ) : tab === "evidence" ? (
            <EvidenceTab
              caseId={activeCaseId}
              selectedEntryId={selectedEntryId}
              onSelectEntry={setSelectedEntryId}
              filters={evidenceFilters}
              onFiltersChange={setEvidenceFilters}
            />
          ) : tab === "timeline" ? (
            <TimelineTab
              caseId={activeCaseId}
              selectedEntryId={selectedEntryId}
              onSelectEntry={setSelectedEntryId}
              filters={timelineFilters}
              onFiltersChange={setTimelineFilters}
            />
          ) : tab === "patterns" ? (
            <PatternsTab caseId={activeCaseId} onViewEvents={() => setTab("timeline")} />
          ) : (
            <CaseReportTab caseId={activeCaseId} />
          )}
        </div>

        {drawerOpen && selectedEntryId && (
          <EntryDetailsDrawer
            entryId={selectedEntryId}
            sourceTab={tab as "timeline" | "evidence"}
            onClose={() => setSelectedEntryId(null)}
            onEdit={() => handleEditEntry(selectedEntryId, tab as "timeline" | "evidence")}
          />
        )}
      </div>
    </div>
  );
}
