ALTER TABLE public.communication_shield_sessions DROP CONSTRAINT chk_output_path;
ALTER TABLE public.communication_shield_sessions ADD CONSTRAINT chk_output_path
  CHECK (output_path IS NULL OR output_path IN ('rewrite', 'rewrite_with_guidance', 'redirect', 'redirect_choice', 'no_message'));