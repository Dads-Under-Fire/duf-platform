import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COMMUNICATION_METHODS,
  COMMUNICATION_METHOD_LABELS,
  COMMUNICATION_PARTIES,
  COMMUNICATION_PARTY_LABELS,
} from "@/types/caseLog";

interface CommunicationSectionProps {
  communicationInvolved: boolean;
  onCommunicationInvolvedChange: (val: boolean) => void;
  communicationMethod: string;
  onCommunicationMethodChange: (val: string) => void;
  communicationParty: string;
  onCommunicationPartyChange: (val: string) => void;
  communicationSummary: string;
  onCommunicationSummaryChange: (val: string) => void;
}

export function CommunicationSection({
  communicationInvolved,
  onCommunicationInvolvedChange,
  communicationMethod,
  onCommunicationMethodChange,
  communicationParty,
  onCommunicationPartyChange,
  communicationSummary,
  onCommunicationSummaryChange,
}: CommunicationSectionProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Communication Details</h2>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Was communication involved?</Label>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <span
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                communicationInvolved ? "border-primary" : "border-muted-foreground"
              }`}
            >
              {communicationInvolved && (
                <span className="w-2.5 h-2.5 rounded-full bg-primary" />
              )}
            </span>
            <input
              type="radio"
              className="sr-only"
              checked={communicationInvolved}
              onChange={() => onCommunicationInvolvedChange(true)}
            />
            <span className="text-sm text-foreground">Yes</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <span
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                !communicationInvolved ? "border-muted-foreground" : "border-muted-foreground"
              }`}
            >
              {!communicationInvolved && (
                <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground" />
              )}
            </span>
            <input
              type="radio"
              className="sr-only"
              checked={!communicationInvolved}
              onChange={() => onCommunicationInvolvedChange(false)}
            />
            <span className="text-sm text-foreground">No</span>
          </label>
        </div>
      </div>

      {communicationInvolved && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Communication method</Label>
              <Select value={communicationMethod} onValueChange={onCommunicationMethodChange}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder="Select an option..." />
                </SelectTrigger>
                <SelectContent>
                  {COMMUNICATION_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {COMMUNICATION_METHOD_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Who communicated with you?</Label>
              <Select value={communicationParty} onValueChange={onCommunicationPartyChange}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder="Select an option..." />
                </SelectTrigger>
                <SelectContent>
                  {COMMUNICATION_PARTIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {COMMUNICATION_PARTY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Communication Summary</Label>
            <Textarea
              value={communicationSummary}
              onChange={(e) => onCommunicationSummaryChange(e.target.value)}
              placeholder="What was said or communicated? Include the key details only."
              className="min-h-[100px] bg-secondary border-border"
            />
          </div>
        </>
      )}
    </div>
  );
}
