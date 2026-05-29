import { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Sparkles, Loader2, Info, ChevronRight, X, ArrowLeft, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useProfile } from "@/hooks/useProfile";
import { UpgradeModal } from "@/components/UpgradeModal";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  useCaseTimeline,
  useLatestAnalysis,
  useAnalysisPatterns,
  useRunAnalysis,
  useCaseEntry,
  computeAnalysisState,
  QuotaExceededError,
  type PatternRow,
} from "@/hooks/useCaseIntelligence";
import {
  resolveCanonicalPattern,
  CANONICAL_PATTERNS_BY_SLUG,
} from "@/lib/caseIntelligencePatterns";
import {
  ENTRY_TYPE_LABELS,
  COMMUNICATION_METHOD_LABELS,
  COMMUNICATION_PARTY_LABELS,
  type CaseLogEntryType,
  type CommunicationMethod,
  type CommunicationParty,
  type EntryMetadata,
} from "@/types/caseLog";
import { CardGridSkeleton, ErrorState } from "@/components/ui/state";

const ENTRY_TYPE_TEXT: Record<CaseLogEntryType, string> = {
  general_incident: "text-amber-400",
  parenting_time_exchange: "text-pink-400",
  communication: "text-sky-400",
  medical: "text-blue-400",
  school_daycare: "text-emerald-400",
  expense: "text-violet-400",
};

type RightView =
  | { kind: "none" }
  | { kind: "pattern"; patternId: string }
  | { kind: "entry"; entryId: string; patternId: string };

