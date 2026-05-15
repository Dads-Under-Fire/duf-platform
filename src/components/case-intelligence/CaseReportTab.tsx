import { format, parseISO } from "date-fns";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useProfile } from "@/hooks/useProfile";
import { UpgradeModal } from "@/components/UpgradeModal";
import {
  useCaseTimeline,
  useCaseEvidence,
  useLatestAnalysis,
  useAnalysisPatterns,
  useGenerateCaseReport,
  QuotaExceededError,
} from "@/hooks/useCaseIntelligence";
import { useState } from "react";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { Skeleton } from "@/components/ui/skeleton";

export function CaseReportTab({ caseId }: { caseId: string }) {
  const { toast } = useToast();
  const { caseAnalysesExhausted, refetch } = useProfile();
  const { data: entries, isLoading: entriesLoading, isError: entriesErr, refetch: refetchEntries } = useCaseTimeline(caseId);
  const { data: evidence, isLoading: evidenceLoading } = useCaseEvidence(caseId);
  const { data: latest, isLoading: latestLoading } = useLatestAnalysis(caseId);
  const { data: patterns, isLoading: patternsLoading } = useAnalysisPatterns(latest?.id ?? null);
  const generate = useGenerateCaseReport();
  const [generated, setGenerated] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const overviewLoading = entriesLoading || evidenceLoading || latestLoading;

  const handleGenerate = async () => {
    if (caseAnalysesExhausted) {
      setShowUpgrade(true);
      return;
    }
    try {
      await generate.mutateAsync();
      refetch();
      setGenerated(true);
      toast({ title: "Case report generated", description: "Your structured case report is ready." });
    } catch (err: any) {
      if (err instanceof QuotaExceededError) {
        refetch();
        setShowUpgrade(true);
        return;
      }
      toast({ title: "Report failed", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Case Report</h3>
          <p className="text-sm text-muted-foreground">
            A structured summary of your case logs, attached evidence, and detected patterns.
          </p>
        </div>
        <Button onClick={handleGenerate} disabled={generate.isPending}>
          {generate.isPending ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
          ) : (
            <><FileText className="h-4 w-4 mr-2" /> Generate Case Report</>
          )}
        </Button>
      </div>

      {entriesErr && (
        <ErrorState
          title="Couldn't load case data"
          onRetry={() => refetchEntries()}
        />
      )}

      <section className="border border-border rounded-lg p-4 bg-card">
        <h4 className="text-sm font-medium text-foreground mb-3">Overview</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {overviewLoading ? (
            <>
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </>
          ) : (
            <>
              <Stat label="Case Logs" value={entries?.length ?? 0} />
              <Stat label="Evidence files" value={evidence?.length ?? 0} />
              <Stat label="Patterns" value={patterns?.length ?? 0} />
              <Stat
                label="Last analyzed"
                value={latest ? format(parseISO(latest.created_at), "MMM d") : "—"}
              />
            </>
          )}
        </div>
      </section>

      <section className="border border-border rounded-lg p-4 bg-card">
        <h4 className="text-sm font-medium text-foreground mb-3">Detected patterns</h4>
        {patternsLoading ? (
          <Skeleton className="h-4 w-1/2" />
        ) : patterns && patterns.length > 0 ? (
          <ul className="space-y-2">
            {patterns.map((p) => (
              <li key={p.id} className="text-sm">
                <span className="font-medium text-foreground capitalize">{p.name}</span>
                <span className="text-muted-foreground"> — {p.related_entry_ids.length} events</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Run a case analysis to surface patterns.</p>
        )}
      </section>

      <section className="border border-border rounded-lg p-4 bg-card">
        <h4 className="text-sm font-medium text-foreground mb-3">Linked evidence</h4>
        {evidenceLoading ? (
          <Skeleton className="h-4 w-2/3" />
        ) : evidence && evidence.length > 0 ? (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {evidence.slice(0, 10).map((e) => (
              <li key={e.attachment.id} className="truncate">{e.attachment.file_name}</li>
            ))}
            {evidence.length > 10 && <li className="text-xs">+ {evidence.length - 10} more</li>}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No evidence attached yet.</p>
        )}
      </section>

      <section className="border border-border rounded-lg p-4 bg-card">
        <h4 className="text-sm font-medium text-foreground mb-3">Case summary</h4>
        {generated ? (
          <p className="text-sm text-muted-foreground italic">
            [Generated case narrative will appear here once the AI report is wired up.]
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Click Generate Case Report to produce a written summary.</p>
        )}
      </section>

      <UpgradeModal open={showUpgrade} onOpenChange={setShowUpgrade} lockedFeature="Case Intelligence" />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}
