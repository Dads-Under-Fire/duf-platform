ALTER TABLE public.communication_shield_results DROP CONSTRAINT IF EXISTS chk_result_type;
ALTER TABLE public.communication_shield_results
  ADD CONSTRAINT chk_result_type CHECK (
    result_type IN ('primary', 'alternative', 'redirect', 'respond_output', 'no_message', 'do_not_send')
  );