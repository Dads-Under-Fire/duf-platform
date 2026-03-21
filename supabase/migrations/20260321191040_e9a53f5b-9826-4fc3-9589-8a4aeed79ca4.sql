
-- Drop the old unique constraint that only allows one active prompt per (feature_key, mode)
DROP INDEX IF EXISTS public.idx_one_active_prompt_per_mode;

-- Create new constraint: one active prompt per (feature_key, mode, stage_key)
CREATE UNIQUE INDEX idx_one_active_prompt_per_stage
  ON public.ai_system_prompts (feature_key, mode, stage_key)
  WHERE (is_active = true);
