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
  const { plan, intendedPlan, rewritesExhausted, caseAnalysesExhausted } = useProfile();
  const [showModal, setShowModal] = useState(false);

  const anyExhausted = rewritesExhausted || caseAnalysesExhausted;

  if (!anyExhausted) return null;

  const NEXT_TIER: Record<string, "core" | "pro" | "case_builder"> = {
    free: "pro",
    core: "pro",
    pro: "case_builder",
    case_builder: "case_builder",
  };
  const displayPlan =
    intendedPlan && intendedPlan !== "free" && intendedPlan !== plan
      ? intendedPlan
      : NEXT_TIER[plan] ?? "pro";

  let creditType: string;
  if (rewritesExhausted && caseAnalysesExhausted) {
    creditType = "";
  } else if (caseAnalysesExhausted) {
    creditType = " Case Intelligence";
  } else {
    creditType = " message rewrite";
  }

  const message = `Your${creditType} credits are used up. Continue to the ${formatPlanLabel(displayPlan)} plan.`;
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
