
CREATE TABLE public.case_intelligence_analyses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  case_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  summary jsonb,
  entries_snapshot_max_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cia_case_created ON public.case_intelligence_analyses (case_id, created_at DESC);
ALTER TABLE public.case_intelligence_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own analyses"
  ON public.case_intelligence_analyses FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can insert own analyses"
  ON public.case_intelligence_analyses FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own analyses"
  ON public.case_intelligence_analyses FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE public.case_intelligence_patterns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  analysis_id uuid NOT NULL REFERENCES public.case_intelligence_analyses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  case_id uuid NOT NULL,
  name text NOT NULL,
  explanation text,
  related_entry_ids uuid[] NOT NULL DEFAULT '{}',
  first_event_date date,
  last_event_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cip_case ON public.case_intelligence_patterns (case_id);
CREATE INDEX idx_cip_analysis ON public.case_intelligence_patterns (analysis_id);
ALTER TABLE public.case_intelligence_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own patterns"
  ON public.case_intelligence_patterns FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can insert own patterns"
  ON public.case_intelligence_patterns FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own patterns"
  ON public.case_intelligence_patterns FOR DELETE TO authenticated
  USING (user_id = auth.uid());
