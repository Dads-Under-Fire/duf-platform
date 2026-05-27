import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCreateCase, useDeleteCase } from "@/hooks/useCases";
import { useActiveCase } from "@/hooks/useActiveCase";
import { CreateCasePrompt } from "@/components/case-log/CreateCasePrompt";
import { CaseSelector } from "@/components/case-log/CaseSelector";
import { CaseLogEntryForm } from "@/components/case-log/CaseLogEntryForm";

export interface CaseLogReturnContext {
  sourceArea: "case-intelligence";
  sourceTab: "timeline" | "evidence";
  caseId?: string;
  entryId?: string;
  drawerOpen?: boolean;
}

export default function CaseLog() {
  const navigate = useNavigate();
  const { cases, casesLoading, activeCaseId, setActiveCaseId } = useActiveCase();
  const createCase = useCreateCase();
  const deleteCase = useDeleteCase();
  const [params, setParams] = useSearchParams();
  const editEntryParam = params.get("editEntry");
  const [pendingEditId, setPendingEditId] = useState<string | null>(null);
  const [returnCtx, setReturnCtx] = useState<CaseLogReturnContext | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("caseIntel.returnContext");
      if (!raw) return;
      const parsed = JSON.parse(raw) as CaseLogReturnContext;
      if (parsed?.sourceArea === "case-intelligence") setReturnCtx(parsed);
    } catch {}
  }, [editEntryParam]);

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

  const handleReturnToSource = () => {
    if (!returnCtx) return;
    setReturnCtx(null);
    navigate(`/case-intelligence?tab=${returnCtx.sourceTab}`);
  };

  const showCreatePrompt = !casesLoading && cases.length === 0;

  return (
    <div className="flex flex-col h-full">
      {casesLoading ? (
        <div className="flex-1 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading cases...
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
              returnContext={returnCtx}
              onReturnToSource={handleReturnToSource}
            />
          )}
        </>
      )}
    </div>
  );
}
