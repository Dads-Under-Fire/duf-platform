import { useState, useRef } from "react";
import { Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TimeInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

export function TimeInput({
  value,
  onChange,
  className,
  placeholder = "Select time",
}: TimeInputProps) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const showNativePicker = focused || !!value;

  return (
    <div className="relative">
      {showNativePicker ? (
        <Input
          ref={inputRef}
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setFocused(false)}
          autoFocus={focused && !value}
          className={cn("bg-secondary border-border pr-10", className)}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setFocused(true);
            // Small delay to let the input render before focusing
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-secondary px-3 py-2 text-sm text-muted-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            className
          )}
        >
          {placeholder}
          <Clock className="ml-auto h-4 w-4 opacity-50" />
        </button>
      )}
      {showNativePicker && (
        <Clock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      )}
    </div>
  );
}
