ALTER TABLE public.communication_shield_results
  DROP COLUMN IF EXISTS redirect_message,
  DROP COLUMN IF EXISTS safe_alternative,
  DROP COLUMN IF EXISTS alternative_1,
  DROP COLUMN IF EXISTS alternative_2,
  DROP COLUMN IF EXISTS alternative_3;