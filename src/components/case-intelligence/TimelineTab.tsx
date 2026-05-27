import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Paperclip, ChevronRight, ArrowDownUp, CalendarRange } from "lucide-react";
import { useCaseTimeline } from "@/hooks/useCaseIntelligence";
import { ENTRY_TYPE_LABELS, type CaseLogEntryType } from "@/types/caseLog";
import { ENTRY_TYPES_LIST } from "@/hooks/useCaseIntelligence";
import { ClearableSelect } from "@/components/ui/clearable-select";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/state";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const ENTRY_TYPE_TEXT: Record<CaseLogEntryType, string> = {
  general_incident: "text-amber-400",
  parenting_time_exchange: "text-pink-400",
  communication: "text-sky-400",
  medical: "text-blue-400",
  school_daycare: "text-emerald-400",
  expense: "text-violet-400",
};

interface FilterState {
  entryType: CaseLogEntryType | "";
  sort: "newest" | "oldest";
  fromDate: string;
  toDate: string;
}
const defaultFilters: FilterState = { entryType: "", sort: "newest", fromDate: "", toDate: "" };

interface Props {
  caseId: string;
  selectedEntryId: string | null;
  onSelectEntry: (entryId: string) => void;
  filters?: FilterState;
  onFiltersChange?: (f: FilterState) => void;
}

export function TimelineTab({ caseId, selectedEntryId, onSelectEntry, filters: filtersProp, onFiltersChange }: Props) {
  const { data: entries, isLoading, isError, error, refetch } = useCaseTimeline(caseId);
  const [internalFilters, setInternalFilters] = useState<FilterState>(defaultFilters);
  const filters = filtersProp ?? internalFilters;
  const setFilters = (f: FilterState) => {
    if (onFiltersChange) onFiltersChange(f);
    else setInternalFilters(f);
  };

  const filtered = useMemo(() => {
    let list = entries ?? [];
    if (filters.entryType) list = list.filter((e) => e.entry_type === filters.entryType);
    if (filters.fromDate) list = list.filter((e) => e.event_date >= filters.fromDate);
    if (filters.toDate) list = list.filter((e) => e.event_date <= filters.toDate);
    list = [...list].sort((a, b) => {
      const cmp = `${a.event_date} ${a.event_time ?? ""}`.localeCompare(
        `${b.event_date} ${b.event_time ?? ""}`,
      );
      return filters.sort === "newest" ? -cmp : cmp;
    });
    return list;
  }, [entries, filters]);

  const grouped = useMemo(() => {
    const g = new Map<string, typeof filtered>();
    filtered.forEach((e) => {
      const arr = g.get(e.event_date) ?? [];
      arr.push(e);
      g.set(e.event_date, arr);
    });
    return Array.from(g.entries());
  }, [filtered]);

  const totalLogs = entries?.length ?? 0;
  const filtersActive = !!(filters.entryType || filters.fromDate || filters.toDate);

  return (
    <div>
      {/* Filter row */}
      <div className="sticky top-0 z-20 bg-background pt-4 pb-6 px-6 flex items-center justify-between gap-3">
        <div className="min-w-[180px]">
          <ClearableSelect
            value={filters.entryType}
            onValueChange={(v) =>
              setFilters({ ...filters, entryType: (v as CaseLogEntryType) || "" })
            }
            placeholder="All entry types"
            options={ENTRY_TYPES_LIST.map((t) => ({ value: t, label: ENTRY_TYPE_LABELS[t] }))}
            triggerClassName="bg-transparent border border-foreground rounded-md h-9 px-3 text-sm font-medium text-foreground"
          />
        </div>

        <div className="flex items-center gap-0.5 text-foreground">
          <button
            type="button"
            onClick={() =>
              setFilters({ ...filters, sort: filters.sort === "newest" ? "oldest" : "newest" })
            }
            title={`Sort: ${filters.sort === "newest" ? "Newest first" : "Oldest first"}`}
            className="h-8 w-8 rounded-md flex items-center justify-center text-foreground hover:text-primary transition-colors"
          >
            <ArrowDownUp className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </button>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                title="Filter by date range"
                className={cn(
                  "h-8 w-8 rounded-md flex items-center justify-center transition-colors",
                  filters.fromDate || filters.toDate
                    ? "text-primary"
                    : "text-foreground hover:text-primary",
                )}
              >
                <CalendarRange className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-3 space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">From</label>
                <Input
                  type="date"
                  value={filters.fromDate}
                  onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">To</label>
                <Input
                  type="date"
                  value={filters.toDate}
                  onChange={(e) => setFilters({ ...filters, toDate: e.target.value })}
                />
              </div>
              {(filters.fromDate || filters.toDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => setFilters({ ...filters, fromDate: "", toDate: "" })}
                >
                  Clear dates
                </Button>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="px-6">
          <ListSkeleton rows={5} />
        </div>
      ) : isError ? (
        <div className="px-6">
          <ErrorState
            title="Couldn't load the timeline"
            error={error}
            onRetry={() => refetch()}
          />
        </div>
      ) : grouped.length === 0 ? (
        <div className="px-6">
          {totalLogs === 0 ? (
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
          )}
        </div>
      ) : (
        <div>
          {grouped.map(([date, items]) => (
            <div key={date}>
              <div className="px-6 pt-4 pb-2 flex items-center gap-3">
                <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                  {format(parseISO(date), "MM/dd/yy")}
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <ul className="flex flex-col gap-1">
                {items.map((entry, idx) => {
                  const typeKey = entry.entry_type as CaseLogEntryType;
                  const typeLabel = ENTRY_TYPE_LABELS[typeKey];
                  const typeColor = ENTRY_TYPE_TEXT[typeKey] ?? "text-muted-foreground";
                  const time = entry.event_time
                    ? format(parseISO(`1970-01-01T${entry.event_time}`), "h:mm a")
                    : "";
                  const isSelected = selectedEntryId === entry.id;
                  const isAlt = idx % 2 === 1;
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => onSelectEntry(entry.id)}
                        className={cn(
                          "w-full text-left px-6 py-4 flex items-center gap-4 transition-colors relative",
                          isAlt ? "bg-[#1c1c1c]" : "bg-[#141414]",
                          isSelected && "bg-[#2a1a10]",
                        )}
                      >
                        {isSelected && (
                          <span className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                        )}
                        <div className="flex-1 min-w-0 space-y-1.5">
                          {time && (
                            <p className="text-xs text-muted-foreground">{time}</p>
                          )}
                          {entry.context && (
                            <p className="text-sm font-semibold text-foreground">
                              {entry.context}
                            </p>
                          )}
                          {entry.summary && (
                            <p className="text-sm italic text-muted-foreground line-clamp-2">
                              {entry.summary}
                            </p>
                          )}
                          <p className={cn("text-sm font-medium pt-1", typeColor)}>
                            {typeLabel}
                          </p>
                          {entry.attachment_count > 0 && (
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
                              <Paperclip className="h-3 w-3" />
                              {entry.attachment_count} attachment
                              {entry.attachment_count !== 1 ? "s" : ""}
                            </p>
                          )}
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
