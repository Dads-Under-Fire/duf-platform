-- Add a Case Intelligence-aware quota function that uses the new pricing tiers
-- (Free 1, Core 4, Pro 12, Case Builder 30) and atomically increments
-- usage_counters.evidence_analyses_used (we keep the old column name for now).

CREATE OR REPLACE FUNCTION public.get_case_intelligence_limit(p_plan plan_type)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_plan
    WHEN 'free' THEN 1
    WHEN 'core' THEN 4
    WHEN 'pro' THEN 12
    WHEN 'case_builder' THEN 30
  END;
$$;

CREATE OR REPLACE FUNCTION public.consume_case_intelligence_analysis(p_user_id uuid)
RETURNS TABLE(allowed boolean, used integer, "limit" integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan plan_type;
  v_used integer;
  v_limit integer;
BEGIN
  SELECT s.plan INTO v_plan
  FROM public.subscriptions s
  WHERE s.user_id = p_user_id AND s.status IN ('active', 'trialing')
  LIMIT 1;

  IF v_plan IS NULL THEN v_plan := 'free'; END IF;

  v_limit := public.get_case_intelligence_limit(v_plan);

  -- Ensure a current usage period row exists
  INSERT INTO public.usage_counters (user_id, period_start, period_end)
  SELECT p_user_id, now(), now() + interval '30 days'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.usage_counters uc
    WHERE uc.user_id = p_user_id AND now() BETWEEN uc.period_start AND uc.period_end
  );

  SELECT COALESCE(uc.evidence_analyses_used, 0) INTO v_used
  FROM public.usage_counters uc
  WHERE uc.user_id = p_user_id AND now() BETWEEN uc.period_start AND uc.period_end
  ORDER BY uc.period_start DESC
  LIMIT 1;

  IF v_used >= v_limit THEN
    RETURN QUERY SELECT false, v_used, v_limit;
    RETURN;
  END IF;

  UPDATE public.usage_counters
  SET evidence_analyses_used = evidence_analyses_used + 1,
      updated_at = now()
  WHERE user_id = p_user_id
    AND now() BETWEEN period_start AND period_end;

  RETURN QUERY SELECT true, v_used + 1, v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_case_intelligence_analysis(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_case_intelligence_limit(plan_type) TO authenticated;