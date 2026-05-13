import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCreateCase, useDeleteCase } from "@/hooks/useCases";
import { useActiveCase } from "@/hooks/useActiveCase";
import { CreateCasePrompt } from "@/components/case-log/CreateCasePrompt";
import { CaseSelector } from "@/components/case-log/CaseSelector";
import { CaseLogEntryForm } from "@/components/case-log/CaseLogEntryForm";

export default function CaseLog() {
  const { cases, casesLoading, activeCaseId, setActiveCaseId } = useActiveCase();
  const createCase = useCreateCase();
  const deleteCase = useDeleteCase();
  const [params, setParams] = useSearchParams();
  const editEntryParam = params.get("editEntry");
  const [pendingEditId, setPendingEditId] = useState<string | null>(null);

  // If a deep-link asks to edit an entry, switch case to that entry's case first
  useEffect(() => {
    if (!editEntryParam) return;
    (async () => {
      const { data } = await supabase
        .from("case_log_entries")
        .select("id, case_id")
        .eq("id", editEntryParam)
        .maybeSingle();
      if (data?.case_id) {
        setActiveCaseId(data.case_id);
        setPendingEditId(data.id);
      }
      const next = new URLSearchParams(params);
      next.delete("editEntry");
      setParams(next, { replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editEntryParam]);

  const handleCreateCase = async (caseName: string) => {
    const newCase = await createCase.mutateAsync(caseName);
    setActiveCaseId(newCase.id);
  };

  const showCreatePrompt = !casesLoading && cases.length === 0;

  return (
    <div className="flex flex-col h-full">
      {casesLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-muted-foreground">Loading cases...</div>
        </div>
      ) : showCreatePrompt ? (
        <CreateCasePrompt onCreateCase={handleCreateCase} isLoading={createCase.isPending} />
      ) : (
        <>
          <CaseSelector
            cases={cases}
            activeCaseId={activeCaseId}
            onSelectCase={setActiveCaseId}
            onCreateCase={handleCreateCase}
            onDeleteCase={async (id) => deleteCase.mutateAsync(id)}
            isCreating={createCase.isPending}
            isDeleting={deleteCase.isPending}
          />
          {activeCaseId && (
            <CaseLogEntryForm
              caseId={activeCaseId}
              initialEditEntryId={pendingEditId}
              onEditLoaded={() => setPendingEditId(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
