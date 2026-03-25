import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Case, CaseInsert } from "@/types/caseLog";

export function useCases() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["cases", user?.id],
    queryFn: async (): Promise<Case[]> => {
      const { data, error } = await supabase
        .from("cases")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  return query;
}

export function useCreateCase() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (caseName: string) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("cases")
        .insert({ user_id: user.id, case_name: caseName } as CaseInsert)
        .select()
        .single();
      if (error) throw error;
      return data as Case;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cases", user?.id] });
    },
  });
}
