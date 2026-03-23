ALTER TABLE public.ai_gold_suite_results
  DROP COLUMN IF EXISTS original_score,
  DROP COLUMN IF EXISTS original_score_notes,
  DROP COLUMN IF EXISTS rewrite_quality_score,
  DROP COLUMN IF EXISTS rewrite_quality_notes,
  DROP COLUMN IF EXISTS tone_assessment,
  DROP COLUMN IF EXISTS risk_flags,
  DROP COLUMN IF EXISTS primary_rewrite,
  DROP COLUMN IF EXISTS shorter_version,
  DROP COLUMN IF EXISTS firmer_version,
  DROP COLUMN IF EXISTS why_this_is_safer;