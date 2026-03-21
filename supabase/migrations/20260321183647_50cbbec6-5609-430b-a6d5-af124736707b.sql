
-- ============================================================
-- Communication Shield: Normalized schema migration
-- Creates sessions + results tables, migrates data, adds RLS
-- Idempotent: safe to re-run
-- ============================================================

-- 1. CREATE TABLES (idempotent via IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS public.communication_shield_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  mode text NOT NULL DEFAULT 'respond',
  original_message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Triage fields
  detected_intent text,
  detected_tone text,
  sendability_status text,
  sendability_reason text,
  triage_confidence numeric,

  -- Goal selection
  goal_options jsonb,
  selected_goal text,
  goal_selection_source text,

  -- Output routing
  output_path text,

  -- Version / debug
  workflow_version text,
  triage_prompt_version text,
  rewrite_prompt_version text,
  scoring_version text,

  -- Scoring (denormalized for query convenience)
  original_score numeric,
  original_score_notes jsonb,
  rewrite_quality_score numeric,
  rewrite_quality_notes jsonb,
  quality_score_total numeric,
  quality_score_status text,
  quality_score_notes jsonb,
  admission_risk_score numeric,
  escalation_safety_score numeric,
  actionability_score numeric,
  focus_discipline_score numeric,
  court_safe_phrasing_score numeric,

  -- Legacy compat
  recommendation_type text,
  tone_assessment text,

  -- Source tracking
  migrated_from_history_id uuid
);

CREATE TABLE IF NOT EXISTS public.communication_shield_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.communication_shield_sessions(id) ON DELETE CASCADE,
  result_type text NOT NULL DEFAULT 'primary',
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Output fields
  primary_rewrite text,
  primary_response text,
  shorter_version text,
  firmer_version text,
  redirect_message text,
  safe_alternative text,
  alternative_1 text,
  alternative_2 text,
  alternative_3 text,
  risk_flags jsonb DEFAULT '[]'::jsonb,
  why_this_is_safer text,

  -- Future extensibility
  generation_index integer NOT NULL DEFAULT 1,
  is_selected boolean NOT NULL DEFAULT true
);

-- 2. CHECK CONSTRAINTS (idempotent: drop if exists, then add)

DO $$ BEGIN
  ALTER TABLE public.communication_shield_sessions DROP CONSTRAINT IF EXISTS chk_session_mode;
  ALTER TABLE public.communication_shield_sessions
    ADD CONSTRAINT chk_session_mode CHECK (mode IN ('respond', 'rewrite'));
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.communication_shield_sessions DROP CONSTRAINT IF EXISTS chk_sendability_status;
  ALTER TABLE public.communication_shield_sessions
    ADD CONSTRAINT chk_sendability_status CHECK (sendability_status IS NULL OR sendability_status IN ('safe', 'salvageable', 'redirect'));
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.communication_shield_sessions DROP CONSTRAINT IF EXISTS chk_goal_selection_source;
  ALTER TABLE public.communication_shield_sessions
    ADD CONSTRAINT chk_goal_selection_source CHECK (goal_selection_source IS NULL OR goal_selection_source IN ('user_selected', 'auto_default', 'skipped'));
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.communication_shield_sessions DROP CONSTRAINT IF EXISTS chk_output_path;
  ALTER TABLE public.communication_shield_sessions
    ADD CONSTRAINT chk_output_path CHECK (output_path IS NULL OR output_path IN ('rewrite', 'rewrite_with_guidance', 'redirect'));
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.communication_shield_results DROP CONSTRAINT IF EXISTS chk_result_type;
  ALTER TABLE public.communication_shield_results
    ADD CONSTRAINT chk_result_type CHECK (result_type IN ('primary', 'alternative', 'redirect', 'respond_output'));
EXCEPTION WHEN others THEN NULL;
END $$;

-- 3. INDEXES (idempotent via IF NOT EXISTS)

CREATE INDEX IF NOT EXISTS idx_cs_sessions_user_id ON public.communication_shield_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_cs_sessions_created_at ON public.communication_shield_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cs_sessions_mode ON public.communication_shield_sessions(mode);
CREATE INDEX IF NOT EXISTS idx_cs_sessions_sendability ON public.communication_shield_sessions(sendability_status);
CREATE INDEX IF NOT EXISTS idx_cs_results_session_id ON public.communication_shield_results(session_id);
CREATE INDEX IF NOT EXISTS idx_cs_results_created_at ON public.communication_shield_results(created_at DESC);

-- 4. ENABLE RLS

ALTER TABLE public.communication_shield_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_shield_results ENABLE ROW LEVEL SECURITY;

-- 5. RLS POLICIES (idempotent: drop then create)

