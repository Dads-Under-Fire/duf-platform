ALTER TABLE public.communication_shield_history
  ADD COLUMN IF NOT EXISTS original_score integer,
  ADD COLUMN IF NOT EXISTS rewrite_quality_score integer,
  ADD COLUMN IF NOT EXISTS original_score_notes jsonb,
  ADD COLUMN IF NOT EXISTS rewrite_quality_notes jsonb;