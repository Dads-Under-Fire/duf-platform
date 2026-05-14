CREATE OR REPLACE FUNCTION public.get_message_rewrites_limit(p_plan plan_type)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE p_plan
    WHEN 'free' THEN 2
    WHEN 'core' THEN 100
    WHEN 'pro' THEN 250
    WHEN 'case_builder' THEN 999999
  END;
$$;

CREATE OR REPLACE FUNCTION public.check_message_rewrite_quota(p_user_id uuid)
RETURNS TABLE(allowed boolean, used integer, "limit" integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  v_limit := public.get_message_rewrites_limit(v_plan);

  SELECT COALESCE(uc.message_rewrites_used, 0) INTO v_used
  FROM public.usage_counters uc
  WHERE uc.user_id = p_user_id AND now() BETWEEN uc.period_start AND uc.period_end
  ORDER BY uc.period_start DESC LIMIT 1;

  IF v_used IS NULL THEN v_used := 0; END IF;

  RETURN QUERY SELECT (v_used < v_limit), v_used, v_limit;
END;
$function$;