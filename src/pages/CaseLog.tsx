import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAccountBootstrap } from "@/hooks/useAccountBootstrap";
import { AppLayout } from "@/components/AppLayout";
import { useCases, useCreateCase } from "@/hooks/useCases";
import { CreateCasePrompt } from "@/components/case-log/CreateCasePrompt";
import { CaseSelector } from "@/components/case-log/CaseSelector";
import { CaseLogEntryForm } from "@/components/case-log/CaseLogEntryForm";

export default function CaseLog() {
  const { user, loading } = useAuth();
  const { bootstrapped } = useAccountBootstrap();
  const { data: cases, isLoading: casesLoading } = useCases();
  const createCase = useCreateCase();
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);

  // Auto-select case when cases load
  useEffect(() => {
    if (!cases || cases.length === 0) {
      setActiveCaseId(null);
      return;
    }
    // If current selection is still valid, keep it
    if (activeCaseId && cases.some((c) => c.id === activeCaseId)) return;
    // Auto-select the first (or only) case
    setActiveCaseId(cases[0].id);
  }, [cases]);

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

  const handleCreateCase = async (caseName: string) => {
    const newCase = await createCase.mutateAsync(caseName);
    setActiveCaseId(newCase.id);
  };

  const showCreatePrompt = !casesLoading && (!cases || cases.length === 0);

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {casesLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-muted-foreground">Loading cases...</div>
          </div>
        ) : showCreatePrompt ? (
          <CreateCasePrompt
            onCreateCase={handleCreateCase}
            isLoading={createCase.isPending}
          />
        ) : (
          <>
            <CaseSelector
              cases={cases ?? []}
              activeCaseId={activeCaseId}
              onSelectCase={setActiveCaseId}
            />
            {activeCaseId && <CaseLogEntryForm caseId={activeCaseId} />}
          </>
        )}
      </div>
    </AppLayout>
  );
}
