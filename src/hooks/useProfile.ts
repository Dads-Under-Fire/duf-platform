import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  message_rewrites_used: number;
  message_rewrites_limit: number;
  evidence_analyses_used: number;
  evidence_analyses_limit: number;
  created_at: string;
  updated_at: string;
}

export function useProfile() {
  const { user } = useAuth();

  const { data: profile, refetch } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles" as any)
        .select("*")
        .eq("user_id", user.id)
        .single();
      if (error) throw error;
      return data as Profile;
    },
    enabled: !!user,
  });

  return { profile: profile ?? null, refetch };
}
