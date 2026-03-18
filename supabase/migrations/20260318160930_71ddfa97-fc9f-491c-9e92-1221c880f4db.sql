ALTER TABLE public.message_rewrites
  ADD COLUMN IF NOT EXISTS recommendation_type text,
  ADD COLUMN IF NOT EXISTS shorter_version text,
  ADD COLUMN IF NOT EXISTS firmer_version text,
  ADD COLUMN IF NOT EXISTS why_this_is_safer text;

COMMENT ON TABLE public.message_rewrites IS 'Communication Shield history for both respond and rewrite modes';
COMMENT ON COLUMN public.message_rewrites.rewritten_message IS 'Primary text: primary_response (respond mode) or primary_rewrite (rewrite mode)';
COMMENT ON COLUMN public.message_rewrites.recommendation_type IS 'respond mode only: respond, do_not_respond, or brief_boundary_response';