import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type PlanType = "free" | "core" | "pro" | "case_builder";

/**
 * Self-healing bootstrap: ensures profiles, subscriptions, and usage_counters
 * rows exist for the authenticated user. Runs once per session.
 *
 * Paid plan signups always start on free/active. The intended paid plan is
 * stored in profiles.intended_plan for upgrade prompts.
 */
export function useAccountBootstrap() {
  const { user } = useAuth();
  const didRun = useRef(false);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    if (!user || didRun.current) return;
    didRun.current = true;

    (async () => {
      try {
        const userId = user.id;
        const selectedPlan = (user.user_metadata?.selected_plan as PlanType) || "free";
        const intendedPlan = selectedPlan !== "free" ? selectedPlan : null;

        // 1. Ensure profile exists
        const { data: profile } = await (supabase.from as any)("profiles")
          .select("id, intended_plan")
          .eq("user_id", userId)
          .maybeSingle();

        if (!profile) {
          await (supabase.from as any)("profiles").insert({
            user_id: userId,
            display_name: user.user_metadata?.display_name || user.email,
            intended_plan: intendedPlan,
          });
        } else if (intendedPlan && !profile.intended_plan) {
          // Update intended_plan if it wasn't set yet
          await (supabase.from as any)("profiles")
            .update({ intended_plan: intendedPlan })
            .eq("user_id", userId);
        }

        // 2. Ensure subscription exists — always free/active until payment
        const { data: sub } = await (supabase.from as any)("subscriptions")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();

        if (!sub) {
          await (supabase.from as any)("subscriptions").insert({
            user_id: userId,
            plan: "free",
            status: "active",
          });
        }

        // 3. Ensure usage_counters row for current period
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

  return { bootstrapped };
}
