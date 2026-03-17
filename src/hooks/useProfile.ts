import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
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
  evidence_analyses: number;
  evidence_words: number;
  /** True when rewrites are "unlimited" (fair use) */
  unlimited_rewrites: boolean;
  /** True when evidence is tracked by words (paid) vs count (free) */
  evidence_uses_words: boolean;
}

// Must match get_plan_limits DB function
const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: {
    message_rewrites: 2,
    evidence_analyses: 1,
    evidence_words: 0,
    unlimited_rewrites: false,
    evidence_uses_words: false,
  },
  core: {
    message_rewrites: 100,
    evidence_analyses: 999999,
    evidence_words: 15000,
    unlimited_rewrites: false,
    evidence_uses_words: true,
  },
  pro: {
    message_rewrites: 250,
    evidence_analyses: 999999,
    evidence_words: 60000,
    unlimited_rewrites: false,
    evidence_uses_words: true,
  },
  case_builder: {
    message_rewrites: 999999,
    evidence_analyses: 999999,
    evidence_words: 200000,
    unlimited_rewrites: true,
    evidence_uses_words: true,
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
    refetch,
  };
}
