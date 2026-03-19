-- Add validator_status column (pass/warn/fail) to ai_gold_suite_results
ALTER TABLE public.ai_gold_suite_results
ADD COLUMN IF NOT EXISTS validator_status text DEFAULT NULL;