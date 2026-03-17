import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import CommunicationShield from "./CommunicationShield";
import Auth from "./Auth";

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) return <Auth />;

  return (
    <AppLayout>
      <CommunicationShield />
    </AppLayout>
  );
}
