-- Add canonical slug column to case_intelligence_patterns
ALTER TABLE public.case_intelligence_patterns
  ADD COLUMN IF NOT EXISTS slug text;

-- Backfill any existing rows with a placeholder so we can set NOT NULL safely.
UPDATE public.case_intelligence_patterns
SET slug = 'failure_to_coparent'
WHERE slug IS NULL;

ALTER TABLE public.case_intelligence_patterns
  ALTER COLUMN slug SET NOT NULL;

-- Restrict to canonical DUF v1 taxonomy
ALTER TABLE public.case_intelligence_patterns
  DROP CONSTRAINT IF EXISTS case_intelligence_patterns_slug_check;

ALTER TABLE public.case_intelligence_patterns
  ADD CONSTRAINT case_intelligence_patterns_slug_check
  CHECK (slug IN (
    'possession_interference',
    'medical_decision_neglect',
    'medical_records_exclusion',
    'communication_violations',
    'harassment_threats_coercion',
    'unilateral_decision_making',
    'withholding_information',
    'escalation_after_accountability',
    'failure_to_coparent'
  ));

-- One pattern slug per analysis
CREATE UNIQUE INDEX IF NOT EXISTS case_intelligence_patterns_analysis_slug_unique
  ON public.case_intelligence_patterns (analysis_id, slug);
