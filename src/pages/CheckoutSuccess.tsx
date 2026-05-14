import { useEffect, useState } from "react";
import { useSearchParams, Navigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export default function CheckoutSuccess() {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;

    const sessionId = searchParams.get("session_id");
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("verify-subscription", {
          body: { session_id: sessionId },
        });
        if (error) throw error;
        if (data?.activated) {
          // Force-refresh profile/subscription/usage so the rest of the app
          // sees the new plan immediately.
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["profile", user.id] }),
            queryClient.invalidateQueries({ queryKey: ["subscription", user.id] }),
            queryClient.invalidateQueries({ queryKey: ["usage_counters", user.id] }),
          ]);
          setStatus("success");
        } else {
          setStatus("error");
        }
      } catch {
        setStatus("error");
      }
    })();
  }, [user, searchParams, queryClient]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  if (status === "verifying") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Verifying your subscription...</p>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-4xl">✓</div>
          <h1 className="text-2xl font-bold text-foreground">Subscription Activated</h1>
          <p className="text-muted-foreground">Your plan is now active. You have full access to all features.</p>
          <a href="/case-intelligence" className="inline-block bg-primary text-primary-foreground px-6 py-2.5 rounded-md font-medium hover:bg-primary/90 transition-colors">
            Go to Case Intelligence
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4 max-w-md">
        <h1 className="text-2xl font-bold text-foreground">Verification Issue</h1>
        <p className="text-muted-foreground">
          We couldn't verify your payment yet. If you just paid, it may take a moment to sync — try refreshing, or contact support.
        </p>
        <a href="/account" className="inline-block bg-primary text-primary-foreground px-6 py-2.5 rounded-md font-medium hover:bg-primary/90 transition-colors">
          Go to Account
        </a>
      </div>
    </div>
  );
}
