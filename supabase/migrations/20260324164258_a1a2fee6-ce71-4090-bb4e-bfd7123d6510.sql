
-- Add respond-specific metadata columns to communication_shield_sessions
ALTER TABLE public.communication_shield_sessions
  ADD COLUMN IF NOT EXISTS recommendation_type text,
  ADD COLUMN IF NOT EXISTS actionable_logistics_summary text,
  ADD COLUMN IF NOT EXISTS selected_response_intent text,
  ADD COLUMN IF NOT EXISTS response_intent_options jsonb;

-- Update output_path check constraint to allow respond-specific values
-- First drop if exists, then recreate
ALTER TABLE public.communication_shield_sessions DROP CONSTRAINT IF EXISTS chk_output_path;
ALTER TABLE public.communication_shield_sessions ADD CONSTRAINT chk_output_path
  CHECK (output_path IS NULL OR output_path IN (
    'rewrite', 'rewrite_with_guidance', 'redirect_choice', 'no_message',
    'do_not_respond', 'brief_boundary_response', 'respond'
  ));
