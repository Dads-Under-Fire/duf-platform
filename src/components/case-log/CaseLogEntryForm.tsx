import { useState, useEffect, useCallback, useRef } from "react";
import { format, parseISO } from "date-fns";
import { CalendarIcon, Save, X, ArrowLeft, Pencil } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimeInput } from "@/components/ui/time-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ClearableSelect } from "@/components/ui/clearable-select";
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
import { useToast } from "@/hooks/use-toast";
import { CommunicationSection } from "./CommunicationSection";
import { EvidenceSection } from "./EvidenceSection";
import { RecentEntries } from "./RecentEntries";
import { useCreateCaseLogEntry, useUpdateCaseLogEntry, useRecentCaseLogEntries, useDeleteAttachment } from "@/hooks/useCaseLogEntries";
import { supabase } from "@/integrations/supabase/client";
import type { CaseLogAttachment } from "@/types/caseLog";
import {
  ENTRY_TYPE_LABELS,
  EXCHANGE_OUTCOMES,
  EXCHANGE_OUTCOME_LABELS,
  SCHOOL_ISSUE_TYPES,
  SCHOOL_ISSUE_TYPE_LABELS,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type CaseLogEntryType,
  type EntryMetadata,
} from "@/types/caseLog";
import { Constants } from "@/integrations/supabase/types";
import type { CaseLogReturnContext } from "@/pages/CaseLog";

interface CaseLogEntryFormProps {
  caseId: string;
  initialEditEntryId?: string | null;
  onEditLoaded?: () => void;
  returnContext?: CaseLogReturnContext | null;
  onReturnToSource?: () => void;
}

