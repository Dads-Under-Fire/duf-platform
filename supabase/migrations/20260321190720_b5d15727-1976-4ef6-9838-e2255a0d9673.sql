
-- Task 1: Add stage_key column to ai_system_prompts
ALTER TABLE public.ai_system_prompts
  ADD COLUMN IF NOT EXISTS stage_key text NOT NULL DEFAULT 'generate';

-- Backfill existing rows (already defaulted, but be explicit)
UPDATE public.ai_system_prompts SET stage_key = 'generate' WHERE stage_key IS NULL;

-- Add a comment for clarity
COMMENT ON COLUMN public.ai_system_prompts.stage_key IS 'Workflow stage: generate, triage, redirect, score';
