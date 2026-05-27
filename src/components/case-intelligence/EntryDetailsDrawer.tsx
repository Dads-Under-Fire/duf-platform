import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { X, Trash2, Pencil, Paperclip } from "lucide-react";
import { useState } from "react";
import { useCaseEntry } from "@/hooks/useCaseIntelligence";
import { useDeleteCaseLogEntry } from "@/hooks/useCaseLogEntries";
import { supabase } from "@/integrations/supabase/client";
import {
  ENTRY_TYPE_LABELS,
  COMMUNICATION_METHOD_LABELS,
  COMMUNICATION_PARTY_LABELS,
  type CaseLogEntryType,
  type CommunicationMethod,
  type CommunicationParty,
  type EntryMetadata,
} from "@/types/caseLog";
import { useToast } from "@/hooks/use-toast";
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
import { cn } from "@/lib/utils";

const ENTRY_TYPE_TEXT: Record<CaseLogEntryType, string> = {
  general_incident: "text-amber-400",
  parenting_time_exchange: "text-pink-400",
  communication: "text-sky-400",
  medical: "text-blue-400",
  school_daycare: "text-emerald-400",
  expense: "text-violet-400",
};

interface Props {
  entryId: string;
  sourceTab: "timeline" | "evidence";
  onClose: () => void;
  onEdit?: () => void;
}

export function EntryDetailsDrawer({ entryId, sourceTab, onClose, onEdit }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, isLoading } = useCaseEntry(entryId);
  const deleteEntry = useDeleteCaseLogEntry();
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  const handleEdit = () => {
    if (!data) return;
    if (onEdit) {
      onEdit();
      return;
    }
    try {
      sessionStorage.setItem(
        "caseIntel.returnContext",
        JSON.stringify({
          sourceArea: "case-intelligence",
          sourceTab,
          caseId: data.entry.case_id,
          entryId: data.entry.id,
          drawerOpen: true,
          savedAt: Date.now(),
        }),
      );
    } catch {}
    navigate(`/?editEntry=${data.entry.id}`);
  };

  const handleDelete = async () => {
    if (!data) return;
    try {
      await deleteEntry.mutateAsync({ entryId: data.entry.id, caseId: data.entry.case_id });
      toast({ title: "Entry deleted" });
      onClose();
    } catch (err: any) {
      toast({ title: "Could not delete", description: err.message, variant: "destructive" });
    }
  };

  return (
    <aside className="w-[420px] shrink-0 border-l border-border bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-3 text-foreground"
          aria-label="Close entry details"
        >
          <span className="h-6 w-6 rounded-full border-2 border-primary text-primary flex items-center justify-center">
            <X className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
          <span className="text-base font-semibold">Entry Details</span>
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="h-8 w-8 rounded-md flex items-center justify-center text-foreground hover:text-destructive transition-colors"
            aria-label="Delete entry"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleEdit}
            className="h-8 w-8 rounded-md flex items-center justify-center text-foreground hover:text-primary transition-colors"
            aria-label="Edit entry in Case Log"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {isLoading || !data ? (
          <div className="space-y-3">
            <div className="h-4 w-32 bg-muted/30 rounded animate-pulse" />
            <div className="h-3 w-48 bg-muted/30 rounded animate-pulse" />
            <div className="h-20 w-full bg-muted/20 rounded animate-pulse" />
          </div>
        ) : (
          <DrawerBody data={data} openingId={openingId} onOpenAttachment={openAttachment} />
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this case log entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the entry and all attached files. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteEntry.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}

function DrawerBody({
  data,
  openingId,
  onOpenAttachment,
}: {
  data: NonNullable<ReturnType<typeof useCaseEntry>["data"]>;
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

  const sharedNotes = Array.from(
    new Set(
      attachments
        .map((a) => (a.evidence_note ?? "").trim())
        .filter((n) => n.length > 0),
    ),
  );

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

      {sharedNotes.length > 0 && (
        <Field label="Evidence notes">
          <div className="space-y-1.5">
            {sharedNotes.map((n, i) => (
              <p key={i} className="text-sm text-foreground/90 italic whitespace-pre-wrap">
                {n}
              </p>
            ))}
          </div>
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
