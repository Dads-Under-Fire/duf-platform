-- Add metadata columns to ai_system_prompts
ALTER TABLE public.ai_system_prompts
  ADD COLUMN IF NOT EXISTS prompt_name text,
  ADD COLUMN IF NOT EXISTS prompt_purpose text,
  ADD COLUMN IF NOT EXISTS output_schema_key text,
  ADD COLUMN IF NOT EXISTS is_production boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deprecated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz;

-- Add light constraints for non-empty required text fields
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_feature_key_nonempty') THEN
    ALTER TABLE public.ai_system_prompts ADD CONSTRAINT chk_feature_key_nonempty CHECK (length(trim(feature_key)) > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_mode_nonempty') THEN
    ALTER TABLE public.ai_system_prompts ADD CONSTRAINT chk_mode_nonempty CHECK (length(trim(mode)) > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_stage_key_nonempty') THEN
    ALTER TABLE public.ai_system_prompts ADD CONSTRAINT chk_stage_key_nonempty CHECK (length(trim(stage_key)) > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_version_label_nonempty') THEN
    ALTER TABLE public.ai_system_prompts ADD CONSTRAINT chk_version_label_nonempty CHECK (length(trim(version_label)) > 0);
  END IF;
END $$;

-- Refine the active-prompt uniqueness index to also require is_production
DROP INDEX IF EXISTS idx_one_active_prompt_per_stage;
CREATE UNIQUE INDEX idx_one_active_prompt_per_stage
  ON public.ai_system_prompts (feature_key, mode, stage_key)
  WHERE (is_active = true AND is_production = true);

-- Add a general lookup index for prompt queries
CREATE INDEX IF NOT EXISTS idx_prompts_lookup
  ON public.ai_system_prompts (feature_key, mode, stage_key, is_active, is_production);