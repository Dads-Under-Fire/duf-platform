import { ENTRY_TYPE_LABELS, type CaseLogEntryType } from "@/types/caseLog";
import { ENTRY_TYPES_LIST } from "@/hooks/useCaseIntelligence";
import { ClearableSelect } from "@/components/ui/clearable-select";
import { Input } from "@/components/ui/input";

export interface FilterState {
  entryType: CaseLogEntryType | "";
  sort: "newest" | "oldest";
  fromDate: string;
  toDate: string;
}

export const defaultFilters: FilterState = {
  entryType: "",
  sort: "newest",
  fromDate: "",
  toDate: "",
};

interface Props {
  value: FilterState;
  onChange: (v: FilterState) => void;
}

export function Filters({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[180px]">
        <label className="text-xs text-muted-foreground block mb-1">Entry type</label>
        <ClearableSelect
          value={value.entryType}
          onChange={(v) => onChange({ ...value, entryType: (v as CaseLogEntryType) || "" })}
          placeholder="All types"
          options={ENTRY_TYPES_LIST.map((t) => ({ value: t, label: ENTRY_TYPE_LABELS[t] }))}
        />
      </div>
      <div className="min-w-[140px]">
        <label className="text-xs text-muted-foreground block mb-1">Sort</label>
        <ClearableSelect
          value={value.sort}
          onChange={(v) => onChange({ ...value, sort: ((v as any) || "newest") })}
          placeholder="Newest first"
          options={[
            { value: "newest", label: "Newest first" },
            { value: "oldest", label: "Oldest first" },
          ]}
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">From</label>
        <Input type="date" value={value.fromDate} onChange={(e) => onChange({ ...value, fromDate: e.target.value })} className="w-[150px]" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">To</label>
        <Input type="date" value={value.toDate} onChange={(e) => onChange({ ...value, toDate: e.target.value })} className="w-[150px]" />
      </div>
    </div>
  );
}
