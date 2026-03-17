import { useProfile } from "@/hooks/useProfile";
import { useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { Menu, X } from "lucide-react";
import { format } from "date-fns";
import dufLogo from "@/assets/dufplatform.png";

export function TopBar() {
  const { usage, limits } = useProfile();
  const { openMobile, toggleSidebar } = useSidebar();
  const isMobile = useIsMobile();

  const rewritesUsed = usage?.message_rewrites_used ?? 0;
  const rewritesLimit = limits.message_rewrites;
  const analysesUsed = usage?.evidence_analyses_used ?? 0;
  const analysesLimit = limits.evidence_analyses;

  return (
    <div className="h-14 border-b border-border flex items-center justify-between px-4 bg-background shrink-0">
      {/* Left side */}
      <div className="flex items-center gap-6">
        {isMobile && (
          <img src={dufLogo} alt="DUF Platform" className="h-6" />
        )}

        <div className="hidden md:flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="space-y-0.5 min-w-[160px]">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">Message Rewrites</span>
                <span className="text-xs">
                  <span className="text-primary font-bold">{rewritesUsed}</span>
                  <span className="text-muted-foreground"> / {rewritesLimit}</span>
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min((rewritesUsed / rewritesLimit) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="space-y-0.5 min-w-[160px]">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">Evidence Analyses</span>
                <span className="text-xs">
                  <span className="text-primary font-bold">{analysesUsed}</span>
                  <span className="text-muted-foreground"> / {analysesLimit}</span>
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min((analysesUsed / analysesLimit) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>

          <button className="text-primary text-sm hover:underline hidden sm:block">
            Add more credits
          </button>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        <span className="text-muted-foreground text-sm hidden sm:block">
          {format(new Date(), "MMMM d, yyyy h:mma")}
        </span>

        {isMobile && (
          <button
            onClick={toggleSidebar}
            className="h-10 w-10 flex items-center justify-center text-foreground"
          >
            {openMobile ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        )}
      </div>
    </div>
  );
}
