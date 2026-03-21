import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useCommunicationShieldSessions(limit = 50) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["communication-shield-sessions", user?.id, limit],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("communication_shield_sessions")
        .select(`
          *,
          communication_shield_results (*)
        `)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data;
    },
  });
}
