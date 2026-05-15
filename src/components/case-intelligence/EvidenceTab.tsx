import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { Paperclip, FileText } from "lucide-react";
import { useCaseEvidence, formatFileSize } from "@/hooks/useCaseIntelligence";
import { ENTRY_TYPE_LABELS, type CaseLogEntryType } from "@/types/caseLog";
import { Filters, defaultFilters, type FilterState } from "./Filters";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/state";

export function EvidenceTab({ caseId }: { caseId: string }) {
  const { data: rows, isLoading, isError, error, refetch } = useCaseEvidence(caseId);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  const filtered = useMemo(() => {
    let list = rows ?? [];
    if (filters.entryType) list = list.filter((r) => r.entry?.entry_type === filters.entryType);
    if (filters.fromDate) list = list.filter((r) => (r.entry?.event_date ?? "") >= filters.fromDate);
    if (filters.toDate) list = list.filter((r) => (r.entry?.event_date ?? "") <= filters.toDate);
    list = [...list].sort((a, b) => {
      const da = a.entry?.event_date ?? a.attachment.created_at;
      const db = b.entry?.event_date ?? b.attachment.created_at;
      return filters.sort === "newest" ? (db > da ? 1 : -1) : (da > db ? 1 : -1);
    });
    return list;
  }, [rows, filters]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Filters value={filters} onChange={setFilters} />
        <ListSkeleton rows={4} />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title="Couldn't load evidence"
        error={error}
        onRetry={() => refetch()}
      />
    );
  }

  const hasAnyAttachments = (rows?.length ?? 0) > 0;
  const filtersActive = !!(filters.entryType || filters.fromDate || filters.toDate);

  return (
    <div className="space-y-4">
      <Filters value={filters} onChange={setFilters} />
      <p className="text-xs text-muted-foreground">{filtered.length} attachment{filtered.length !== 1 ? "s" : ""}</p>

      {filtered.length === 0 ? (
        !hasAnyAttachments ? (
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
        )
      ) : (
        <ul className="space-y-2">
          {filtered.map(({ attachment, entry }) => {
            const typeLabel = entry ? ENTRY_TYPE_LABELS[entry.entry_type as CaseLogEntryType] : "Unknown";
            const eventDate = entry?.event_date ? format(parseISO(entry.event_date), "MMM d, yyyy") : "";
            return (
              <li key={attachment.id} className="border border-border rounded-lg p-4 bg-card flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-1">
                      <span className="px-1.5 py-0.5 rounded bg-secondary border border-border">{typeLabel}</span>
                      {eventDate && <span>{eventDate}</span>}
                      {entry?.context && <span className="truncate max-w-[280px]">{entry.context}</span>}
                    </div>
                    <p className="text-sm text-foreground font-medium truncate">{attachment.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(attachment.file_size_bytes)}
                      {attachment.evidence_note ? ` · ${attachment.evidence_note}` : ""}
                    </p>
                  </div>
                </div>
                {entry && (
                  <Link
                    to={`/case-intelligence/entry/${entry.id}`}
                    className="text-sm text-primary hover:text-primary/80 shrink-0"
                  >
                    Open Case Log →
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
