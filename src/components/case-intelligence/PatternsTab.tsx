import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Sparkles, Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useProfile } from "@/hooks/useProfile";
import { UpgradeModal } from "@/components/UpgradeModal";
import {
  useCaseTimeline,
  useLatestAnalysis,
  useAnalysisPatterns,
  useRunAnalysis,
  computeAnalysisState,
  QuotaExceededError,
} from "@/hooks/useCaseIntelligence";

import { EmptyState, ErrorState, ListSkeleton, CardGridSkeleton } from "@/components/ui/state";

export function PatternsTab({ caseId, onViewEvents }: { caseId: string; onViewEvents: () => void }) {
  const { toast } = useToast();
  const { caseAnalysesExhausted, refetch } = useProfile();
  const { data: entries, isLoading: entriesLoading } = useCaseTimeline(caseId);
  const { data: latest, isLoading: latestLoading, isError: latestError, error: latestErr, refetch: refetchLatest } = useLatestAnalysis(caseId);
  const { data: patterns, isLoading: patternsLoading } = useAnalysisPatterns(latest?.id ?? null);
  const run = useRunAnalysis(caseId);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const state = computeAnalysisState(latest ?? null, entries);

  const handleAnalyze = async () => {
    if (caseAnalysesExhausted) {
      setShowUpgrade(true);
      return;
    }
    try {
      await run.mutateAsync();
      refetch();
      toast({ title: "Case analyzed", description: "Patterns refreshed for this case." });
    } catch (err: any) {
      if (err instanceof QuotaExceededError) {
        refetch();
        setShowUpgrade(true);
        return;
      }
      toast({ title: "Analysis failed", description: err.message, variant: "destructive" });
    }
  };

  const cta = (
    <Button
      onClick={handleAnalyze}
      disabled={run.isPending || !entries || entries.length === 0}
      variant="outline"
      className="border-primary text-primary hover:bg-primary/10 hover:text-primary"
    >
      {run.isPending ? (
        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing...</>
      ) : (
        <><Sparkles className="h-4 w-4 mr-2" /> Analyze Case</>
      )}
    </Button>
  );

  if (latestLoading || entriesLoading) {
    return (
      <div className="space-y-4">
        <div className="h-9" />
        <CardGridSkeleton count={4} />
      </div>
    );
  }

  if (latestError) {
    return (
      <ErrorState
        title="Couldn't load analysis"
        error={latestErr}
        onRetry={() => refetchLatest()}
      />
    );
  }

  if (state.status === "never") {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">No pattern analysis yet</h3>
            <p className="text-sm text-muted-foreground">
              Run analysis to identify recurring behavior patterns across your case log entries.
            </p>
            <p className="flex items-center gap-1.5 text-xs italic text-muted-foreground/70">
              <Info className="h-3 w-3" />
              Uses 1 Case Intelligence analysis credit
            </p>
          </div>
          {cta}
        </div>

        <div className="rounded-lg border border-border/50 bg-muted/20 px-5 py-4">
          <div className="flex items-start gap-3">
            <Sparkles className="h-4 w-4 mt-0.5 shrink-0 text-primary/80" />
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-foreground">Patterns will appear here after analysis</h4>
              <p className="text-sm text-muted-foreground">
                Case Intelligence reviews saved case log entries and evidence notes to identify recurring behavior patterns across your case.
              </p>
            </div>
          </div>
        </div>

        <UpgradeModal open={showUpgrade} onOpenChange={setShowUpgrade} lockedFeature="Case Intelligence" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Last analyzed: {latest ? format(parseISO(latest.created_at), "MMM d, yyyy 'at' h:mma") : "—"}
          </p>
          {state.status === "stale" && (
            <p className="text-sm text-primary mt-1">
              {state.newCount} new case log{state.newCount !== 1 ? "s" : ""} ready for analysis.
            </p>
          )}
        </div>
        {cta}
      </div>

      {patterns && patterns.length > 0 ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {patterns.map((p) => (
            <li key={p.id} className="border border-border rounded-lg p-4 bg-card space-y-2">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-semibold text-foreground capitalize">{p.name}</h4>
                <span className="text-xs text-muted-foreground shrink-0">{p.related_entry_ids.length} {p.related_entry_ids.length === 1 ? "entry" : "entries"}</span>
              </div>
              {p.explanation && <p className="text-sm text-muted-foreground">{p.explanation}</p>}
              <p className="text-xs text-muted-foreground">
                {p.first_entry_date && format(parseISO(p.first_entry_date), "MMM d, yyyy")}
                {" – "}
                {p.last_entry_date && format(parseISO(p.last_entry_date), "MMM d, yyyy")}
              </p>
              <button onClick={onViewEvents} className="text-sm text-primary hover:text-primary/80">
                View Entries →
              </button>
            </li>
          ))}
        </ul>
      ) : patternsLoading ? (
        <CardGridSkeleton count={4} />
      ) : (
        <EmptyState
          title="No patterns detected in the last analysis."
          description={
            state.status === "stale"
              ? "New entries have been added since the last run. Re-analyze to look for new patterns."
              : "As you add more entries, recurring behaviors and timing patterns will be surfaced here."
          }
        />
      )}

      <UpgradeModal open={showUpgrade} onOpenChange={setShowUpgrade} lockedFeature="Case Intelligence" />
    </div>
  );
}
