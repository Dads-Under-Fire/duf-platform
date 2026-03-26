import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface ClearableSelectProps {
  value: string;
  onValueChange: (val: string) => void;
  placeholder?: string;
  options: { value: string; label: string }[];
  className?: string;
  triggerClassName?: string;
}

export function ClearableSelect({
  value,
  onValueChange,
  placeholder = "Select an option...",
  options,
  className,
  triggerClassName,
}: ClearableSelectProps) {
  return (
    <div className={cn("relative", className)}>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className={cn("bg-secondary border-border", value && "pr-8", triggerClassName)}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onValueChange("");
          }}
          className="absolute right-8 top-1/2 -translate-y-1/2 p-0.5 rounded-sm text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Clear selection"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
