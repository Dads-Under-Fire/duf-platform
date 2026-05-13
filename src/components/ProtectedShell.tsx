import { Suspense } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAccountBootstrap } from "@/hooks/useAccountBootstrap";
import { AppLayout } from "@/components/AppLayout";
import { Loader2 } from "lucide-react";

function ContentSkeleton() {
  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function ProtectedShell() {
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

  return (
    <AppLayout>
      {!bootstrapped ? (
        <div className="flex-1 flex items-center justify-center h-full">
          <div className="text-muted-foreground">Setting up your account...</div>
        </div>
      ) : (
        <Suspense fallback={<ContentSkeleton />}>
          <Outlet />
        </Suspense>
      )}
    </AppLayout>
  );
}
