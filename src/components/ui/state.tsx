import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function CenteredSpinner({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex-1 flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground", className)}>
      <Loader2 className="h-5 w-5 animate-spin" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("border border-dashed border-border rounded-lg p-8 text-center bg-card/30", className)}>
      {icon && <div className="mx-auto mb-3 text-muted-foreground flex justify-center">{icon}</div>}
      <p className="text-foreground font-medium">{title}</p>
      {description && <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  description?: string;
  error?: unknown;
  onRetry?: () => void;
  className?: string;
}
export function ErrorState({
  title = "Something went wrong",
  description,
  error,
  onRetry,
  className,
}: ErrorStateProps) {
  const msg = description ?? (error instanceof Error ? error.message : undefined);
  return (
    <div
      className={cn(
        "border border-destructive/30 bg-destructive/5 rounded-lg p-6 text-center",
        className,
      )}
    >
      <AlertTriangle className="h-6 w-6 mx-auto text-destructive mb-2" />
      <p className="font-medium text-foreground">{title}</p>
      {msg && <p className="text-sm text-muted-foreground mt-1 break-words">{msg}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function ListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border border-border rounded-lg p-4 bg-card space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border border-border rounded-lg p-4 bg-card space-y-3">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}
