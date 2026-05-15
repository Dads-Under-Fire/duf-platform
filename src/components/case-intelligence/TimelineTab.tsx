import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { Clock, Paperclip, ChevronRight } from "lucide-react";
import { useCaseTimeline, useLatestAnalysis, useAnalysisPatterns, computeAnalysisState } from "@/hooks/useCaseIntelligence";
import { ENTRY_TYPE_LABELS, type CaseLogEntryType } from "@/types/caseLog";
import { Filters, defaultFilters, type FilterState } from "./Filters";
import { PatternStatusBadge } from "./PatternStatusBadge";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/state";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export function TimelineTab({ caseId }: { caseId: string }) {
  const navigate = useNavigate();
  const { data: entries, isLoading, isError, error, refetch } = useCaseTimeline(caseId);
  const { data: latest } = useLatestAnalysis(caseId);
  const { data: patterns } = useAnalysisPatterns(latest?.id ?? null);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  const state = computeAnalysisState(latest ?? null, entries);

  // entry id -> pattern names
  const entryPatterns = useMemo(() => {
    const m = new Map<string, string[]>();
    patterns?.forEach((p) => {
      p.related_entry_ids.forEach((id) => {
        const arr = m.get(id) ?? [];
        arr.push(p.name);
        m.set(id, arr);
      });
    });
    return m;
  }, [patterns]);

  const filtered = useMemo(() => {
    let list = entries ?? [];
    if (filters.entryType) list = list.filter((e) => e.entry_type === filters.entryType);
    if (filters.fromDate) list = list.filter((e) => e.event_date >= filters.fromDate);
    if (filters.toDate) list = list.filter((e) => e.event_date <= filters.toDate);
    list = [...list].sort((a, b) => {
      const cmp = a.event_date.localeCompare(b.event_date);
      return filters.sort === "newest" ? -cmp : cmp;
    });
    return list;
  }, [entries, filters]);

  // group by date
  const grouped = useMemo(() => {
    const g = new Map<string, typeof filtered>();
    filtered.forEach((e) => {
      const arr = g.get(e.event_date) ?? [];
      arr.push(e);
      g.set(e.event_date, arr);
    });
    return Array.from(g.entries());
  }, [filtered]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Filters value={filters} onChange={setFilters} />
        <ListSkeleton rows={5} />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title="Couldn't load the timeline"
        error={error}
        onRetry={() => refetch()}
      />
    );
  }

  const totalLogs = entries?.length ?? 0;
  const lastDate = entries?.[0]?.event_date;
  const filtersActive = !!(filters.entryType || filters.fromDate || filters.toDate);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {totalLogs} Case Log{totalLogs !== 1 ? "s" : ""}
          {lastDate ? ` · Last entry: ${format(parseISO(lastDate), "MM/dd/yy")}` : ""}
        </p>
      </div>
      <Filters value={filters} onChange={setFilters} />

      {grouped.length === 0 ? (
        totalLogs === 0 ? (
          <EmptyState
            title="No case log entries yet."
            description="Add your first entry from the Case Log to start building a timeline of events."
            action={
              <Button asChild size="sm">
                <Link to="/">Go to Case Log</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No entries match the current filters."
            description={filtersActive ? "Try clearing or adjusting the filters above." : undefined}
          />
        )
      ) : (
        <div className="space-y-6">
          {grouped.map(([date, items]) => (
            <div key={date} className="space-y-2">
              <h3 className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                {format(parseISO(date), "EEEE, MMM d, yyyy")}
              </h3>
              <ul className="space-y-2">
                {items.map((entry) => {
                  const typeLabel = ENTRY_TYPE_LABELS[entry.entry_type as CaseLogEntryType];
                  const time = entry.event_time?.slice(0, 5) ?? "";
                  const isNewer = state.newEntryIds.has(entry.id);
                  const names = entryPatterns.get(entry.id) ?? [];
                  return (
                    <li key={entry.id}>
                      <button
                        onClick={() => navigate(`/case-intelligence/entry/${entry.id}`)}
                        className="w-full text-left border border-border rounded-lg p-4 bg-card hover:bg-secondary/50 transition-colors flex items-center gap-3"
                      >
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{time}</span>
                            <span className="px-1.5 py-0.5 rounded bg-secondary border border-border text-foreground">{typeLabel}</span>
                            {entry.attachment_count > 0 && (
                              <span className="flex items-center gap-1"><Paperclip className="h-3 w-3" />{entry.attachment_count}</span>
                            )}
                          </div>
                          {entry.context && <p className="text-sm font-medium text-foreground truncate">{entry.context}</p>}
                          {entry.summary && <p className="text-sm text-muted-foreground line-clamp-2">{entry.summary}</p>}
                          <PatternStatusBadge
                            status={state.status}
                            isNewerThanAnalysis={isNewer}
                            patternNames={names}
                          />
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
