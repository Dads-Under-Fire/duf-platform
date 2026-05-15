import { useSearchParams, useNavigate } from "react-router-dom";
import { useActiveCase } from "@/hooks/useActiveCase";
import { useCreateCase, useDeleteCase } from "@/hooks/useCases";
import { useCaseEvidence } from "@/hooks/useCaseIntelligence";
import { CaseSelector } from "@/components/case-log/CaseSelector";
import { CreateCasePrompt } from "@/components/case-log/CreateCasePrompt";
import { EvidenceTab } from "@/components/case-intelligence/EvidenceTab";
import { TimelineTab } from "@/components/case-intelligence/TimelineTab";
import { PatternsTab } from "@/components/case-intelligence/PatternsTab";
import { CaseReportTab } from "@/components/case-intelligence/CaseReportTab";
import { cn } from "@/lib/utils";

type TabKey = "evidence" | "timeline" | "patterns" | "report";
const TABS: { key: TabKey; label: string }[] = [
  { key: "evidence", label: "Evidence" },
  { key: "timeline", label: "Timeline" },
  { key: "patterns", label: "Patterns" },
  { key: "report", label: "Case Report" },
];

function EvidenceFilesCount({ caseId }: { caseId: string }) {
  const { data } = useCaseEvidence(caseId);
  const total = data?.length ?? 0;
  return (
    <p className="text-sm text-foreground whitespace-nowrap">
      Evidence Files <span className="text-muted-foreground">({total})</span>
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
  };

  const { cases, casesLoading, activeCaseId, setActiveCaseId } = useActiveCase();
  const createCase = useCreateCase();
  const deleteCase = useDeleteCase();

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
        <div className="px-4 md:px-6 flex items-center justify-between gap-4 border-b border-border">
          <nav className="flex gap-1 overflow-x-auto -mx-1 px-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "px-4 py-4 rounded-md text-sm whitespace-nowrap transition-colors font-medium",
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
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        {!activeCaseId ? (
          <p className="text-sm text-muted-foreground">Select a case to continue.</p>
        ) : tab === "evidence" ? (
          <EvidenceTab caseId={activeCaseId} />
        ) : tab === "timeline" ? (
          <TimelineTab caseId={activeCaseId} />
        ) : tab === "patterns" ? (
          <PatternsTab caseId={activeCaseId} onViewEvents={() => setTab("timeline")} />
        ) : (
          <CaseReportTab caseId={activeCaseId} />
        )}
      </div>
    </div>
  );
}
