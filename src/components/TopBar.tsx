import { useProfile } from "@/hooks/useProfile";
import { useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { Menu, X } from "lucide-react";
import dufLogo from "@/assets/dufplatform.png";

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

export function TopBar() {
  const { usage, limits, plan } = useProfile();
  const { openMobile, toggleSidebar } = useSidebar();
  const isMobile = useIsMobile();

  const rewritesUsed = usage?.message_rewrites_used ?? 0;
  const rewritesLimit = limits.message_rewrites;

  const analysesUsed = usage?.evidence_analyses_used ?? 0;
  const analysesLimit = limits.case_intelligence_analyses;
  const analysesLabel = "Case Intelligence";

  return (
    <div className="h-14 border-b border-border flex items-center justify-between px-4 bg-background shrink-0">
      {/* Left side */}
      <div className="flex items-center gap-6">
        {isMobile && (
          <img src={dufLogo} alt="DUF Platform" className="h-6" />
        )}

        <div className="hidden md:flex items-center gap-6">
          {/* Message Rewrites */}
          <div className="flex items-center gap-3">
            <div className="space-y-0.5 min-w-[160px]">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">Message Rewrites</span>
                <span className="text-xs">
                  {limits.unlimited_rewrites ? (
                    <>
                      <span className="text-primary font-bold">{rewritesUsed}</span>
                      <span className="text-muted-foreground"> / ∞</span>
                    </>
                  ) : (
                    <>
                      <span className="text-primary font-bold">{rewritesUsed}</span>
                      <span className="text-muted-foreground"> / {rewritesLimit}</span>
                    </>
                  )}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: limits.unlimited_rewrites
                      ? `${Math.min(rewritesUsed * 0.1, 100)}%`
                      : `${Math.min((rewritesUsed / rewritesLimit) * 100, 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Evidence */}
          <div className="flex items-center gap-3">
            <div className="space-y-0.5 min-w-[160px]">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">{evidenceLabel}</span>
                <span className="text-xs">
                  <span className="text-primary font-bold">{formatNumber(evidenceUsed)}</span>
                  <span className="text-muted-foreground"> / {formatNumber(evidenceLimit)}</span>
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min((evidenceUsed / evidenceLimit) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        <span className="text-muted-foreground text-sm hidden md:block">
          Plan: {plan === "case_builder" ? "Case Builder" : plan.charAt(0).toUpperCase() + plan.slice(1)}
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
