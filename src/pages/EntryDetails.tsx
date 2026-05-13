import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Pencil, Trash2, FileText, Loader2 } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCaseEntry, useLatestAnalysis, useAnalysisPatterns, computeAnalysisState, formatFileSize } from "@/hooks/useCaseIntelligence";
import { useDeleteCaseLogEntry } from "@/hooks/useCaseLogEntries";
import {
  ENTRY_TYPE_LABELS,
  COMMUNICATION_METHOD_LABELS,
  COMMUNICATION_PARTY_LABELS,
  EXCHANGE_OUTCOME_LABELS,
  SCHOOL_ISSUE_TYPE_LABELS,
  EXPENSE_CATEGORY_LABELS,
  type CaseLogEntryType,
  type EntryMetadata,
  type CommunicationMethod,
  type CommunicationParty,
  type ExchangeOutcome,
  type SchoolIssueType,
  type ExpenseCategory,
} from "@/types/caseLog";
import { PatternStatusBadge } from "@/components/case-intelligence/PatternStatusBadge";

export default function EntryDetails() {
  const { entryId } = useParams<{ entryId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, isLoading } = useCaseEntry(entryId ?? null);
  const deleteEntry = useDeleteCaseLogEntry();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const caseId = data?.entry.case_id ?? null;
  const { data: latest } = useLatestAnalysis(caseId);
  const { data: patterns } = useAnalysisPatterns(latest?.id ?? null);

  const patternState = useMemo(() => {
    if (!data) return null;
    const state = computeAnalysisState(latest ?? null, [{ id: data.entry.id, updated_at: data.entry.updated_at }]);
    const names = patterns?.filter((p) => p.related_entry_ids.includes(data.entry.id)).map((p) => p.name) ?? [];
    return { state, names, isNewer: state.newEntryIds.has(data.entry.id) };
  }, [data, latest, patterns]);

  if (isLoading || !data) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading entry...
      </div>
    );
  }

  const { entry, attachments } = data;
  const meta = (entry.metadata || {}) as EntryMetadata;
  const typeLabel = ENTRY_TYPE_LABELS[entry.entry_type as CaseLogEntryType];

  const handleEdit = () => navigate(`/?editEntry=${entry.id}`);

  const handleDelete = async () => {
    try {
      await deleteEntry.mutateAsync({ entryId: entry.id, caseId: entry.case_id });
      toast({ title: "Entry deleted" });
      navigate("/case-intelligence?tab=timeline");
    } catch (err: any) {
      toast({ title: "Could not delete", description: err.message, variant: "destructive" });
    }
  };

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

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-5">
      <Link
        to="/case-intelligence?tab=timeline"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Timeline
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-secondary border border-border text-xs">{typeLabel}</span>
            {patternState && (
              <PatternStatusBadge
                status={patternState.state.status}
                isNewerThanAnalysis={patternState.isNewer}
                patternNames={patternState.names}
              />
            )}
          </div>
          <h1 className="text-xl font-semibold text-foreground">
            {format(parseISO(entry.event_date), "MMMM d, yyyy")}
            {entry.event_time && ` at ${entry.event_time.slice(0, 5)}`}
          </h1>
          {entry.context && <p className="text-sm text-muted-foreground">{entry.context}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleEdit}>
            <Pencil className="h-4 w-4 mr-2" /> Edit Case Log
          </Button>
          <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4 mr-2" /> Delete Log
          </Button>
        </div>
      </div>

      <Section title="Summary">
        <p className="text-sm text-foreground whitespace-pre-wrap">{entry.summary || <Empty />}</p>
      </Section>

      {entry.child_impact && (
        <Section title="Child's Behavior / Impact">
          <p className="text-sm text-foreground whitespace-pre-wrap">{entry.child_impact}</p>
        </Section>
      )}

      {entry.communication_involved && meta.communication && (
        <Section title="Communication Details">
          <Field label="Method" value={meta.communication.method ? COMMUNICATION_METHOD_LABELS[meta.communication.method as CommunicationMethod] ?? meta.communication.method : null} />
          <Field label="Party" value={meta.communication.contact ? COMMUNICATION_PARTY_LABELS[meta.communication.contact as CommunicationParty] ?? meta.communication.contact : null} />
          <Field label="Notes" value={meta.communication.summary} multiline />
        </Section>
      )}

      {entry.entry_type === "parenting_time_exchange" && meta.parenting_time_exchange && (
        <Section title="Parenting time / exchange">
          <Field label="Scheduled exchange time" value={meta.parenting_time_exchange.scheduled_exchange_time} />
          <Field label="Actual exchange time" value={meta.parenting_time_exchange.actual_exchange_time} />
          <Field label="Outcome" value={meta.parenting_time_exchange.outcome ? EXCHANGE_OUTCOME_LABELS[meta.parenting_time_exchange.outcome as ExchangeOutcome] ?? meta.parenting_time_exchange.outcome : null} />
        </Section>
      )}

      {entry.entry_type === "medical" && meta.medical && (
        <Section title="Medical">
          <Field label="Provider / location" value={meta.medical.provider_location} />
          <Field label="Issue / symptoms" value={meta.medical.issue_symptoms} multiline />
          <Field label="Other parent informed" value={meta.medical.other_parent_informed ? "Yes" : "No"} />
        </Section>
      )}

      {entry.entry_type === "school_daycare" && meta.school_daycare && (
        <Section title="School / daycare">
          <Field label="School / daycare" value={meta.school_daycare.school_daycare_name} />
          <Field label="Issue type" value={meta.school_daycare.issue_type ? SCHOOL_ISSUE_TYPE_LABELS[meta.school_daycare.issue_type as SchoolIssueType] ?? meta.school_daycare.issue_type : null} />
        </Section>
      )}

      {entry.entry_type === "expense" && meta.expense && (
        <Section title="Expense">
          <Field label="Amount" value={meta.expense.amount != null ? `$${meta.expense.amount}` : null} />
          <Field label="Category" value={meta.expense.expense_category ? EXPENSE_CATEGORY_LABELS[meta.expense.expense_category as ExpenseCategory] ?? meta.expense.expense_category : null} />
        </Section>
      )}

      {attachments.length > 0 && (
        <Section title={`Attachments / Evidence (${attachments.length})`}>
          <ul className="space-y-2">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 border border-border rounded-md p-3 bg-card">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">{a.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(a.file_size_bytes)}
                      {a.evidence_note ? ` · ${a.evidence_note}` : ""}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => openAttachment(a.file_path, a.id)} disabled={openingId === a.id}>
                  {openingId === a.id ? "Opening..." : "Open"}
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      )}

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
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-border rounded-lg p-4 bg-card space-y-2">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Field({ label, value, multiline }: { label: string; value?: string | null; multiline?: boolean }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={multiline ? "text-foreground whitespace-pre-wrap" : "text-foreground"}>{value}</span>
    </div>
  );
}

function Empty() {
  return <span className="text-muted-foreground italic">—</span>;
}