export function PatternsTab({ caseId, onViewEvents }: { caseId: string; onViewEvents: () => void }) {
  const { toast } = useToast();
  const { caseAnalysesExhausted, refetch } = useProfile();
  const { data: entries, isLoading: entriesLoading } = useCaseTimeline(caseId);
  const { data: latest, isLoading: latestLoading, isError: latestError, error: latestErr, refetch: refetchLatest } = useLatestAnalysis(caseId);
  const { data: patterns, isLoading: patternsLoading } = useAnalysisPatterns(latest?.id ?? null);
  const run = useRunAnalysis(caseId);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [right, setRight] = useState<RightView>({ kind: "none" });

  const state = computeAnalysisState(latest ?? null, entries);

  const entriesById = useMemo(() => {
    const m = new Map<string, NonNullable<typeof entries>[number]>();
    entries?.forEach((e) => m.set(e.id, e));
    return m;
  }, [entries]);

  const handleAnalyze = async () => {
    if (caseAnalysesExhausted) {
      setShowUpgrade(true);
      return;
    }
    try {
      await run.mutateAsync();
      refetch();
      setRight({ kind: "none" });
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

  const analyzeBtn = (label: string) => (
    <Button
      onClick={handleAnalyze}
      disabled={run.isPending || !entries || entries.length === 0}
      variant="outline"
      className="border-primary text-primary hover:bg-primary/10 hover:text-primary"
    >
      {run.isPending ? (
        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing...</>
      ) : (
        <><Sparkles className="h-4 w-4 mr-2" /> {label}</>
      )}
    </Button>
  );

  if (latestLoading || entriesLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <div className="h-9" />
        <CardGridSkeleton count={4} />
      </div>
    );
  }

  if (latestError) {
    return (
      <div className="p-4 md:p-6">
        <ErrorState title="Couldn't load analysis" error={latestErr} onRetry={() => refetchLatest()} />
      </div>
    );
  }

  // STATE: never analyzed
  if (state.status === "never") {
    return (
      <div className="p-4 md:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
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
          {analyzeBtn("Analyze Case")}
        </div>

        <div className="h-px bg-border -mx-4 md:-mx-6" />

        <div className="rounded-lg border border-border/50 bg-muted/20 px-5 py-3">
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

  // STATE: has analysis (results state)
  const title = state.status === "stale" ? "Patterns out of date" : "Patterns current";
  const helper =
    state.status === "stale"
      ? `${state.newCount} new case log${state.newCount !== 1 ? "s" : ""} ready for analysis.`
      : "No new entries or edits since last analysis.";
  const totalEntries = entries?.length ?? 0;
  const patternCount = patterns?.length ?? 0;

  const selectedPattern =
    right.kind === "pattern"
      ? patterns?.find((p) => p.id === right.patternId) ?? null
      : right.kind === "entry"
      ? patterns?.find((p) => p.id === right.patternId) ?? null
      : null;

  return (
    <div className="flex flex-col h-full">
      {/* Status / action row */}
      <div className="p-4 md:p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">
            Last analyzed {latest ? format(parseISO(latest.created_at), "MMM d, yyyy '@' h:mma") : "—"}
            {state.status === "stale" ? (
              <>
                {" • "}
                {state.newCount} {state.newCount === 1 ? "entry" : "entries"} added or updated since analysis
              </>
            ) : (
              patternCount > 0 && (
                <>
                  {" • "}
                  {patternCount} pattern{patternCount !== 1 ? "s" : ""} analyzed across {totalEntries} {totalEntries === 1 ? "entry" : "entries"}
                </>
              )
            )}
          </p>
          <p className="flex items-center gap-1.5 text-xs italic text-muted-foreground/70">
            <Info className="h-3 w-3" />
            {state.status === "stale" ? "Re-analysis uses 1 Case Intelligence analysis credit." : helper}
          </p>
        </div>
        {analyzeBtn("Re-analyze Case")}
      </div>

      <div className="h-px bg-border" />

      {/* Split view */}
      <div
        className="flex-1 min-h-0 overflow-hidden grid"
        style={{
          gridTemplateColumns:
            right.kind === "none"
              ? "minmax(0, 1fr)"
              : "minmax(700px, 1fr) clamp(420px, 440px, 480px)",
        }}
      >
        {/* Left: pattern list */}
        <div className="overflow-y-auto min-w-0">
          {patternsLoading ? (
            <div className="p-4 md:p-6">
              <CardGridSkeleton count={4} />
            </div>
          ) : !patterns || patterns.length === 0 ? (
            <div className="p-6">
              <p className="text-sm text-muted-foreground">
                No patterns detected in the last analysis.
                {state.status === "stale"
                  ? " New entries have been added since the last run. Re-analyze to look for new patterns."
                  : " As you add more entries, recurring behaviors and timing patterns will be surfaced here."}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {patterns.map((p, idx) => {
                const isSelected =
                  (right.kind === "pattern" || right.kind === "entry") && right.patternId === p.id;
                return (
                  <li key={p.id}>
                    <PatternRowItem
                      pattern={p}
                      zebra={idx % 2 === 1}
                      selected={isSelected}
                      onClick={() => setRight({ kind: "pattern", patternId: p.id })}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Right: split-view panel */}
        {right.kind === "pattern" && selectedPattern && (
          <PatternDetailPanel
            pattern={selectedPattern}
            entriesById={entriesById}
            onClose={() => setRight({ kind: "none" })}
            onOpenEntry={(entryId) =>
              setRight({ kind: "entry", entryId, patternId: selectedPattern.id })
            }
          />
        )}

        {right.kind === "entry" && selectedPattern && (
          <EntryDetailPanel
            entryId={right.entryId}
            patterns={patterns ?? []}
            onBack={() => setRight({ kind: "pattern", patternId: selectedPattern.id })}
          />
        )}
      </div>

      <UpgradeModal open={showUpgrade} onOpenChange={setShowUpgrade} lockedFeature="Case Intelligence" />
    </div>
  );
}

// ---------- Pattern list row ----------

function PatternRowItem({
  pattern,
  zebra,
  selected,
  onClick,
}: {
  pattern: PatternRow;
  zebra: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const canonical = resolveCanonicalPattern(pattern.slug) ?? resolveCanonicalPattern(pattern.name);
  const displayName = canonical?.name ?? pattern.name;
  const explanation = pattern.explanation ?? canonical?.definition ?? "";
  const count = pattern.related_entry_ids.length;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left px-5 md:px-6 py-4 flex items-start gap-4 border-l-4 border-transparent transition-colors",
        zebra ? "bg-[#1c1c1c]" : "bg-[#141414]",
        "hover:bg-muted/30",
        selected && "bg-primary/10 hover:bg-primary/10 border-l-primary",
      )}
    >
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h4 className="text-base font-semibold text-foreground">{displayName}</h4>
          <span className="shrink-0 inline-flex items-center rounded-full border border-border px-3 py-0.5 text-xs text-foreground">
            {count} {count === 1 ? "entry" : "entries"}
          </span>
        </div>
        {explanation && <p className="text-sm text-muted-foreground">{explanation}</p>}
        <div className="text-xs text-muted-foreground space-y-0.5">
          {pattern.first_entry_date && (
            <p>First entry: {format(parseISO(pattern.first_entry_date), "MM/dd/yy")}</p>
          )}
          {pattern.last_entry_date && (
            <p>Last entry: {format(parseISO(pattern.last_entry_date), "MM/dd/yy")}</p>
          )}
        </div>
        {!selected && (
          <div className="pt-1 flex justify-end">
            <span className="inline-flex items-center gap-1 text-sm text-primary">
              View Details <ChevronRight className="h-4 w-4" />
            </span>
          </div>
        )}
      </div>
    </button>
  );
}

// ---------- Right-side: Pattern detail panel ----------

function PatternDetailPanel({
  pattern,
  entriesById,
  onClose,
  onOpenEntry,
}: {
  pattern: PatternRow;
  entriesById: Map<string, any>;
  onClose: () => void;
  onOpenEntry: (entryId: string) => void;
}) {
  const canonical = resolveCanonicalPattern(pattern.slug) ?? resolveCanonicalPattern(pattern.name);
  const displayName = canonical?.name ?? pattern.name;
  const detected = pattern.explanation ?? canonical?.definition ?? "—";

  const relatedEntries = pattern.related_entry_ids
    .map((id) => entriesById.get(id))
    .filter((e): e is NonNullable<typeof e> => !!e)
    .sort((a, b) => {
      const ad = `${a.event_date ?? ""} ${a.event_time ?? ""}`;
      const bd = `${b.event_date ?? ""} ${b.event_time ?? ""}`;
      return bd.localeCompare(ad);
    });

  return (
    <aside className="min-w-0 border-l border-border bg-background flex flex-col">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
        <button
          type="button"
          onClick={onClose}
          className="h-6 w-6 shrink-0 rounded-full border-2 border-primary text-primary flex items-center justify-center"
          aria-label="Close pattern details"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
        <h3 className="text-base font-semibold text-foreground">{displayName}</h3>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        <Field label="Detected pattern">
          <p className="text-sm text-foreground">{detected}</p>
        </Field>
        <Field label="Linked entries">
          <p className="text-sm text-foreground">{pattern.related_entry_ids.length}</p>
        </Field>
        <Field label="First entry">
          <p className="text-sm text-foreground">
            {pattern.first_entry_date ? format(parseISO(pattern.first_entry_date), "MM/dd/yy") : "—"}
          </p>
        </Field>
        <Field label="Last entry">
          <p className="text-sm text-foreground">
            {pattern.last_entry_date ? format(parseISO(pattern.last_entry_date), "MM/dd/yy") : "—"}
          </p>
        </Field>

        <Field label="Related Entries">
          {relatedEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No related entries found.</p>
          ) : (
            <ul className="space-y-2">
              {relatedEntries.map((e) => {
                const dateStr = e.event_date ? format(parseISO(e.event_date), "MM/dd/yy") : "";
                const timeStr = e.event_time
                  ? format(parseISO(`1970-01-01T${e.event_time}`), "h:mm a")
                  : "";
                const label =
                  (e.context && e.context.trim()) ||
                  ENTRY_TYPE_LABELS[e.entry_type as CaseLogEntryType] ||
                  "Entry";
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => onOpenEntry(e.id)}
                      className="text-sm text-primary hover:text-primary/80 underline underline-offset-2 text-left"
                    >
                      {label}
                    </button>
                    {(dateStr || timeStr) && (
                      <span className="ml-2 text-xs text-[#e5e5e5]">
                        ({dateStr}{dateStr && timeStr && " - "}{timeStr})
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Field>
      </div>
    </aside>
  );
}

// ---------- Right-side: Entry detail panel (read-only) ----------

function EntryDetailPanel({
  entryId,
  patterns,
  onBack,
}: {
  entryId: string;
  patterns: PatternRow[];
  onBack: () => void;
}) {
  const { data, isLoading } = useCaseEntry(entryId);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const openAttachment = async (path: string, id: string) => {
    setOpeningId(id);
    try {
      const { data: signed } = await supabase.storage
        .from("case-log-attachments")
        .createSignedUrl(path, 60);
      if (signed?.signedUrl) window.open(signed.signedUrl, "_blank");
    } finally {
      setOpeningId(null);
    }
  };

  const connectedPatterns = patterns.filter((p) => p.related_entry_ids.includes(entryId));

  return (
    <aside className="min-w-0 border-l border-border bg-background flex flex-col">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
        <button
          type="button"
          onClick={onBack}
          className="h-6 w-6 shrink-0 rounded-full border-2 border-primary text-primary flex items-center justify-center"
          aria-label="Back to pattern details"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
        <h3 className="text-base font-semibold text-foreground">Entry Details</h3>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {isLoading || !data ? (
          <div className="space-y-3">
            <div className="h-4 w-32 bg-muted/30 rounded animate-pulse" />
            <div className="h-3 w-48 bg-muted/30 rounded animate-pulse" />
            <div className="h-20 w-full bg-muted/20 rounded animate-pulse" />
          </div>
        ) : (
          <EntryBody
            data={data}
            connectedPatterns={connectedPatterns}
            openingId={openingId}
            onOpenAttachment={openAttachment}
          />
        )}
      </div>
    </aside>
  );
}

function EntryBody({
  data,
  connectedPatterns,
  openingId,
  onOpenAttachment,
}: {
  data: NonNullable<ReturnType<typeof useCaseEntry>["data"]>;
  connectedPatterns: PatternRow[];
  openingId: string | null;
  onOpenAttachment: (path: string, id: string) => void;
}) {
  const { entry, attachments } = data;
  const meta = (entry.metadata || {}) as EntryMetadata;
  const typeKey = entry.entry_type as CaseLogEntryType;
  const typeLabel = ENTRY_TYPE_LABELS[typeKey];
  const typeColor = ENTRY_TYPE_TEXT[typeKey] ?? "text-foreground";

  const dateStr = entry.event_date ? format(parseISO(entry.event_date), "MM/dd/yy") : "";
  const timeStr = entry.event_time
    ? format(parseISO(`1970-01-01T${entry.event_time}`), "h:mm a")
    : "";

  const hasComm = entry.communication_involved && meta.communication;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className={cn("text-base font-semibold", typeColor)}>{typeLabel}</p>
        <p className="text-sm text-muted-foreground">
          {dateStr}
          {dateStr && timeStr ? " • " : ""}
          {timeStr}
        </p>
      </div>

      {entry.context && (
        <Field label="Context">
          <p className="text-sm text-foreground">{entry.context}</p>
        </Field>
      )}

      <Field label="Summary">
        <p className="text-sm text-foreground whitespace-pre-wrap">
          {entry.summary || <span className="text-muted-foreground italic">—</span>}
        </p>
      </Field>

      {entry.child_impact && (
        <Field label="Child's Behavior / Impact">
          <p className="text-sm text-foreground whitespace-pre-wrap">{entry.child_impact}</p>
        </Field>
      )}

      {attachments.length > 0 && (
        <Field label="Attachments">
          <ul className="space-y-1.5">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <button
                  type="button"
                  onClick={() => onOpenAttachment(a.file_path, a.id)}
                  disabled={openingId === a.id}
                  className="text-sm text-primary underline underline-offset-2 hover:text-primary/80 transition-colors text-left truncate"
                >
                  {openingId === a.id ? "Opening..." : a.file_name}
                </button>
              </li>
            ))}
          </ul>
        </Field>
      )}

      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">Communication Details</p>
        {hasComm ? (
          <div className="space-y-1 text-sm">
            {meta.communication?.method && (
              <Row
                label="Method"
                value={
                  COMMUNICATION_METHOD_LABELS[meta.communication.method as CommunicationMethod] ??
                  meta.communication.method
                }
              />
            )}
            {meta.communication?.contact && (
              <Row
                label="Party"
                value={
                  COMMUNICATION_PARTY_LABELS[meta.communication.contact as CommunicationParty] ??
                  meta.communication.contact
                }
              />
            )}
            {meta.communication?.summary && (
              <Row label="Notes" value={meta.communication.summary} multiline />
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No communication involved.</p>
        )}
      </div>

      <Field label="Connected Patterns">
        {connectedPatterns.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">None</p>
        ) : (
          <ul className="space-y-1">
            {connectedPatterns.map((p) => {
              const canonical =
                resolveCanonicalPattern(p.slug) ?? resolveCanonicalPattern(p.name);
              return (
                <li key={p.id} className="text-sm text-foreground">
                  {canonical?.name ?? p.name}
                </li>
              );
            })}
          </ul>
        )}
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-semibold text-foreground">{label}</p>
      {children}
    </div>
  );
}

function Row({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={multiline ? "text-foreground whitespace-pre-wrap" : "text-foreground"}>
        {value}
      </span>
    </div>
  );
}

// Suppress unused-import lint for CANONICAL_PATTERNS_BY_SLUG (kept for future use).
void CANONICAL_PATTERNS_BY_SLUG;
