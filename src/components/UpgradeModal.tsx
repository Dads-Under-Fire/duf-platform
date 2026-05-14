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

function formatPlanLabel(plan: string): string {
  if (plan === "case_builder") return "Case Builder";
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

const PLAN_FEATURES: Record<string, string[]> = {
  core: ["100 message rewrites/month", "4 Case Intelligence analyses/month"],
  pro: ["250 message rewrites/month", "12 Case Intelligence analyses/month"],
  case_builder: ["Unlimited message rewrites (fair use)", "30 Case Intelligence analyses/month"],
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
  free: "pro",
  core: "pro",
  pro: "case_builder",
  case_builder: "case_builder",
};

export function UpgradeModal({ open, onOpenChange, lockedFeature, targetPlan: targetPlanProp }: UpgradeModalProps) {
  const { intendedPlan, plan } = useProfile();
  const [loading, setLoading] = useState(false);

  const targetPlan =
    targetPlanProp ??
    (intendedPlan && intendedPlan !== "free" && intendedPlan !== plan
      ? (intendedPlan as "core" | "pro" | "case_builder")
      : NEXT_TIER[plan] ?? "pro");
  const features = PLAN_FEATURES[targetPlan] ?? PLAN_FEATURES.core;

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { plan: targetPlan },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
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
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">{formatPlanLabel(targetPlan)} Plan</span>
              {plan === "free" && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  Recommended
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
              "Continue to checkout"
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
