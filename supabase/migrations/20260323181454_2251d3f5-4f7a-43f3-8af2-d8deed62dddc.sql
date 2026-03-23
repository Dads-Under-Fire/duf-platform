
-- Rename columns to match new schema
ALTER TABLE public.ai_gold_suite_cases RENAME COLUMN test_id TO name;
ALTER TABLE public.ai_gold_suite_cases RENAME COLUMN original_message TO input_message;

-- Drop legacy fields
ALTER TABLE public.ai_gold_suite_cases DROP COLUMN IF EXISTS expected_behavior;
ALTER TABLE public.ai_gold_suite_cases DROP COLUMN IF EXISTS must_not_do;
ALTER TABLE public.ai_gold_suite_cases DROP COLUMN IF EXISTS validator_rules;

-- Add check constraints
ALTER TABLE public.ai_gold_suite_cases ADD CONSTRAINT chk_sendability_status
  CHECK (expected_sendability_status IS NULL OR expected_sendability_status IN ('safe', 'salvageable', 'redirect'));

ALTER TABLE public.ai_gold_suite_cases ADD CONSTRAINT chk_output_path
  CHECK (expected_output_path IS NULL OR expected_output_path IN ('rewrite', 'redirect_choice', 'no_message'));
