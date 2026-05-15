import { useState } from "react";
import { Lock, Check, Loader2 } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatPlanLabel(plan: string): string {
  if (plan === "case_builder") return "Case Builder";
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

const PLAN_FEATURES: Record<string, string[]> = {
  core: ["100 message rewrites/month", "4 Case Intelligence analyses/month"],
  pro: ["250 message rewrites/month", "12 Case Intelligence analyses/month"],
  case_builder: ["Unlimited message rewrites (fair use)", "30 Case Intelligence analyses/month"],
};

// Display pricing — must match the Stripe prices configured in create-checkout.
const PLAN_PRICING: Record<string, { monthly: number; annual: number }> = {
  core: { monthly: 49, annual: 490 },
  pro: { monthly: 89, annual: 890 },
  case_builder: { monthly: 149, annual: 1490 },
};

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Override the feature context, e.g. "Communication Shield" */
  lockedFeature?: string;
  /** Explicit upgrade target. Falls back to intended_plan, then next tier above current plan. */
  targetPlan?: "core" | "pro" | "case_builder";
}

const NEXT_TIER: Record<string, "core" | "pro" | "case_builder"> = {
  free: "core",
  core: "pro",
  pro: "case_builder",
  case_builder: "case_builder",
};

export function UpgradeModal({ open, onOpenChange, lockedFeature, targetPlan: targetPlanProp }: UpgradeModalProps) {
  const { intendedPlan, plan } = useProfile();
  const [loading, setLoading] = useState(false);
  const [interval, setInterval] = useState<"month" | "year">("month");

  const targetPlan =
    targetPlanProp ??
    (intendedPlan && intendedPlan !== "free" && intendedPlan !== plan
      ? (intendedPlan as "core" | "pro" | "case_builder")
      : NEXT_TIER[plan] ?? "pro");
  const features = PLAN_FEATURES[targetPlan] ?? PLAN_FEATURES.core;
  const pricing = PLAN_PRICING[targetPlan] ?? PLAN_PRICING.pro;
  const monthlyEquivalent = (pricing.annual / 12).toFixed(0);
  const annualSavingsPct = Math.round(
    (1 - pricing.annual / (pricing.monthly * 12)) * 100,
  );

  const displayPrice = interval === "month" ? pricing.monthly : pricing.annual;
  const displaySuffix = interval === "month" ? "/month" : "/year";

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { plan: targetPlan, interval },
      });
      if (error) throw error;
      if (data?.url) {
        try {
          (window.top ?? window).location.href = data.url;
        } catch {
          window.open(data.url, "_blank", "noopener,noreferrer");
        }
        onOpenChange(false);
      }
    } catch (err: any) {
      console.error("Checkout error:", err);
      toast({
        title: "Checkout Error",
        description: "Could not start checkout. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">
            {lockedFeature
              ? `${lockedFeature} — Credits Exhausted`
              : "Upgrade Your Plan"}
          </DialogTitle>
          <DialogDescription className="text-center">
            {intendedPlan
              ? `Complete your upgrade to the ${formatPlanLabel(intendedPlan)} plan to unlock full access.`
              : "Upgrade to a paid plan to continue using all features."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Billing interval toggle */}
          <div
            role="tablist"
            aria-label="Billing interval"
            className="inline-flex w-full rounded-lg border border-border bg-muted/40 p-1 text-sm"
          >
            <button
              type="button"
              role="tab"
              aria-selected={interval === "month"}
              onClick={() => setInterval("month")}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 transition-colors",
                interval === "month"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Monthly
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={interval === "year"}
              onClick={() => setInterval("year")}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 transition-colors",
                interval === "year"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Annual
              {annualSavingsPct > 0 && (
                <span className="ml-1.5 text-xs text-primary">save {annualSavingsPct}%</span>
              )}
            </button>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">{formatPlanLabel(targetPlan)} Plan</span>
              {plan === "free" && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  Recommended
                </span>
              )}
            </div>

            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-semibold text-foreground">${displayPrice}</span>
              <span className="text-sm text-muted-foreground">{displaySuffix}</span>
              {interval === "year" && (
                <span className="ml-2 text-xs text-muted-foreground">
                  (~${monthlyEquivalent}/mo)
                </span>
              )}
            </div>

            <ul className="space-y-2">
              {features.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          <Button
            className="w-full"
            onClick={handleCheckout}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Redirecting...
              </>
            ) : (
              `Continue to checkout — billed ${interval === "month" ? "monthly" : "annually"}`
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            You'll be redirected to Stripe for secure payment.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
