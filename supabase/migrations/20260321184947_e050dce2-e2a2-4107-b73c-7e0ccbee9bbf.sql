
-- Rename legacy table
ALTER TABLE IF EXISTS public.communication_shield_history
  RENAME TO communication_shield_history_legacy;

-- Block new inserts with a trigger
CREATE OR REPLACE FUNCTION public.block_legacy_cs_inserts()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'communication_shield_history_legacy is deprecated. Use communication_shield_sessions + communication_shield_results instead.';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_legacy_cs_inserts ON public.communication_shield_history_legacy;
CREATE TRIGGER trg_block_legacy_cs_inserts
  BEFORE INSERT ON public.communication_shield_history_legacy
  FOR EACH ROW
  EXECUTE FUNCTION public.block_legacy_cs_inserts();
