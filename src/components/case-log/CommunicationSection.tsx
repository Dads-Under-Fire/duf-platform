import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ClearableSelect } from "@/components/ui/clearable-select";
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
  /** When true, the toggle is hidden and fields are always shown (for communication entry type) */
  forcedOpen?: boolean;
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
  forcedOpen = false,
}: CommunicationSectionProps) {
  const showFields = forcedOpen || communicationInvolved;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Communication Details</h2>

      {/* Show toggle only when not forced open */}
      {!forcedOpen && (
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
      )}

      {showFields && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Communication method</Label>
              <ClearableSelect
                value={communicationMethod}
                onValueChange={onCommunicationMethodChange}
                placeholder="Select an option..."
                options={COMMUNICATION_METHODS.map((m) => ({
                  value: m,
                  label: COMMUNICATION_METHOD_LABELS[m],
                }))}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Who communicated with you?</Label>
              <ClearableSelect
                value={communicationParty}
                onValueChange={onCommunicationPartyChange}
                placeholder="Select an option..."
                options={COMMUNICATION_PARTIES.map((p) => ({
                  value: p,
                  label: COMMUNICATION_PARTY_LABELS[p],
                }))}
              />
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