export function CaseLogEntryForm({ caseId, initialEditEntryId, onEditLoaded, returnContext, onReturnToSource }: CaseLogEntryFormProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const createEntry = useCreateCaseLogEntry();
  const updateEntry = useUpdateCaseLogEntry();
  const deleteAttachment = useDeleteAttachment();
  const formTopRef = useRef<HTMLDivElement>(null);


  // Edit mode
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [existingAttachments, setExistingAttachments] = useState<CaseLogAttachment[]>([]);

  // Event details
  const [entryType, setEntryType] = useState<CaseLogEntryType | "">("");
  const [eventDate, setEventDate] = useState<Date | undefined>();
  const [eventTime, setEventTime] = useState("");
  const [context, setContext] = useState("");
  const [summary, setSummary] = useState("");
  const [childImpact, setChildImpact] = useState("");

  // Communication
  const [communicationInvolved, setCommunicationInvolved] = useState(false);
  const [communicationMethod, setCommunicationMethod] = useState("");
  const [communicationParty, setCommunicationParty] = useState("");
  const [communicationSummary, setCommunicationSummary] = useState("");

  // Parenting time exchange
  const [scheduledExchangeTime, setScheduledExchangeTime] = useState("");
  const [actualExchangeTime, setActualExchangeTime] = useState("");
  const [exchangeOutcome, setExchangeOutcome] = useState("");

  // Medical
  const [providerLocation, setProviderLocation] = useState("");
  const [issueSymptoms, setIssueSymptoms] = useState("");
  const [otherParentInformed, setOtherParentInformed] = useState(false);

  // School / daycare
  const [schoolDaycareName, setSchoolDaycareName] = useState("");
  const [schoolIssueType, setSchoolIssueType] = useState("");

  // Expense
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("");

  // Evidence
  const [evidenceNote, setEvidenceNote] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Saving state
  const [isSaving, setIsSaving] = useState(false);

  // Snapshot of loaded entry values, used to detect dirty changes when in
  // edit-mode launched from Case Intelligence.
  const [editLoadSnapshot, setEditLoadSnapshot] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);


  useEffect(() => {
    if (entryType === "communication") {
      setCommunicationInvolved(true);
    }
  }, [entryType]);

  // Reset edit mode when case changes
  useEffect(() => {
    setEditingEntryId(null);
    resetForm();
  }, [caseId]);

  // Honor initialEditEntryId from query param handoff
  useEffect(() => {
    if (initialEditEntryId) {
      loadEntryForEdit(initialEditEntryId);
      onEditLoaded?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditEntryId]);

  // After load commits, snapshot the form so we can detect dirty changes.
  useEffect(() => {
    if (!editingEntryId) {
      setEditLoadSnapshot(null);
      return;
    }
    // Defer so all state updates from loadEntryForEdit have committed.
    const t = setTimeout(() => setEditLoadSnapshot(buildSnapshot()), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingEntryId, existingAttachments.length]);


  const handleCommunicationInvolvedChange = (val: boolean) => {
    setCommunicationInvolved(val);
    if (!val) {
      setCommunicationMethod("");
      setCommunicationParty("");
      setCommunicationSummary("");
    }
  };

  const isFormDirty = useCallback(() => {
    return !!(
      entryType ||
      eventDate ||
      eventTime ||
      context.trim() ||
      summary.trim() ||
      childImpact.trim() ||
      communicationMethod ||
      communicationParty ||
      communicationSummary.trim() ||
      scheduledExchangeTime ||
      actualExchangeTime ||
      exchangeOutcome ||
      providerLocation.trim() ||
      issueSymptoms.trim() ||
      schoolDaycareName.trim() ||
      schoolIssueType ||
      expenseAmount ||
      expenseCategory ||
      evidenceNote.trim() ||
      selectedFiles.length > 0
    );
  }, [
    entryType, eventDate, eventTime, context, summary, childImpact,
    communicationMethod, communicationParty, communicationSummary,
    scheduledExchangeTime, actualExchangeTime, exchangeOutcome,
    providerLocation, issueSymptoms, schoolDaycareName, schoolIssueType,
    expenseAmount, expenseCategory, evidenceNote, selectedFiles,
  ]);

  const resetForm = () => {
    setEntryType("");
    setEventDate(undefined);
    setEventTime("");
    setContext("");
    setSummary("");
    setChildImpact("");
    setCommunicationInvolved(false);
    setCommunicationMethod("");
    setCommunicationParty("");
    setCommunicationSummary("");
    setScheduledExchangeTime("");
    setActualExchangeTime("");
    setExchangeOutcome("");
    setProviderLocation("");
    setIssueSymptoms("");
    setOtherParentInformed(false);
    setSchoolDaycareName("");
    setSchoolIssueType("");
    setExistingAttachments([]);
    setExpenseAmount("");
    setExpenseCategory("");
    setEvidenceNote("");
    setSelectedFiles([]);
    setEditingEntryId(null);
  };

  const buildSnapshot = useCallback((): string => {
    return JSON.stringify({
      entryType,
      eventDate: eventDate ? eventDate.toISOString() : null,
      eventTime,
      context,
      summary,
      childImpact,
      communicationInvolved,
      communicationMethod,
      communicationParty,
      communicationSummary,
      scheduledExchangeTime,
      actualExchangeTime,
      exchangeOutcome,
      providerLocation,
      issueSymptoms,
      otherParentInformed,
      schoolDaycareName,
      schoolIssueType,
      expenseAmount,
      expenseCategory,
      evidenceNote,
      attachmentIds: existingAttachments.map((a) => a.id),
      newFiles: selectedFiles.map((f) => `${f.name}:${f.size}`),
    });
  }, [
    entryType, eventDate, eventTime, context, summary, childImpact,
    communicationInvolved, communicationMethod, communicationParty, communicationSummary,
    scheduledExchangeTime, actualExchangeTime, exchangeOutcome,
    providerLocation, issueSymptoms, otherParentInformed,
    schoolDaycareName, schoolIssueType, expenseAmount, expenseCategory,
    evidenceNote, existingAttachments, selectedFiles,
  ]);

  const isDirtyVsSnapshot = !!editLoadSnapshot && editLoadSnapshot !== buildSnapshot();

  const handleClearForm = () => {
    if (!isFormDirty() && !editingEntryId) return;
    if (!window.confirm("Clear all form fields? Unsaved changes will be lost.")) return;
    resetForm();
    setEditLoadSnapshot(null);
  };

  const handleCancelEdit = () => {
    // When launched from Case Intelligence, Cancel returns to source.
    if (returnContext && onReturnToSource) {
      if (isDirtyVsSnapshot) {
        setConfirmDiscard(true);
      } else {
        onReturnToSource();
      }
      return;
    }
    resetForm();
    setEditLoadSnapshot(null);
  };

  const handleConfirmDiscard = () => {
    setConfirmDiscard(false);
    onReturnToSource?.();
  };


  const loadEntryForEdit = async (entryId: string) => {
    try {
      const { data: entry, error } = await supabase
        .from("case_log_entries")
        .select("*")
        .eq("id", entryId)
        .single();
      if (error || !entry) {
        toast({ title: "Could not load entry", variant: "destructive" });
        return;
      }

      // Reset first to clear stale metadata
      resetForm();

      setEditingEntryId(entry.id);
      setEntryType(entry.entry_type as CaseLogEntryType);
      setEventDate(entry.event_date ? parseISO(entry.event_date) : undefined);
      setEventTime(entry.event_time ? entry.event_time.slice(0, 5) : "");
      setContext(entry.context || "");
      setSummary(entry.summary || "");
      setChildImpact(entry.child_impact || "");
      setCommunicationInvolved(entry.communication_involved || false);

      const meta = (entry.metadata || {}) as EntryMetadata;

      if (meta.communication) {
        setCommunicationMethod(meta.communication.method || "");
        setCommunicationParty(meta.communication.contact || "");
        setCommunicationSummary(meta.communication.summary || "");
      }

      if (meta.parenting_time_exchange) {
        setScheduledExchangeTime(meta.parenting_time_exchange.scheduled_exchange_time || "");
        setActualExchangeTime(meta.parenting_time_exchange.actual_exchange_time || "");
        setExchangeOutcome(meta.parenting_time_exchange.outcome || "");
      }

      if (meta.medical) {
        setProviderLocation(meta.medical.provider_location || "");
        setIssueSymptoms(meta.medical.issue_symptoms || "");
        setOtherParentInformed(meta.medical.other_parent_informed || false);
      }

      if (meta.school_daycare) {
        setSchoolDaycareName(meta.school_daycare.school_daycare_name || "");
        setSchoolIssueType(meta.school_daycare.issue_type || "");
      }

      if (meta.expense) {
        setExpenseAmount(meta.expense.amount != null ? String(meta.expense.amount) : "");
        setExpenseCategory(meta.expense.expense_category || "");
      }

      // Load existing attachments
      const { data: attachments } = await supabase
        .from("case_log_attachments")
        .select("*")
        .eq("case_log_entry_id", entry.id);
      setExistingAttachments(attachments || []);

      // Scroll to top of form
      setTimeout(() => {
        formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch {
      toast({ title: "Could not load entry", variant: "destructive" });
    }
  };

  const buildMetadata = (): EntryMetadata => {
    const meta: EntryMetadata = {};

    if (communicationInvolved) {
      meta.communication = {
        method: communicationMethod || undefined,
        contact: communicationParty || undefined,
        summary: communicationSummary || undefined,
      };
    }

    if (entryType === "parenting_time_exchange") {
      meta.parenting_time_exchange = {
        scheduled_exchange_time: scheduledExchangeTime || undefined,
        actual_exchange_time: actualExchangeTime || undefined,
        outcome: exchangeOutcome || undefined,
      };
    }

    if (entryType === "medical") {
      meta.medical = {
        provider_location: providerLocation || undefined,
        issue_symptoms: issueSymptoms || undefined,
        other_parent_informed: otherParentInformed,
      };
    }

    if (entryType === "school_daycare") {
      meta.school_daycare = {
        school_daycare_name: schoolDaycareName || undefined,
        issue_type: schoolIssueType || undefined,
      };
    }

    if (entryType === "expense") {
      const parsed = parseFloat(expenseAmount);
      meta.expense = {
        amount: isNaN(parsed) ? undefined : Math.round(parsed * 100) / 100,
        expense_category: expenseCategory || undefined,
      };
    }

    return meta;
  };

  const handleSave = async () => {
    if (isSaving) return;

    const missingFields: string[] = [];
    if (!entryType) missingFields.push("Entry Type");
    if (!eventDate) missingFields.push("Date");
    if (!eventTime) missingFields.push("Time");
    if (!context.trim()) missingFields.push("Context");
    if (!summary.trim()) missingFields.push("Summary");

    if (missingFields.length > 0) {
      toast({
        title: "Missing required fields",
        description: `Please fill in: ${missingFields.join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    const metadata = buildMetadata();

    try {
      if (editingEntryId) {
        // UPDATE existing entry
        const result = await updateEntry.mutateAsync({
          entryId: editingEntryId,
          entry: {
            entry_type: entryType as CaseLogEntryType,
            event_date: format(eventDate!, "yyyy-MM-dd"),
            event_time: eventTime + ":00",
            context: context.trim(),
            summary: summary.trim(),
            child_impact: childImpact.trim() || null,
            communication_involved: communicationInvolved,
            metadata: metadata as any,
          },
          files: selectedFiles.length > 0 ? selectedFiles : undefined,
          evidenceNote: evidenceNote,
        });

        if (result.attachmentError) {
          toast({
            title: "Entry updated, but new attachment failed",
            description: result.attachmentError,
            variant: "destructive",
          });
        } else {
          toast({ title: "Entry updated", description: "Your case log entry has been updated." });
        }
      } else {
        // CREATE new entry
        const result = await createEntry.mutateAsync({
          entry: {
            case_id: caseId,
            entry_type: entryType as CaseLogEntryType,
            event_date: format(eventDate!, "yyyy-MM-dd"),
            event_time: eventTime + ":00",
            context: context.trim(),
            summary: summary.trim(),
            child_impact: childImpact.trim() || null,
            communication_involved: communicationInvolved,
            metadata: metadata as any,
          },
          files: selectedFiles,
          evidenceNote: evidenceNote,
        });

        if (result.attachmentError) {
          toast({
            title: "Entry saved, but attachment failed",
            description: result.attachmentError,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Entry saved",
            description: "Entry saved and added to Case Intelligence.",
            action: (
              <Button
                variant="outline"
                size="sm"
                className="border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                onClick={() => navigate("/case-intelligence")}
              >
                View Case Intelligence
              </Button>
            ),
          });
        }
      }

      // When launched from Case Intelligence, return to source after save.
      if (returnContext && onReturnToSource) {
        resetForm();
        setEditLoadSnapshot(null);
        onReturnToSource();
        return;
      }

      resetForm();
      setEditLoadSnapshot(null);
    } catch (err: any) {
      toast({
        title: editingEntryId ? "Error updating entry" : "Error saving entry",
        description: err.message || "Something went wrong. Your form data has been preserved.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const isCommunicationType = entryType === "communication";
  const sourceLabel = returnContext?.sourceTab === "evidence" ? "Evidence" : "Timeline";

  const editBarLabel = returnContext
    ? `Editing entry from ${sourceLabel}`
    : "Editing existing entry";

  return (
    <div className="flex-1 overflow-y-auto relative">
      {/* Shared sticky edit-mode bar — same treatment for every edit entry point */}
      {editingEntryId && (
        <div className="sticky top-0 z-20 bg-background border-b border-border">
          <div className="max-w-4xl mx-auto px-4 md:px-8 py-2.5 flex items-center gap-3">
            <Pencil className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm font-medium text-foreground">{editBarLabel}</span>
            {returnContext && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="ml-auto inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors font-medium"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to {sourceLabel}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 space-y-8 pb-8">
        <div ref={formTopRef} />




        {/* Event Details */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Event Details</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Entry Type<span className="text-primary">*</span>
              </Label>
              <ClearableSelect
                value={entryType}
                onValueChange={(v) => setEntryType(v as CaseLogEntryType | "")}
                placeholder="Select an option..."
                options={Constants.public.Enums.case_log_entry_type.map((t) => ({
                  value: t,
                  label: ENTRY_TYPE_LABELS[t],
                }))}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Date<span className="text-primary">*</span>
              </Label>
              <div className="relative">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal bg-secondary border-border",
                        !eventDate && "text-muted-foreground",
                        eventDate && "pr-8"
                      )}
                    >
                      {eventDate ? format(eventDate, "MM/dd/yyyy") : <span>Select date</span>}
                      {!eventDate && <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={eventDate}
                      onSelect={setEventDate}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                {eventDate && (
                  <button
                    type="button"
                    onClick={() => setEventDate(undefined)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-sm text-muted-foreground hover:text-foreground transition-colors z-10"
                    aria-label="Clear date"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Time<span className="text-primary">*</span>
              </Label>
              <TimeInput
                value={eventTime}
                onChange={setEventTime}
              />
            </div>
          </div>

          {/* --- Parenting Time Exchange fields --- */}
          {entryType === "parenting_time_exchange" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Scheduled exchange time</Label>
                <TimeInput
                  value={scheduledExchangeTime}
                  onChange={setScheduledExchangeTime}
                  placeholder="Select time"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Actual exchange time</Label>
                <TimeInput
                  value={actualExchangeTime}
                  onChange={setActualExchangeTime}
                  placeholder="Select time"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Outcome</Label>
                <ClearableSelect
                  value={exchangeOutcome}
                  onValueChange={setExchangeOutcome}
                  placeholder="Select an option..."
                  options={EXCHANGE_OUTCOMES.map((o) => ({
                    value: o,
                    label: EXCHANGE_OUTCOME_LABELS[o],
                  }))}
                />
              </div>
            </div>
          )}

          {/* --- Medical fields --- */}
          {entryType === "medical" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Provider / location</Label>
                <Input
                  value={providerLocation}
                  onChange={(e) => setProviderLocation(e.target.value)}
                  placeholder="Enter the provider, clinic, hospital, or location."
                  className="bg-secondary border-border"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Issue / symptoms</Label>
                <Textarea
                  value={issueSymptoms}
                  onChange={(e) => setIssueSymptoms(e.target.value)}
                  placeholder="Describe the medical issue, symptoms, or reason for care."
                  className="min-h-[80px] bg-secondary border-border"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Was the other parent informed?</Label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${otherParentInformed ? "border-primary" : "border-muted-foreground"}`}>
                      {otherParentInformed && <span className="w-2.5 h-2.5 rounded-full bg-primary" />}
                    </span>
                    <input type="radio" className="sr-only" checked={otherParentInformed} onChange={() => setOtherParentInformed(true)} />
                    <span className="text-sm text-foreground">Yes</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${!otherParentInformed ? "border-muted-foreground" : "border-muted-foreground"}`}>
                      {!otherParentInformed && <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground" />}
                    </span>
                    <input type="radio" className="sr-only" checked={!otherParentInformed} onChange={() => setOtherParentInformed(false)} />
                    <span className="text-sm text-foreground">No</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* --- School / Daycare fields --- */}
          {entryType === "school_daycare" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">School / daycare name</Label>
                <Input
                  value={schoolDaycareName}
                  onChange={(e) => setSchoolDaycareName(e.target.value)}
                  placeholder="Enter the school or daycare name."
                  className="bg-secondary border-border"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Issue type</Label>
                <ClearableSelect
                  value={schoolIssueType}
                  onValueChange={setSchoolIssueType}
                  placeholder="Select an option..."
                  options={SCHOOL_ISSUE_TYPES.map((t) => ({
                    value: t,
                    label: SCHOOL_ISSUE_TYPE_LABELS[t],
                  }))}
                />
              </div>
            </div>
          )}

          {/* --- Expense fields --- */}
          {entryType === "expense" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Amount ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  placeholder="0.00"
                  className="bg-secondary border-border"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Expense category</Label>
                <ClearableSelect
                  value={expenseCategory}
                  onValueChange={setExpenseCategory}
                  placeholder="Select an option..."
                  options={EXPENSE_CATEGORIES.map((c) => ({
                    value: c,
                    label: EXPENSE_CATEGORY_LABELS[c],
                  }))}
                />
              </div>
            </div>
          )}

          {/* --- Base fields (always shown) --- */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Context<span className="text-primary">*</span>
            </Label>
            <Input
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder={`"Pickup at daycare" or "Video call"`}
              className="bg-secondary border-border"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Summary<span className="text-primary">*</span>
            </Label>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="What happened? Include only the facts."
              className="min-h-[120px] bg-secondary border-border"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Child's Behavior / Impact (optional)
            </Label>
            <Textarea
              value={childImpact}
              onChange={(e) => setChildImpact(e.target.value)}
              placeholder="How did this affect your child, if relevant?"
              className="min-h-[80px] bg-secondary border-border"
            />
          </div>
        </div>

        {/* Communication Details */}
        <CommunicationSection
          communicationInvolved={communicationInvolved}
          onCommunicationInvolvedChange={handleCommunicationInvolvedChange}
          communicationMethod={communicationMethod}
          onCommunicationMethodChange={setCommunicationMethod}
          communicationParty={communicationParty}
          onCommunicationPartyChange={setCommunicationParty}
          communicationSummary={communicationSummary}
          onCommunicationSummaryChange={setCommunicationSummary}
          forcedOpen={isCommunicationType}
        />

        {/* Evidence */}
        <EvidenceSection
          evidenceNote={evidenceNote}
          onEvidenceNoteChange={setEvidenceNote}
          selectedFiles={selectedFiles}
          onFilesChange={setSelectedFiles}
          existingAttachments={existingAttachments}
          onDeleteExistingAttachment={async (attachmentId) => {
            const att = existingAttachments.find((a) => a.id === attachmentId);
            if (!att) return;
            try {
              await deleteAttachment.mutateAsync({ attachmentId, filePath: att.file_path });
              setExistingAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
              toast({ title: "Attachment removed" });
            } catch (err: any) {
              toast({ title: "Failed to remove attachment", description: err.message, variant: "destructive" });
            }
          }}
          onDeleteAllExistingAttachments={async () => {
            if (!window.confirm("Remove all existing attachments? This cannot be undone.")) return;
            try {
              for (const att of existingAttachments) {
                await deleteAttachment.mutateAsync({ attachmentId: att.id, filePath: att.file_path });
              }
              setExistingAttachments([]);
              toast({ title: "All attachments removed" });
            } catch (err: any) {
              toast({ title: "Failed to remove attachments", description: err.message, variant: "destructive" });
            }
          }}
        />

        {/* Form Actions — inline, not fixed */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {editingEntryId && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleCancelEdit}
              disabled={isSaving}
              className="text-muted-foreground hover:text-foreground"
            >
              Cancel
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={handleClearForm}
            disabled={isSaving}
            className="text-primary hover:text-primary"
          >
            Clear form
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {isSaving
              ? selectedFiles.length > 0
                ? `Uploading ${selectedFiles.length} file${selectedFiles.length > 1 ? "s" : ""}...`
                : (editingEntryId ? "Updating..." : "Saving...")
              : (editingEntryId ? "Update Entry" : "Save Entry")}
          </Button>
        </div>
        {isSaving && selectedFiles.length > 0 && (
          <p className="text-xs text-muted-foreground text-right -mt-4">
            Please keep this tab open while files upload.
          </p>
        )}

        {/* Separator */}
        <div className="border-t border-border" />

        {/* Recent Entries */}
        <RecentEntries caseId={caseId} onEditEntry={loadEntryForEdit} />
      </div>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved edits to this entry. Returning to {sourceLabel} will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDiscard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard changes and return
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
