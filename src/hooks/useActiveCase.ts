import { useEffect, useState } from "react";
import { useCases } from "@/hooks/useCases";

const STORAGE_KEY = "duf_active_case_id";

export function useActiveCase() {
  const { data: cases, isLoading } = useCases();
  const [activeCaseId, setActiveCaseIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(STORAGE_KEY);
  });

  useEffect(() => {
    if (!cases) return;
    if (cases.length === 0) {
      setActiveCaseIdState(null);
      return;
    }
    if (activeCaseId && cases.some((c) => c.id === activeCaseId)) return;
    setActiveCaseIdState(cases[0].id);
  }, [cases, activeCaseId]);

  const setActiveCaseId = (id: string | null) => {
    setActiveCaseIdState(id);
    if (typeof window !== "undefined") {
      if (id) window.localStorage.setItem(STORAGE_KEY, id);
      else window.localStorage.removeItem(STORAGE_KEY);
    }
  };

  return { cases: cases ?? [], casesLoading: isLoading, activeCaseId, setActiveCaseId };
}
