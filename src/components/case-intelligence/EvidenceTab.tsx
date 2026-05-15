import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { Paperclip, ArrowDownUp, CalendarRange, ChevronRight } from "lucide-react";
import { useCaseEvidence } from "@/hooks/useCaseIntelligence";
import { formatFileSize } from "@/lib/format";
import { ENTRY_TYPE_LABELS, type CaseLogEntryType, type CaseLogEntry, type CaseLogAttachment } from "@/types/caseLog";
import { ENTRY_TYPES_LIST } from "@/hooks/useCaseIntelligence";
import { ClearableSelect } from "@/components/ui/clearable-select";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/state";
import { cn } from "@/lib/utils";

interface FilterState {
  entryType: CaseLogEntryType | "";
  sort: "newest" | "oldest";
  fromDate: string;
  toDate: string;
}
const defaultFilters: FilterState = { entryType: "", sort: "newest", fromDate: "", toDate: "" };

/** Per-entry-type accent text color for the row header line. */
const ENTRY_TYPE_TEXT: Record<CaseLogEntryType, string> = {
  general_incident: "text-amber-400",
  parenting_time_exchange: "text-pink-400",
  communication: "text-sky-400",
  medical: "text-blue-400",
  school_daycare: "text-emerald-400",
  expense: "text-violet-400",
};

interface GroupedEntry {
  entry: CaseLogEntry;
  attachments: CaseLogAttachment[];
}

