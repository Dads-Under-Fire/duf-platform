import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Clock, Paperclip, Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRecentCaseLogEntries, useDeleteCaseLogEntry } from "@/hooks/useCaseLogEntries";
import { useToast } from "@/hooks/use-toast";
import { ENTRY_TYPE_LABELS, type CaseLogEntryType } from "@/types/caseLog";
import { ErrorState, ListSkeleton } from "@/components/ui/state";

interface RecentEntriesProps {
  caseId: string;
  onEditEntry: (entryId: string) => void;
}

export function RecentEntries({ caseId, onEditEntry }: RecentEntriesProps) {
  const { data: entries, isLoading, isError, error, refetch } = useRecentCaseLogEntries(caseId, 5);
  const deleteEntry = useDeleteCaseLogEntry();
  const { toast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteEntry.mutateAsync({ entryId: deleteTarget.id, caseId });
      toast({ title: "Entry deleted", description: "The case log entry and all attached files have been permanently removed." });
    } catch (err: any) {
      toast({ title: "Error deleting entry", description: err.message, variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Recent Entries</h2>
        <ListSkeleton rows={3} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Recent Entries</h2>
        <ErrorState
          title="Couldn't load recent entries"
          error={error}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Recent Entries</h2>
        <p className="text-sm text-muted-foreground">No entries yet. Use the form above to create your first case log entry.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Recent Entries</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Open a recent case log entry to edit it or add supporting evidence.
        </p>
      </div>

      <div className="space-y-2">
        {entries.map((entry) => {
          const typeLabel = ENTRY_TYPE_LABELS[entry.entry_type as CaseLogEntryType] || entry.entry_type;
          const eventDate = entry.event_date ? format(parseISO(entry.event_date), "MM/dd/yyyy") : "";
          const eventTime = entry.event_time ? entry.event_time.slice(0, 5) : "";

          return (
            <div
              key={entry.id}
              className="border border-border rounded-lg p-3 flex items-start gap-3 bg-secondary/50 hover:bg-secondary transition-colors"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground">{typeLabel}</span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {eventDate} {eventTime && `at ${eventTime}`}
                  </span>
                  {entry.attachment_count > 0 && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Paperclip className="h-3 w-3" />
                      {entry.attachment_count}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {entry.context || entry.summary}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => onEditEntry(entry.id)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleteTarget({ id: entry.id, label: typeLabel })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Link
        to="/case-intelligence"
        className="text-sm text-primary hover:text-primary/80 transition-colors inline-block mt-2"
      >
        View full timeline in Case Intelligence →
      </Link>

      {/* Delete confirmation modal */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete case log entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this {deleteTarget?.label} entry, all attached files, and any connected data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteEntry.isPending ? "Deleting..." : "Delete Entry"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
