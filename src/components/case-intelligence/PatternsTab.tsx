import { format, parseISO } from "date-fns";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  useCaseTimeline,
  useLatestAnalysis,
  useAnalysisPatterns,
  useRunAnalysis,
  computeAnalysisState,
} from "@/hooks/useCaseIntelligence";

export function PatternsTab({ caseId, onViewEvents }: { caseId: string; onViewEvents: () => void }) {
  const { toast } = useToast();
  const { data: entries } = useCaseTimeline(caseId);
  const { data: latest } = useLatestAnalysis(caseId);
  const { data: patterns } = useAnalysisPatterns(latest?.id ?? null);
  const run = useRunAnalysis(caseId);

  const state = computeAnalysisState(latest ?? null, entries);

  const handleAnalyze = async () => {
    try {
      await run.mutateAsync();
      toast({ title: "Case analyzed", description: "Patterns refreshed for this case." });
    } catch (err: any) {
      toast({ title: "Analysis failed", description: err.message, variant: "destructive" });
    }
  };

  const cta = (
    <Button onClick={handleAnalyze} disabled={run.isPending || !entries || entries.length === 0}>
      {run.isPending ? (
        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing...</>
      ) : (
        <><Sparkles className="h-4 w-4 mr-2" /> Analyze Case</>
      )}
    </Button>
  );

  if (state.status === "never") {
    return (
      <div className="space-y-4">
        <div className="border border-border rounded-lg p-8 bg-card text-center max-w-2xl mx-auto">
          <Sparkles className="h-8 w-8 mx-auto text-primary mb-3" />
          <h3 className="text-lg font-semibold text-foreground">Discover patterns across your case</h3>
          <p className="text-sm text-muted-foreground mt-2 mb-5">
            Case Intelligence reviews every saved Case Log entry and its supporting evidence to surface recurring behaviors,
            timing patterns, and risks. Running an analysis uses 1 Case Intelligence credit.
          </p>
          {cta}
        </div>
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
                <span className="text-xs text-muted-foreground shrink-0">{p.related_entry_ids.length} events</span>
              </div>
              {p.explanation && <p className="text-sm text-muted-foreground">{p.explanation}</p>}
              <p className="text-xs text-muted-foreground">
                {p.first_event_date && format(parseISO(p.first_event_date), "MMM d, yyyy")}
                {" – "}
                {p.last_event_date && format(parseISO(p.last_event_date), "MMM d, yyyy")}
              </p>
              <button onClick={onViewEvents} className="text-sm text-primary hover:text-primary/80">
                View Events →
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="border border-dashed border-border rounded-lg p-6 text-center">
          <p className="text-sm text-muted-foreground">No patterns detected in the last analysis.</p>
        </div>
      )}
    </div>
  );
}
