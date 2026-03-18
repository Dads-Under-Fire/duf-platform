import { ArrowRight, Zap } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { UpgradeModal } from "./UpgradeModal";

function formatPlanLabel(plan: string): string {
  if (plan === "case_builder") return "Case Builder";
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

export function UpgradeBanner() {
  const { plan, intendedPlan, rewritesExhausted, evidenceExhausted } = useProfile();
  const [showModal, setShowModal] = useState(false);

  // Don't show banner for paid users
  if (plan !== "free") return null;

  const anyExhausted = rewritesExhausted || evidenceExhausted;
  const shouldShow = !!intendedPlan || anyExhausted;

  if (!shouldShow) return null;

  const displayPlan = intendedPlan || "core";
  const message = `Your free credits are used up. Continue to the ${formatPlanLabel(displayPlan)} plan.`;
  const ctaLabel = "Upgrade now";

  return (
    <>
      <div className="bg-primary/10 border-b border-primary/20 px-4 py-2.5 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Zap className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm text-foreground truncate">{message}</span>
        </div>
        <div className="shrink-0">
          <Button
            size="sm"
            onClick={() => setShowModal(true)}
            className="gap-1.5"
          >
            {ctaLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <UpgradeModal open={showModal} onOpenChange={setShowModal} />
    </>
  );
}
