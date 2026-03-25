import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Clock, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { CommunicationSection } from "./CommunicationSection";
import { EvidenceSection } from "./EvidenceSection";
import { useCreateCaseLogEntry } from "@/hooks/useCaseLogEntries";
import {
  ENTRY_TYPE_LABELS,
  type CaseLogEntryType,
  type CommunicationMetadata,
} from "@/types/caseLog";
import { Constants } from "@/integrations/supabase/types";

interface CaseLogEntryFormProps {
  caseId: string;
}

export function CaseLogEntryForm({ caseId }: CaseLogEntryFormProps) {
  const { toast } = useToast();
  const createEntry = useCreateCaseLogEntry();

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

  // Evidence
  const [evidenceNote, setEvidenceNote] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const clearForm = () => {
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
    setEvidenceNote("");
    setSelectedFile(null);
  };

  const handleSave = async () => {
    if (!entryType || !eventDate || !eventTime || !context.trim() || !summary.trim()) {
      toast({
        title: "Missing required fields",
        description: "Please fill in Entry Type, Date, Time, Context, and Summary.",
        variant: "destructive",
      });
      return;
    }

    const metadata: CommunicationMetadata | null = communicationInvolved
      ? {
          communication_method: communicationMethod || undefined,
          communication_party: communicationParty || undefined,
          communication_summary: communicationSummary || undefined,
        }
      : null;

    try {
      await createEntry.mutateAsync({
        case_id: caseId,
        entry_type: entryType as CaseLogEntryType,
        event_date: format(eventDate, "yyyy-MM-dd"),
        event_time: eventTime + ":00",
        context: context.trim(),
        summary: summary.trim(),
        child_impact: childImpact.trim() || null,
        communication_involved: communicationInvolved,
        metadata: metadata as any,
      });

      toast({
        title: "Entry saved",
        description: "Your case log entry has been saved.",
      });
      clearForm();
    } catch (err: any) {
      toast({
        title: "Error saving entry",
        description: err.message || "Something went wrong.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 space-y-8 pb-24">
        {/* Event Details */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Event Details</h2>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Entry Type<span className="text-primary">*</span>
              </Label>
              <Select value={entryType} onValueChange={(v) => setEntryType(v as CaseLogEntryType)}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder="Select an option..." />
                </SelectTrigger>
                <SelectContent>
                  {Constants.public.Enums.case_log_entry_type.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ENTRY_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Date<span className="text-primary">*</span>
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full md:w-[160px] justify-start text-left font-normal bg-secondary border-border",
                      !eventDate && "text-muted-foreground"
                    )}
                  >
                    {eventDate ? format(eventDate, "MM/dd/yyyy") : <span>&nbsp;</span>}
                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
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
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Time<span className="text-primary">*</span>
              </Label>
              <div className="relative">
                <Input
                  type="time"
                  value={eventTime}
                  onChange={(e) => setEventTime(e.target.value)}
                  className="w-full md:w-[160px] bg-secondary border-border pr-10"
                />
                <Clock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          </div>

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
          onCommunicationInvolvedChange={setCommunicationInvolved}
          communicationMethod={communicationMethod}
          onCommunicationMethodChange={setCommunicationMethod}
          communicationParty={communicationParty}
          onCommunicationPartyChange={setCommunicationParty}
          communicationSummary={communicationSummary}
          onCommunicationSummaryChange={setCommunicationSummary}
        />

        {/* Evidence */}
        <EvidenceSection
          evidenceNote={evidenceNote}
          onEvidenceNoteChange={setEvidenceNote}
          selectedFile={selectedFile}
          onFileChange={setSelectedFile}
        />
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 right-0 left-0 md:left-auto bg-background/95 backdrop-blur border-t border-border px-4 md:px-8 py-3 flex items-center justify-end gap-4 z-10">
        <Button
          type="button"
          variant="ghost"
          onClick={clearForm}
          className="text-primary hover:text-primary"
        >
          Clear form
        </Button>
        <Button
          onClick={handleSave}
          disabled={createEntry.isPending}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          {createEntry.isPending ? "Saving..." : "Save Entry"}
        </Button>
      </div>
    </div>
  );
}
