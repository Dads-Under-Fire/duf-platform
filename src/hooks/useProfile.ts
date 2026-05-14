import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  intended_plan: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan: "free" | "core" | "pro" | "case_builder";
  status: "active" | "inactive" | "trialing" | "canceled" | "past_due";
  billing_period_start: string;
  billing_period_end: string;
}

export interface UsageCounters {
  id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  message_rewrites_used: number;
  evidence_analyses_used: number;
  evidence_words_used: number;
}

export interface PlanLimits {
  message_rewrites: number;
  /** Case Intelligence analyses per billing period (Analyze Case + Generate Case Report). */
  case_intelligence_analyses: number;
  unlimited_rewrites: boolean;
}

const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: {
    message_rewrites: 2,
    case_intelligence_analyses: 1,
    unlimited_rewrites: false,
  },
  core: {
    message_rewrites: 100,
    case_intelligence_analyses: 4,
    unlimited_rewrites: false,
  },
  pro: {
    message_rewrites: 250,
    case_intelligence_analyses: 12,
    unlimited_rewrites: false,
  },
  case_builder: {
    message_rewrites: 999999,
    case_intelligence_analyses: 30,
    unlimited_rewrites: true,
  },
};

export function useProfile() {
  const { user } = useAuth();

  const { data: profile, refetch: refetchProfile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await (supabase.from as any)("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();
      if (error) throw error;
      return data as unknown as Profile;
    },
    enabled: !!user,
  });

  const { data: subscription, refetch: refetchSubscription } = useQuery({
    queryKey: ["subscription", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await (supabase.from as any)("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .single();
      if (error) throw error;
      return data as unknown as Subscription;
    },
    enabled: !!user,
  });

  const { data: usage, refetch: refetchUsage } = useQuery({
    queryKey: ["usage_counters", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await (supabase.from as any)("usage_counters")
        .select("*")
        .eq("user_id", user.id)
        .order("period_start", { ascending: false })
        .limit(1)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return (data as unknown as UsageCounters) ?? null;
    },
    enabled: !!user,
  });

  const plan = subscription?.plan ?? "free";
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
  const intendedPlan = profile?.intended_plan as string | null;

  // Check if credits are exhausted
  const rewritesExhausted = !limits.unlimited_rewrites && (usage?.message_rewrites_used ?? 0) >= limits.message_rewrites;
  // Case Intelligence analyses are tracked in the existing evidence_analyses_used counter.
  const caseAnalysesUsed = usage?.evidence_analyses_used ?? 0;
  const caseAnalysesExhausted = caseAnalysesUsed >= limits.case_intelligence_analyses;

  const refetch = () => {
    refetchProfile();
    refetchSubscription();
    refetchUsage();
  };

  return {
    profile: profile ?? null,
    subscription: subscription ?? null,
    usage: usage ?? null,
    limits,
    plan,
    intendedPlan,
    rewritesExhausted,
    caseAnalysesUsed,
    caseAnalysesExhausted,
    /** @deprecated use caseAnalysesExhausted */
    evidenceExhausted: caseAnalysesExhausted,
    refetch,
  };
}
