import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { UpgradeModal } from "@/components/UpgradeModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CreditCard, ExternalLink, Loader2, AlertTriangle } from "lucide-react";
import { formatResetDate } from "@/lib/formatDate";

function formatPlanLabel(plan: string): string {
  if (plan === "case_builder") return "Case Builder";
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

function formatNumber(n: number): string {
  if (n >= 1000) return n.toLocaleString();
  return String(n);
}

export default function Account() {
  const { user } = useAuth();
  const { plan, subscription, usage, limits, intendedPlan } = useProfile();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeTarget, setUpgradeTarget] = useState<"core" | "pro" | "case_builder" | undefined>(undefined);
  const [portalLoading, setPortalLoading] = useState<null | "manage" | "subscription_update">(null);

  const openUpgrade = (target?: "core" | "pro" | "case_builder") => {
    setUpgradeTarget(target);
    setShowUpgradeModal(true);
  };

  const openPortal = async (flow: "manage" | "subscription_update") => {
    setPortalLoading(flow);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal", {
        body: { flow },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (err: any) {
      // FunctionsHttpError exposes the underlying Response on err.context — read its body.
      let serverMsg = "";
      try {
        const res = err?.context as Response | undefined;
        if (res && typeof res.clone === "function") {
          const parsed = await res.clone().json().catch(() => null);
          serverMsg = parsed?.error || "";
        }
      } catch { /* ignore */ }
      const message = serverMsg || err?.message || "";
      console.error("Portal error:", err);
      const isConfigDisabled = message.includes("subscription update feature") || message.includes("portal configuration");
      toast({
        title: "Billing portal error",
        description: message.includes("No Stripe customer") || message.includes("No active subscription")
          ? "You need an active paid subscription first. Please upgrade your plan."
          : isConfigDisabled
          ? "Stripe Customer Portal isn't configured for plan changes yet. Enable 'Customers can switch plans' in your Stripe Dashboard portal settings."
          : "Could not open billing portal. Please try again.",
        variant: "destructive",
      });
    } finally {
      setPortalLoading(null);
    }
  };

  const hasPaidSubscription = plan !== "free";

  const rewritesUsed = usage?.message_rewrites_used ?? 0;
  const analysesUsed = usage?.case_intelligence_analyses_used ?? 0;
  const analysesLimit = limits.case_intelligence_analyses;
  const analysesLabel = "Case Intelligence analyses";

  return (
    <>
      <div className="flex-1 overflow-y-auto p-6 md:p-10">
        <div className="max-w-2xl mx-auto space-y-6">
          <h1 className="text-2xl font-semibold text-foreground">Account settings</h1>

          {/* Intended plan warning */}
          {intendedPlan && intendedPlan !== "free" && plan === "free" && (
            <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
              <AlertTriangle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  You selected the {formatPlanLabel(intendedPlan)} plan but haven't completed checkout.
                </p>
                <p className="text-sm text-muted-foreground">
                  Upgrade now to unlock full access.
                </p>
              </div>
            </div>
          )}

          {/* Profile */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Email</span>
                <span className="text-sm text-foreground">{user?.email}</span>
              </div>
            </CardContent>
          </Card>

          {/* Subscription */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Subscription</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Plan</span>
                <span className="text-sm font-medium text-foreground">
                  {formatPlanLabel(plan)}
                  {plan !== "free" && subscription?.billing_interval && (
                    <span className="ml-1.5 text-muted-foreground font-normal">
                      — billed {subscription.billing_interval === "year" ? "annually" : "monthly"}
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <span className={`text-sm font-medium ${
                  subscription?.status === "active" || subscription?.status === "trialing"
                    ? "text-emerald-600"
                    : subscription?.status === "past_due"
                    ? "text-amber-600"
                    : subscription?.status === "canceled"
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}>
                  {subscription?.status
                    ? subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1).replace("_", " ")
                    : "Active"}
                  {subscription?.cancel_at_period_end ? " (cancels at period end)" : ""}
                </span>
              </div>
              {(() => {
                const resetDate = subscription?.cancel_at_period_end
                  ? subscription?.billing_period_end
                  : usage?.period_end ?? subscription?.billing_period_end;
                if (!resetDate) return null;
                return (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {subscription?.cancel_at_period_end ? "Access ends" : "Renews / credits reset"}
                    </span>
                    <span className="text-sm text-foreground">
                      {formatResetDate(resetDate)}
                    </span>
                  </div>
                );
              })()}
              {subscription?.status === "past_due" && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Your last payment failed. Update your payment method via Manage billing to keep access.</span>
                </div>
              )}

              <Separator />

              {/* Pending scheduled change */}
              {hasPaidSubscription && subscription?.pending_plan && subscription.pending_plan !== plan && (
                <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-foreground">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                  <span>
                    Scheduled change: <span className="font-medium">{formatPlanLabel(subscription.pending_plan)}</span>
                    {subscription.pending_interval && (
                      <> — billed {subscription.pending_interval === "year" ? "annually" : "monthly"}</>
                    )}
                    {subscription.pending_effective_at && (
                      <> · effective {formatResetDate(subscription.pending_effective_at)}</>
                    )}
                  </span>
                </div>
              )}

              <div className="flex flex-col gap-4">
                {/* Free user: keep the in-app upgrade modal flow */}
                {!hasPaidSubscription ? (
                  <div className="space-y-1">
                    <Button onClick={() => openUpgrade(undefined)} className="gap-2">
                      <CreditCard className="h-4 w-4" />
                      Upgrade plan
                    </Button>
                    <p className="text-xs text-muted-foreground">Unlock higher limits and advanced features</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Button
                      onClick={() => openPortal("subscription_update")}
                      disabled={portalLoading !== null}
                      className="gap-2"
                    >
                      {portalLoading === "subscription_update" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CreditCard className="h-4 w-4" />
                      )}
                      Change plan
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Upgrade now or schedule a downgrade for the end of your billing period
                    </p>
                  </div>
                )}

                {/* Manage billing */}
                <div className="space-y-1">
                  <Button
                    variant="outline"
                    onClick={() => openPortal("manage")}
                    disabled={portalLoading !== null || !hasPaidSubscription}
                    className="gap-2"
                  >
                    {portalLoading === "manage" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ExternalLink className="h-4 w-4" />
                    )}
                    Manage billing
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {hasPaidSubscription
                      ? "Update payment method, view invoices, or cancel"
                      : "Available after upgrading to a paid plan"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Usage */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Usage this period</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Rewrites */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Message rewrites</span>
                  <span className="text-sm">
                    <span className="font-medium text-foreground">{rewritesUsed}</span>
                    <span className="text-muted-foreground">
                      {limits.unlimited_rewrites ? " / ∞" : ` / ${limits.message_rewrites}`}
                    </span>
                  </span>
                </div>
                {!limits.unlimited_rewrites && (
                  <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min((rewritesUsed / limits.message_rewrites) * 100, 100)}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Evidence */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{analysesLabel}</span>
                  <span className="text-sm">
                    <span className="font-medium text-foreground">{formatNumber(analysesUsed)}</span>
                    <span className="text-muted-foreground"> / {formatNumber(analysesLimit)}</span>
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.min((analysesUsed / analysesLimit) * 100, 100)}%` }}
                  />
                </div>
              </div>

              {usage?.period_end && (
                <p className="text-xs text-muted-foreground pt-1">
                  Resets on {formatResetDate(usage.period_end)}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <UpgradeModal open={showUpgradeModal} onOpenChange={setShowUpgradeModal} targetPlan={upgradeTarget} />
    </>
  );
}
