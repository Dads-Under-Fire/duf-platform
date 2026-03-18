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
  const { plan, intendedPlan, usage, limits, rewritesExhausted, evidenceExhausted } = useProfile();
  const [showModal, setShowModal] = useState(false);

  // Don't show banner for paid users
  if (plan !== "free") return null;

  // Don't show if no intended plan and credits aren't close to exhaustion
  const rewritesUsed = usage?.message_rewrites_used ?? 0;
  const rewritesNearing = rewritesUsed >= Math.max(limits.message_rewrites - 1, 0);
  const anyExhausted = rewritesExhausted || evidenceExhausted;
  const shouldShow = !!intendedPlan || anyExhausted || rewritesNearing;

  if (!shouldShow) return null;

  const evidenceUsed = limits.evidence_uses_words
    ? (usage?.evidence_words_used ?? 0)
    : (usage?.evidence_analyses_used ?? 0);
  const evidenceLimit = limits.evidence_uses_words
    ? limits.evidence_words
    : limits.evidence_analyses;

  let message: string;
  let ctaLabel: string;

  if (anyExhausted && intendedPlan) {
    message = `Your free credits are used up. Continue to the ${formatPlanLabel(intendedPlan)} plan to unlock more.`;
    ctaLabel = "Continue to Checkout";
  } else if (anyExhausted) {
    message = "Your free credits are used up. Upgrade to keep using all features.";
    ctaLabel = "Upgrade Now";
  } else if (intendedPlan) {
    message = `You're on the Free plan. Complete your ${formatPlanLabel(intendedPlan)} plan upgrade to unlock full access.`;
    ctaLabel = "Continue to Checkout";
  } else {
    message = `You have ${limits.message_rewrites - rewritesUsed} rewrite${limits.message_rewrites - rewritesUsed === 1 ? "" : "s"} and ${evidenceLimit - evidenceUsed} evidence analysis left.`;
    ctaLabel = "Upgrade Now";
  }

  return (
    <>
      <div className="bg-primary/10 border-b border-primary/20 px-4 py-2.5 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Zap className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm text-foreground truncate">{message}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
            <span>Rewrites: {rewritesUsed}/{limits.message_rewrites}</span>
            <span className="text-border">•</span>
            <span>Evidence: {evidenceUsed}/{evidenceLimit}</span>
          </div>
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
