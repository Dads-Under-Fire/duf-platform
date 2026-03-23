
-- Drop unnecessary columns from communication_shield_sessions
ALTER TABLE public.communication_shield_sessions
  DROP COLUMN IF EXISTS quality_score_notes,
  DROP COLUMN IF EXISTS quality_score_total,
  DROP COLUMN IF EXISTS quality_score_status,
  DROP COLUMN IF EXISTS admission_risk_score,
  DROP COLUMN IF EXISTS escalation_safety_score,
  DROP COLUMN IF EXISTS actionability_score,
  DROP COLUMN IF EXISTS focus_discipline_score,
  DROP COLUMN IF EXISTS court_safe_phrasing_score,
  DROP COLUMN IF EXISTS recommendation_type,
  DROP COLUMN IF EXISTS migrated_from_history_id,
  DROP COLUMN IF EXISTS original_score,
  DROP COLUMN IF EXISTS original_score_notes,
  DROP COLUMN IF EXISTS rewrite_quality_score,
  DROP COLUMN IF EXISTS rewrite_quality_notes,
  DROP COLUMN IF EXISTS tone_assessment,
  DROP COLUMN IF EXISTS scoring_version,
  DROP COLUMN IF EXISTS rewrite_prompt_version,
  DROP COLUMN IF EXISTS triage_prompt_version,
  DROP COLUMN IF EXISTS goal_selection_source;
