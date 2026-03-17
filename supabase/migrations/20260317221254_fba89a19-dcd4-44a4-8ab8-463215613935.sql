
-- Drop old get_plan_limits (return type changed)
DROP FUNCTION IF EXISTS public.get_plan_limits(plan_type);

-- Recreate with new return type including evidence_words_limit
CREATE OR REPLACE FUNCTION public.get_plan_limits(p_plan plan_type)
 RETURNS TABLE(message_rewrites_limit integer, evidence_analyses_limit integer, evidence_words_limit integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT
    CASE p_plan
      WHEN 'free' THEN 2
      WHEN 'core' THEN 100
      WHEN 'pro' THEN 250
      WHEN 'case_builder' THEN 999999
    END AS message_rewrites_limit,
    CASE p_plan
      WHEN 'free' THEN 1
      WHEN 'core' THEN 999999
      WHEN 'pro' THEN 999999
      WHEN 'case_builder' THEN 999999
    END AS evidence_analyses_limit,
    CASE p_plan
      WHEN 'free' THEN 0
      WHEN 'core' THEN 15000
      WHEN 'pro' THEN 60000
      WHEN 'case_builder' THEN 200000
    END AS evidence_words_limit;
$$;

-- Recreate check_message_rewrite_quota (uses get_plan_limits)
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

  SELECT pl.message_rewrites_limit INTO v_limit
  FROM public.get_plan_limits(v_plan) pl;

  SELECT COALESCE(uc.message_rewrites_used, 0) INTO v_used
  FROM public.usage_counters uc
  WHERE uc.user_id = p_user_id AND now() BETWEEN uc.period_start AND uc.period_end
  ORDER BY uc.period_start DESC LIMIT 1;

  IF v_used IS NULL THEN v_used := 0; END IF;

  RETURN QUERY SELECT (v_used < v_limit), v_used, v_limit;
END;
$function$;

-- Create check_evidence_analysis_quota
CREATE OR REPLACE FUNCTION public.check_evidence_analysis_quota(p_user_id uuid, p_word_count integer DEFAULT 0)
 RETURNS TABLE(allowed boolean, used integer, "limit" integer, unit text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan plan_type;
  v_used integer;
  v_limit integer;
  v_unit text;
BEGIN
  SELECT s.plan INTO v_plan
  FROM public.subscriptions s
  WHERE s.user_id = p_user_id AND s.status IN ('active', 'trialing')
  LIMIT 1;

  IF v_plan IS NULL THEN v_plan := 'free'; END IF;

  IF v_plan = 'free' THEN
    v_unit := 'analyses';
    SELECT pl.evidence_analyses_limit INTO v_limit FROM public.get_plan_limits(v_plan) pl;
    SELECT COALESCE(uc.evidence_analyses_used, 0) INTO v_used
    FROM public.usage_counters uc
    WHERE uc.user_id = p_user_id AND now() BETWEEN uc.period_start AND uc.period_end
    ORDER BY uc.period_start DESC LIMIT 1;
    IF v_used IS NULL THEN v_used := 0; END IF;
    RETURN QUERY SELECT (v_used < v_limit), v_used, v_limit, v_unit;
  ELSE
    v_unit := 'words';
    SELECT pl.evidence_words_limit INTO v_limit FROM public.get_plan_limits(v_plan) pl;
    SELECT COALESCE(uc.evidence_words_used, 0) INTO v_used
    FROM public.usage_counters uc
    WHERE uc.user_id = p_user_id AND now() BETWEEN uc.period_start AND uc.period_end
    ORDER BY uc.period_start DESC LIMIT 1;
    IF v_used IS NULL THEN v_used := 0; END IF;
    RETURN QUERY SELECT ((v_used + p_word_count) <= v_limit), v_used, v_limit, v_unit;
  END IF;
END;
$function$;

-- Create increment_evidence_analyses with word tracking
CREATE OR REPLACE FUNCTION public.increment_evidence_analyses(p_user_id uuid, p_word_count integer DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.usage_counters
  SET evidence_analyses_used = evidence_analyses_used + 1,
      evidence_words_used = evidence_words_used + p_word_count,
      updated_at = now()
  WHERE user_id = p_user_id
    AND now() BETWEEN period_start AND period_end;

  IF NOT FOUND THEN
    INSERT INTO public.usage_counters (user_id, period_start, period_end, evidence_analyses_used, evidence_words_used)
    VALUES (p_user_id, now(), now() + interval '30 days', 1, p_word_count);
  END IF;
END;
$function$;
