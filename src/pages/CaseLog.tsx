import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAccountBootstrap } from "@/hooks/useAccountBootstrap";
import { AppLayout } from "@/components/AppLayout";
import { ClipboardPlus } from "lucide-react";

export default function CaseLog() {
  const { user, loading } = useAuth();
  const { bootstrapped } = useAccountBootstrap();

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
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4 px-4">
        <ClipboardPlus className="h-16 w-16 text-muted-foreground/50" />
        <h1 className="text-2xl font-semibold text-foreground">Case Log</h1>
        <p className="text-muted-foreground max-w-md">
          Your case log is coming soon. Track incidents, document patterns, and build your case timeline.
        </p>
      </div>
    </AppLayout>
  );
}
