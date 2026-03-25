
-- 1. Create entry_type enum
CREATE TYPE public.case_log_entry_type AS ENUM (
  'general_incident',
  'parenting_time_exchange',
  'communication',
  'medical',
  'school_daycare',
  'expense'
);

-- 2. Cases table
CREATE TABLE public.cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  case_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own cases"
  ON public.cases FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own cases"
  ON public.cases FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own cases"
  ON public.cases FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own cases"
  ON public.cases FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- 3. Case log entries table
CREATE TABLE public.case_log_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  entry_type public.case_log_entry_type NOT NULL,
  event_date DATE NOT NULL,
  event_time TIME NOT NULL,
  context TEXT NOT NULL,
  summary TEXT NOT NULL,
  child_impact TEXT,
  communication_involved BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.case_log_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own entries"
  ON public.case_log_entries FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own entries"
  ON public.case_log_entries FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own entries"
  ON public.case_log_entries FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own entries"
  ON public.case_log_entries FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- 4. Case log attachments table
CREATE TABLE public.case_log_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  case_log_entry_id UUID NOT NULL REFERENCES public.case_log_entries(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  evidence_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.case_log_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own attachments"
  ON public.case_log_attachments FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own attachments"
  ON public.case_log_attachments FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own attachments"
  ON public.case_log_attachments FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- 5. Updated_at triggers
CREATE TRIGGER update_cases_updated_at
  BEFORE UPDATE ON public.cases
  FOR EACH ROW
  EXECUTE FUNCTION public.update_cs_session_updated_at();

CREATE TRIGGER update_case_log_entries_updated_at
  BEFORE UPDATE ON public.case_log_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_cs_session_updated_at();

-- 6. Indexes for performance
CREATE INDEX idx_cases_user_id ON public.cases(user_id);
CREATE INDEX idx_case_log_entries_case_id ON public.case_log_entries(case_id);
CREATE INDEX idx_case_log_entries_user_id ON public.case_log_entries(user_id);
CREATE INDEX idx_case_log_entries_event_date ON public.case_log_entries(event_date);
CREATE INDEX idx_case_log_attachments_entry_id ON public.case_log_attachments(case_log_entry_id);