-- Sessions: SELECT
DROP POLICY IF EXISTS "Users can read own sessions" ON public.communication_shield_sessions;
CREATE POLICY "Users can read own sessions" ON public.communication_shield_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Sessions: INSERT
DROP POLICY IF EXISTS "Users can insert own sessions" ON public.communication_shield_sessions;
CREATE POLICY "Users can insert own sessions" ON public.communication_shield_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Sessions: UPDATE
DROP POLICY IF EXISTS "Users can update own sessions" ON public.communication_shield_sessions;
CREATE POLICY "Users can update own sessions" ON public.communication_shield_sessions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Results: SELECT (via session ownership)
DROP POLICY IF EXISTS "Users can read own results" ON public.communication_shield_results;
CREATE POLICY "Users can read own results" ON public.communication_shield_results
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.communication_shield_sessions s
    WHERE s.id = session_id AND s.user_id = auth.uid()
  ));

-- Results: INSERT (via session ownership)
DROP POLICY IF EXISTS "Users can insert own results" ON public.communication_shield_results;
CREATE POLICY "Users can insert own results" ON public.communication_shield_results
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.communication_shield_sessions s
    WHERE s.id = session_id AND s.user_id = auth.uid()
  ));

-- Results: UPDATE (via session ownership)
DROP POLICY IF EXISTS "Users can update own results" ON public.communication_shield_results;
CREATE POLICY "Users can update own results" ON public.communication_shield_results
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.communication_shield_sessions s
    WHERE s.id = session_id AND s.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.communication_shield_sessions s
    WHERE s.id = session_id AND s.user_id = auth.uid()
  ));

-- 6. UPDATED_AT TRIGGER (idempotent)

CREATE OR REPLACE FUNCTION public.update_cs_session_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cs_session_updated_at ON public.communication_shield_sessions;
CREATE TRIGGER trg_cs_session_updated_at
  BEFORE UPDATE ON public.communication_shield_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_cs_session_updated_at();

-- 7. DATA MIGRATION from communication_shield_history
-- Only runs if history table exists and new tables are empty (safe re-run)

DO $$
DECLARE
  history_exists boolean;
  sessions_empty boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'communication_shield_history'
  ) INTO history_exists;

  IF NOT history_exists THEN
    RAISE NOTICE 'No history table found, skipping data migration';
    RETURN;
  END IF;

  SELECT NOT EXISTS (SELECT 1 FROM public.communication_shield_sessions LIMIT 1)
    INTO sessions_empty;

  IF NOT sessions_empty THEN
    RAISE NOTICE 'Sessions table already has data, skipping data migration';
    RETURN;
  END IF;

  -- Insert session rows (one per history record)
  INSERT INTO public.communication_shield_sessions (
    id, user_id, mode, original_message, created_at, updated_at,
    original_score, original_score_notes,
    rewrite_quality_score, rewrite_quality_notes,
    quality_score_total, quality_score_status, quality_score_notes,
    admission_risk_score, escalation_safety_score,
    actionability_score, focus_discipline_score, court_safe_phrasing_score,
    recommendation_type, tone_assessment,
    migrated_from_history_id
  )
  SELECT
    gen_random_uuid(), user_id,
    CASE WHEN mode IN ('respond', 'rewrite') THEN mode ELSE 'respond' END,
    original_message, created_at, created_at,
    original_score, original_score_notes,
    rewrite_quality_score, rewrite_quality_notes,
    quality_score_total, quality_score_status, quality_score_notes,
    admission_risk_score, escalation_safety_score,
    actionability_score, focus_discipline_score, court_safe_phrasing_score,
    recommendation_type, tone_assessment,
    id
  FROM public.communication_shield_history;

  -- Insert result rows (one primary result per session)
  INSERT INTO public.communication_shield_results (
    session_id, result_type,
    primary_rewrite, primary_response,
    shorter_version, firmer_version,
    risk_flags, why_this_is_safer,
    created_at, generation_index, is_selected
  )
  SELECT
    s.id,
    CASE WHEN s.mode = 'respond' THEN 'respond_output' ELSE 'primary' END,
    h.primary_rewrite, h.primary_response,
    h.shorter_version, h.firmer_version,
    COALESCE(h.risk_flags, '[]'::jsonb), h.why_this_is_safer,
    h.created_at, 1, true
  FROM public.communication_shield_sessions s
  JOIN public.communication_shield_history h ON h.id = s.migrated_from_history_id;

  RAISE NOTICE 'Data migration complete: % sessions created',
    (SELECT count(*) FROM public.communication_shield_sessions WHERE migrated_from_history_id IS NOT NULL);
END $$;
