import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useAdminRole() {
  const { user } = useAuth();

  const { data: isAdmin = false, isLoading } = useQuery({
    queryKey: ["admin-role", user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await (supabase.from as any)("profiles")
        .select("role")
        .eq("user_id", user.id)
        .single();
      if (error) return false;
      return data?.role === "admin";
    },
    enabled: !!user,
  });

  return { isAdmin, isLoading };
}
