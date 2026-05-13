import { cn } from "@/lib/utils";

type Status = "never" | "stale" | "current";

interface Props {
  status: Status;
  isNewerThanAnalysis?: boolean;
  patternNames?: string[];
  className?: string;
}

export function PatternStatusBadge({ status, isNewerThanAnalysis, patternNames, className }: Props) {
  let label = "";
  let tone: "muted" | "warn" | "ok" = "muted";

  if (status === "never") {
    label = "Patterns: Not yet analyzed";
  } else if (status === "stale" && isNewerThanAnalysis) {
    label = "Patterns: Awaiting case analysis";
    tone = "warn";
  } else if (patternNames && patternNames.length > 0) {
    label = `Patterns: ${patternNames.join(", ")}`;
    tone = "ok";
  } else {
    label = "Patterns: No pattern assigned";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border",
        tone === "muted" && "bg-muted/40 border-border text-muted-foreground",
        tone === "warn" && "bg-primary/10 border-primary/30 text-primary",
        tone === "ok" && "bg-secondary border-border text-foreground",
        className,
      )}
    >
      {label}
    </span>
  );
}
