
-- Track Stripe identifiers + cancel state on subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS subscriptions_stripe_customer_id_idx
  ON public.subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS subscriptions_stripe_subscription_id_idx
  ON public.subscriptions(stripe_subscription_id);

-- Allow user to read updated_at etc; existing RLS already permits SELECT.
-- Webhook + verify-subscription run as service role and bypass RLS.

-- Rollover: ensure a usage_counters row exists that covers "now". Closes
-- expired periods by inserting a fresh row that begins where the prior ended
-- (or now() if there's a gap), so message_rewrites_used / case_intelligence_analyses_used
-- reset each billing period.
CREATE OR REPLACE FUNCTION public.ensure_current_usage_period(p_user_id uuid)
RETURNS public.usage_counters
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.usage_counters;
  v_sub_start timestamptz;
  v_sub_end timestamptz;
  v_new_start timestamptz;
  v_new_end timestamptz;
BEGIN
  -- Currently-valid row
  SELECT * INTO v_row
  FROM public.usage_counters
  WHERE user_id = p_user_id
    AND now() BETWEEN period_start AND period_end
  ORDER BY period_start DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN v_row;
  END IF;

  -- Prefer billing period from subscription, when available and still valid
  SELECT s.billing_period_start, s.billing_period_end
    INTO v_sub_start, v_sub_end
  FROM public.subscriptions s
  WHERE s.user_id = p_user_id
  LIMIT 1;

  IF v_sub_start IS NOT NULL AND v_sub_end IS NOT NULL AND now() <= v_sub_end THEN
    v_new_start := v_sub_start;
    v_new_end := v_sub_end;
  ELSE
    v_new_start := now();
    v_new_end := now() + interval '30 days';
  END IF;

  INSERT INTO public.usage_counters (user_id, period_start, period_end)
  VALUES (p_user_id, v_new_start, v_new_end)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Update quota RPCs to call ensure_current_usage_period first.
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
  v_row public.usage_counters;
BEGIN
  SELECT s.plan INTO v_plan
  FROM public.subscriptions s
  WHERE s.user_id = p_user_id AND s.status IN ('active', 'trialing')
  LIMIT 1;
  IF v_plan IS NULL THEN v_plan := 'free'; END IF;

  v_limit := public.get_case_intelligence_limit(v_plan);
  v_row := public.ensure_current_usage_period(p_user_id);
  v_used := COALESCE(v_row.case_intelligence_analyses_used, 0);

  IF v_used >= v_limit THEN
    RETURN QUERY SELECT false, v_used, v_limit;
    RETURN;
  END IF;

  UPDATE public.usage_counters
  SET case_intelligence_analyses_used = case_intelligence_analyses_used + 1,
      updated_at = now()
  WHERE id = v_row.id;

  RETURN QUERY SELECT true, v_used + 1, v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_message_rewrites(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.usage_counters;
BEGIN
  v_row := public.ensure_current_usage_period(p_user_id);
  UPDATE public.usage_counters
  SET message_rewrites_used = message_rewrites_used + 1,
      updated_at = now()
  WHERE id = v_row.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_message_rewrite_quota(p_user_id uuid)
RETURNS TABLE(allowed boolean, used integer, "limit" integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan plan_type;
  v_used integer;
  v_limit integer;
  v_row public.usage_counters;
BEGIN
  SELECT s.plan INTO v_plan
  FROM public.subscriptions s
  WHERE s.user_id = p_user_id AND s.status IN ('active', 'trialing')
  LIMIT 1;
  IF v_plan IS NULL THEN v_plan := 'free'; END IF;

  v_limit := public.get_message_rewrites_limit(v_plan);
  v_row := public.ensure_current_usage_period(p_user_id);
  v_used := COALESCE(v_row.message_rewrites_used, 0);

  RETURN QUERY SELECT (v_used < v_limit), v_used, v_limit;
END;
$$;
