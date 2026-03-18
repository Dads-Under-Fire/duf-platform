ALTER TABLE public.communication_shield_history
  ADD COLUMN quality_score_total integer,
  ADD COLUMN admission_risk_score integer,
  ADD COLUMN escalation_safety_score integer,
  ADD COLUMN actionability_score integer,
  ADD COLUMN focus_discipline_score integer,
  ADD COLUMN court_safe_phrasing_score integer,
  ADD COLUMN quality_score_status text,
  ADD COLUMN quality_score_notes jsonb;