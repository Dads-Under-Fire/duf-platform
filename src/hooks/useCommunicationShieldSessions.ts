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

      // For each session, mark the canonical (latest selected) result
      return (data ?? []).map((session: any) => {
        const results = session.communication_shield_results ?? [];
        // Canonical = is_selected first, then highest generation_index, then newest created_at
        const sorted = [...results].sort((a: any, b: any) => {
          if (a.is_selected !== b.is_selected) return a.is_selected ? -1 : 1;
          const idxDiff = (b.generation_index ?? 1) - (a.generation_index ?? 1);
          if (idxDiff !== 0) return idxDiff;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        return {
          ...session,
          communication_shield_results: results,
          canonical_result: sorted[0] ?? null,
        };
      });
    },
  });
}