export function EvidenceTab({ caseId }: { caseId: string }) {
  const { data: rows, isLoading, isError, error, refetch } = useCaseEvidence(caseId);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  /** Group attachments by their parent case-log entry. */
  const grouped = useMemo<GroupedEntry[]>(() => {
    const map = new Map<string, GroupedEntry>();
    (rows ?? []).forEach(({ attachment, entry }) => {
      if (!entry) return;
      const existing = map.get(entry.id);
      if (existing) {
        existing.attachments.push(attachment);
      } else {
        map.set(entry.id, { entry, attachments: [attachment] });
      }
    });
    return Array.from(map.values());
  }, [rows]);

  const filtered = useMemo(() => {
    let list = grouped;
    if (filters.entryType) list = list.filter((g) => g.entry.entry_type === filters.entryType);
    if (filters.fromDate) list = list.filter((g) => (g.entry.event_date ?? "") >= filters.fromDate);
    if (filters.toDate) list = list.filter((g) => (g.entry.event_date ?? "") <= filters.toDate);
    list = [...list].sort((a, b) => {
      const da = `${a.entry.event_date ?? ""} ${a.entry.event_time ?? ""}`;
      const db = `${b.entry.event_date ?? ""} ${b.entry.event_time ?? ""}`;
      return filters.sort === "newest" ? (db > da ? 1 : -1) : (da > db ? 1 : -1);
    });
    return list;
  }, [grouped, filters]);

  const totalAttachments = rows?.length ?? 0;
  const hasAnyAttachments = totalAttachments > 0;
  const filtersActive = !!(filters.entryType || filters.fromDate || filters.toDate);

  return (
    <div className="-mx-4 md:-mx-6">
      {/* Compact control row */}
      <div className="px-4 md:px-6 pb-4 flex items-center justify-between gap-3">
        <div className="min-w-[200px]">
          <ClearableSelect
            value={filters.entryType}
            onValueChange={(v) =>
              setFilters({ ...filters, entryType: (v as CaseLogEntryType) || "" })
            }
            placeholder="All entry types"
            options={ENTRY_TYPES_LIST.map((t) => ({ value: t, label: ENTRY_TYPE_LABELS[t] }))}
          />
        </div>

        <div className="flex items-center gap-3 text-foreground">
          <button
            type="button"
            onClick={() =>
              setFilters({ ...filters, sort: filters.sort === "newest" ? "oldest" : "newest" })
            }
            title={`Sort: ${filters.sort === "newest" ? "Newest first" : "Oldest first"}`}
            className="h-9 w-9 rounded-md flex items-center justify-center text-foreground/90 hover:text-foreground hover:bg-secondary transition-colors"
          >
            <ArrowDownUp className="h-[18px] w-[18px]" />
          </button>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                title="Filter by date range"
                className={cn(
                  "h-9 w-9 rounded-md flex items-center justify-center hover:bg-secondary transition-colors",
                  filters.fromDate || filters.toDate
                    ? "text-primary"
                    : "text-foreground/90 hover:text-foreground",
                )}
              >
                <CalendarRange className="h-[18px] w-[18px]" />
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
        <div className="px-4 md:px-6">
          <ListSkeleton rows={4} />
        </div>
      ) : isError ? (
        <div className="px-4 md:px-6">
          <ErrorState title="Couldn't load evidence" error={error} onRetry={() => refetch()} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-4 md:px-6">
          {!hasAnyAttachments ? (
            <EmptyState
              icon={<Paperclip className="h-8 w-8" />}
              title="No evidence has been added yet."
              description="Attach files when creating a new Case Log entry, or open an existing entry from Timeline to add supporting evidence."
            />
          ) : (
            <EmptyState
              icon={<Paperclip className="h-8 w-8" />}
              title="No evidence matches the current filters."
              description={filtersActive ? "Try clearing or adjusting the filters above." : undefined}
            />
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {filtered.map(({ entry, attachments }, idx) => {
            const typeKey = entry.entry_type as CaseLogEntryType;
            const typeLabel = ENTRY_TYPE_LABELS[typeKey] ?? "Unknown";
            const typeColor = ENTRY_TYPE_TEXT[typeKey] ?? "text-muted-foreground";

            const eventDate = entry.event_date
              ? format(parseISO(entry.event_date), "MM/dd/yy")
              : "";
            const eventTime = entry.event_time
              ? format(parseISO(`1970-01-01T${entry.event_time}`), "h:mma").toLowerCase()
              : "";

            const isAlt = idx % 2 === 1;
            return (
              <li
                key={entry.id}
                className={cn(
                  "px-6 md:px-10 py-5 flex items-start gap-6",
                  isAlt ? "bg-[#1c1c1c]" : "bg-[#141414]",
                )}
              >
                <div className="flex-1 min-w-0 space-y-4">
                  {/* A. Header line */}
                  <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className={cn("font-medium", typeColor)}>{typeLabel}</span>
                    {(eventDate || eventTime) && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">
                          {eventDate}
                          {eventDate && eventTime ? " - " : ""}
                          {eventTime}
                        </span>
                      </>
                    )}
                  </div>

                  {/* B. Source entry */}
                  {entry.context && (
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Source entry</p>
                      <p className="text-sm text-foreground font-medium">{entry.context}</p>
                    </div>
                  )}

                  {/* C. Attachments — one row per file with its own evidence note */}
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      {attachments.length === 1 ? "Attachment" : "Attachments"}
                    </p>
                    <div className="space-y-3">
                      {attachments.map((a) => (
                        <div key={a.id} className="space-y-1">
                          <div className="flex items-baseline gap-2">
                            <Paperclip className="h-3.5 w-3.5 text-muted-foreground self-center shrink-0" />
                            <span className="text-sm text-foreground truncate">{a.file_name}</span>
                          </div>
                          <p className="text-xs text-muted-foreground pl-[22px]">
                            {formatFileSize(a.file_size_bytes)}
                          </p>
                          {a.evidence_note && (
                            <div className="pl-[22px] pt-1 space-y-0.5">
                              <p className="text-xs text-muted-foreground">Evidence note</p>
                              <p className="text-sm text-foreground/90 italic">{a.evidence_note}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* D. Right action */}
                <Link
                  to={`/case-intelligence/entry/${entry.id}`}
                  className="shrink-0 self-center inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  Open Case Log
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
