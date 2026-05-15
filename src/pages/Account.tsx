import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { UpgradeModal } from "@/components/UpgradeModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CreditCard, ExternalLink, Loader2, AlertTriangle, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, signOut } = useAuth();
  const { plan, subscription, usage, limits, intendedPlan, profileLoading, subscriptionLoading, usageLoading } = useProfile();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeTarget, setUpgradeTarget] = useState<"core" | "pro" | "case_builder" | undefined>(undefined);
  const [portalLoading, setPortalLoading] = useState<null | "manage" | "subscription_update">(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Detect returning from Stripe Customer Portal and show a toast
  useEffect(() => {
    const portal = searchParams.get("portal");
    if (portal) {
      if (portal === "manage") {
        toast({ title: "Billing portal closed", description: "Your billing details have been updated." });
      } else if (portal === "change") {
        toast({
          title: "Plan change completed",
          description: "Your subscription has been updated. It may take a moment to reflect here.",
        });
      } else if (portal === "error") {
        toast({
          title: "Billing portal error",
          description: "Something went wrong in the billing portal. Please try again.",
          variant: "destructive",
        });
      }
      // Remove query param without reloading
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const openUpgrade = (target?: "core" | "pro" | "case_builder") => {
    setUpgradeTarget(target);
    setShowUpgradeModal(true);
  };

  const openPortal = async (flow: "manage" | "subscription_update") => {
    setPortalLoading(flow);
    toast({
      title: flow === "manage" ? "Opening billing portal..." : "Opening plan options...",
      description: "You'll be redirected to Stripe's secure customer portal.",
    });
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

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-account");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: "Account deleted",
        description: "Your DUF account and data have been permanently removed.",
      });
      setDeleteOpen(false);
      await signOut();
      navigate("/auth", { replace: true });
    } catch (err: any) {
      let serverMsg = "";
      try {
        const res = err?.context as Response | undefined;
        if (res && typeof res.clone === "function") {
          const parsed = await res.clone().json().catch(() => null);
          serverMsg = parsed?.error || "";
        }
      } catch { /* ignore */ }
      toast({
        title: "Could not delete account",
        description: serverMsg || err?.message || "Please try again or contact support.",
        variant: "destructive",
      });
      setDeleting(false);
    }
  };

  const hasPaidSubscription = plan !== "free";

  const rewritesUsed = usage?.message_rewrites_used ?? 0;
  const analysesUsed = usage?.case_intelligence_analyses_used ?? 0;
  const analysesLimit = limits.case_intelligence_analyses;
  const analysesLabel = "Case Intelligence analyses";

  return (
    <>
      <div className="h-full overflow-y-auto p-6 md:p-10">
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

              {(() => {
                const planOrder: Array<"free" | "core" | "pro" | "case_builder"> = ["free", "core", "pro", "case_builder"];
                const currentIdx = planOrder.indexOf(plan as any);
                const hasHigherPlan = currentIdx >= 0 && currentIdx < planOrder.length - 1;
                const nextPlan = hasHigherPlan ? planOrder[currentIdx + 1] : undefined;

                return (
                  <div className="space-y-3">
                    {/* Primary upgrade CTA — only if a higher plan exists */}
                    {hasHigherPlan && (
                      <div className="space-y-1">
                        <Button
                          onClick={() => openUpgrade(nextPlan as "core" | "pro" | "case_builder")}
                          disabled={portalLoading !== null}
                          className="gap-2"
                        >
                          <CreditCard className="h-4 w-4" />
                          Upgrade plan
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Move up to {formatPlanLabel(nextPlan!)} for higher limits and more features
                        </p>
                      </div>
                    )}

                    {/* Manage billing + Change plan row (paid users only) */}
                    {hasPaidSubscription ? (
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <Button
                            variant="outline"
                            onClick={() => openPortal("manage")}
                            disabled={portalLoading !== null}
                            className="gap-2"
                          >
                            {portalLoading === "manage" ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ExternalLink className="h-4 w-4" />
                            )}
                            Manage billing
                          </Button>
                          <button
                            type="button"
                            onClick={() => openPortal("subscription_update")}
                            disabled={portalLoading !== null}
                            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
                          >
                            {portalLoading === "subscription_update" && !hasHigherPlan && (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            )}
                            Change plan
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {subscription?.pending_plan && subscription.pending_plan !== plan
                            ? "You have a scheduled change. Opening the portal will let you modify or cancel it."
                            : "Update payment method, view invoices, or change/downgrade your plan"}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Button variant="outline" disabled className="gap-2">
                          <ExternalLink className="h-4 w-4" />
                          Manage billing
                        </Button>
                        <p className="text-xs text-muted-foreground">Available after upgrading to a paid plan</p>
                      </div>
                    )}
                  </div>
                );
              })()}
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

          {/* Danger zone */}
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-base text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Danger zone
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Delete your DUF account permanently. This will remove your account data,
                case logs, attachments, and access to the platform. Any active paid
                subscription will be canceled as part of this process.
              </p>
              <Button
                variant="destructive"
                onClick={() => {
                  setDeleteConfirmText("");
                  setDeleteOpen(true);
                }}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete account
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <UpgradeModal open={showUpgradeModal} onOpenChange={setShowUpgradeModal} targetPlan={upgradeTarget} />

      <Dialog
        open={deleteOpen}
        onOpenChange={(o) => {
          if (deleting) return;
          setDeleteOpen(o);
          if (!o) setDeleteConfirmText("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Permanently delete your account?
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-2 text-sm">
              <span className="block">
                This action is <span className="font-semibold text-foreground">permanent and cannot be undone</span>.
              </span>
              <span className="block">The following will be deleted:</span>
              <ul className="list-disc pl-5 space-y-1">
                <li>Your case logs, evidence, and uploaded attachments</li>
                <li>Your Communication Shield and Case Intelligence history</li>
                <li>Your DUF profile and sign-in</li>
              </ul>
              <span className="block">
                Any active paid subscription will be <span className="font-semibold text-foreground">canceled immediately</span>.
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label htmlFor="delete-confirm" className="text-sm text-foreground">
              Type <span className="font-mono font-semibold">DELETE</span> to confirm
            </label>
            <Input
              id="delete-confirm"
              autoComplete="off"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              disabled={deleting}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deleting || deleteConfirmText.trim() !== "DELETE"}
              className="gap-2"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Permanently delete account
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
