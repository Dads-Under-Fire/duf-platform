import { ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Case } from "@/types/caseLog";

interface CaseSelectorProps {
  cases: Case[];
  activeCaseId: string | null;
  onSelectCase: (caseId: string) => void;
}

export function CaseSelector({ cases, activeCaseId, onSelectCase }: CaseSelectorProps) {
  if (cases.length === 0) return null;

  return (
    <div className="flex justify-center py-2 border-b border-border bg-card/50">
      <Select value={activeCaseId ?? undefined} onValueChange={onSelectCase}>
        <SelectTrigger className="w-auto min-w-[200px] border-0 bg-transparent text-foreground justify-center gap-2 text-sm font-medium focus:ring-0 focus:ring-offset-0">
          <SelectValue placeholder="Select a case..." />
        </SelectTrigger>
        <SelectContent>
          {cases.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.case_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
