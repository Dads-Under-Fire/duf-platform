import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAccountBootstrap } from "@/hooks/useAccountBootstrap";
import { AppLayout } from "@/components/AppLayout";

export default function Evidence() {
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
      <div className="flex-1 flex items-center justify-center">
        <h1 className="text-2xl font-semibold text-foreground">Case Intelligence</h1>
      </div>
    </AppLayout>
  );
}
