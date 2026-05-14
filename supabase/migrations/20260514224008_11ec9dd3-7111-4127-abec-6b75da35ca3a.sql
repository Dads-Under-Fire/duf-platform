
-- 1. Rename quota column
ALTER TABLE public.usage_counters
  RENAME COLUMN evidence_analyses_used TO case_intelligence_analyses_used;

-- 2. Drop unused legacy column
ALTER TABLE public.usage_counters
  DROP COLUMN IF EXISTS evidence_words_used;

-- 3. Drop deprecated functions
DROP FUNCTION IF EXISTS public.check_evidence_analysis_quota(uuid, integer);
DROP FUNCTION IF EXISTS public.increment_evidence_analyses(uuid, integer);
DROP FUNCTION IF EXISTS public.get_plan_limits(plan_type);

-- 4. Drop unused legacy table (no current code path reads or writes it)
DROP TABLE IF EXISTS public.evidence_analyses;

-- 5. Recreate the consume function against the renamed column
CREATE OR REPLACE FUNCTION public.consume_case_intelligence_analysis(p_user_id uuid)
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

  v_limit := public.get_case_intelligence_limit(v_plan);

  INSERT INTO public.usage_counters (user_id, period_start, period_end)
  SELECT p_user_id, now(), now() + interval '30 days'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.usage_counters uc
    WHERE uc.user_id = p_user_id AND now() BETWEEN uc.period_start AND uc.period_end
  );

  SELECT COALESCE(uc.case_intelligence_analyses_used, 0) INTO v_used
  FROM public.usage_counters uc
  WHERE uc.user_id = p_user_id AND now() BETWEEN uc.period_start AND uc.period_end
  ORDER BY uc.period_start DESC
  LIMIT 1;

  IF v_used >= v_limit THEN
    RETURN QUERY SELECT false, v_used, v_limit;
    RETURN;
  END IF;

  UPDATE public.usage_counters
  SET case_intelligence_analyses_used = case_intelligence_analyses_used + 1,
      updated_at = now()
  WHERE user_id = p_user_id
    AND now() BETWEEN period_start AND period_end;

  RETURN QUERY SELECT true, v_used + 1, v_limit;
END;
$function$;
