import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAccountBootstrap } from "@/hooks/useAccountBootstrap";
import { AppLayout } from "@/components/AppLayout";
import CommunicationShield from "./CommunicationShield";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export default function Index() {
  const { user, loading } = useAuth();
  const { bootstrapped, pendingPaidPlan } = useAccountBootstrap();
  const navigate = useNavigate();

  // If bootstrap finds a pending paid plan, redirect to Stripe Checkout
  useEffect(() => {
    if (!pendingPaidPlan || !user) return;

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("create-checkout", {
          body: { plan: pendingPaidPlan },
        });
        if (error) throw error;
        if (data?.url) {
          window.location.href = data.url;
        }
      } catch (err: any) {
        console.error("Checkout redirect failed:", err);
        toast({
          title: "Checkout Error",
          description: "Could not redirect to checkout. You can try upgrading from Account Settings.",
          variant: "destructive",
        });
      }
    })();
  }, [pendingPaidPlan, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  if (!bootstrapped) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Setting up your account...</div>
      </div>
    );
  }

  return (
    <AppLayout>
      <CommunicationShield />
    </AppLayout>
  );
}
