import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function CheckoutCancel() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4 max-w-md">
        <h1 className="text-2xl font-bold text-foreground">Checkout Canceled</h1>
        <p className="text-muted-foreground">
          Your subscription was not activated. You can continue using the free plan or try upgrading again.
        </p>
        <a
          href="/"
          className="inline-block bg-primary text-primary-foreground px-6 py-2.5 rounded-md font-medium hover:bg-primary/90 transition-colors"
        >
          Go to App
        </a>
      </div>
    </div>
  );
}
