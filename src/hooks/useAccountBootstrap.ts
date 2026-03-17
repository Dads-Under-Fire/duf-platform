import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type PlanType = "free" | "core" | "pro" | "case_builder";

/**
 * Self-healing bootstrap: ensures profiles, subscriptions, and usage_counters
 * rows exist for the authenticated user. Runs once per session.
 *
 * Returns:
 *  - bootstrapped: true once check/creation is complete
 *  - pendingPaidPlan: if the user has a pending paid subscription that needs checkout
 */
export function useAccountBootstrap() {
  const { user } = useAuth();
  const didRun = useRef(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [pendingPaidPlan, setPendingPaidPlan] = useState<PlanType | null>(null);

  useEffect(() => {
    if (!user || didRun.current) return;
    didRun.current = true;

    (async () => {
      try {
        const userId = user.id;

        // 1. Ensure profile exists
        const { data: profile } = await (supabase.from as any)("profiles")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();

        if (!profile) {
          await (supabase.from as any)("profiles").insert({
            user_id: userId,
            display_name: user.user_metadata?.display_name || user.email,
          });
        }

        // 2. Determine selected plan from user_metadata
        const selectedPlan = (user.user_metadata?.selected_plan as PlanType) || "free";
        const isPaid = selectedPlan !== "free";

        // 3. Ensure subscription exists
        const { data: sub } = await (supabase.from as any)("subscriptions")
          .select("id, plan, status")
          .eq("user_id", userId)
          .maybeSingle();

        if (!sub) {
          // No subscription row — create one
          await (supabase.from as any)("subscriptions").insert({
            user_id: userId,
            plan: selectedPlan,
            status: isPaid ? "inactive" : "active",
          });

          if (isPaid) {
            setPendingPaidPlan(selectedPlan);
          }
        } else if (isPaid && sub.status === "inactive" && sub.plan === selectedPlan) {
          // Existing pending paid subscription (e.g. abandoned checkout)
          setPendingPaidPlan(selectedPlan);
        }

        // 4. Ensure usage_counters row for current period
        const { data: usage } = await (supabase.from as any)("usage_counters")
          .select("id")
          .eq("user_id", userId)
          .gte("period_end", new Date().toISOString())
          .lte("period_start", new Date().toISOString())
          .maybeSingle();

        if (!usage) {
          await (supabase.from as any)("usage_counters").insert({
            user_id: userId,
          });
        }
      } catch (err) {
        console.error("Account bootstrap error:", err);
      } finally {
        setBootstrapped(true);
      }
    })();
  }, [user]);

  return { bootstrapped, pendingPaidPlan };
}
