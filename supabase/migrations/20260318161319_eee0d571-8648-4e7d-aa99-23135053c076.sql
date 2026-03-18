
-- Add mode-aware primary output columns
ALTER TABLE public.message_rewrites
  ADD COLUMN IF NOT EXISTS primary_response text,
  ADD COLUMN IF NOT EXISTS primary_rewrite text;

-- Migrate historical data from rewritten_message into the correct column
UPDATE public.message_rewrites
  SET primary_response = rewritten_message
  WHERE mode = 'respond' AND primary_response IS NULL;

UPDATE public.message_rewrites
  SET primary_rewrite = rewritten_message
  WHERE mode = 'rewrite' AND primary_rewrite IS NULL;

-- Drop the overloaded column
ALTER TABLE public.message_rewrites DROP COLUMN IF EXISTS rewritten_message;

-- Rename table to communication_shield_history
ALTER TABLE public.message_rewrites RENAME TO communication_shield_history;

COMMENT ON TABLE public.communication_shield_history IS 'Communication Shield history for both respond and rewrite modes';
COMMENT ON COLUMN public.communication_shield_history.primary_response IS 'Primary output for respond mode';
COMMENT ON COLUMN public.communication_shield_history.primary_rewrite IS 'Primary output for rewrite mode';
