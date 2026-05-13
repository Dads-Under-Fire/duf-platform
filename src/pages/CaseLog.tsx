import { useState, useEffect } from "react";
import { useCases, useCreateCase, useDeleteCase } from "@/hooks/useCases";
import { CreateCasePrompt } from "@/components/case-log/CreateCasePrompt";
import { CaseSelector } from "@/components/case-log/CaseSelector";
import { CaseLogEntryForm } from "@/components/case-log/CaseLogEntryForm";

export default function CaseLog() {
  const { data: cases, isLoading: casesLoading } = useCases();
  const createCase = useCreateCase();
  const deleteCase = useDeleteCase();
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);

  // Auto-select case when cases load
  useEffect(() => {
    if (!cases || cases.length === 0) {
      setActiveCaseId(null);
      return;
    }
    if (activeCaseId && cases.some((c) => c.id === activeCaseId)) return;
    setActiveCaseId(cases[0].id);
  }, [cases]);

  const handleCreateCase = async (caseName: string) => {
    const newCase = await createCase.mutateAsync(caseName);
    setActiveCaseId(newCase.id);
  };

  const handleDeleteCase = async (caseId: string) => {
    await deleteCase.mutateAsync(caseId);
  };

  const showCreatePrompt = !casesLoading && (!cases || cases.length === 0);

  return (
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
            onCreateCase={handleCreateCase}
            onDeleteCase={handleDeleteCase}
            isCreating={createCase.isPending}
            isDeleting={deleteCase.isPending}
          />
          {activeCaseId && <CaseLogEntryForm caseId={activeCaseId} />}
        </>
      )}
    </div>
  );
}
