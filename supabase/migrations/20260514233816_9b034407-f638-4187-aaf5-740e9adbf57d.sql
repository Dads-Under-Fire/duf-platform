CREATE OR REPLACE FUNCTION public.ensure_current_usage_period(p_user_id uuid)
 RETURNS usage_counters
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.usage_counters;
  v_sub_start timestamptz;
  v_sub_end timestamptz;
  v_sub_stripe_id text;
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

  -- Look up subscription billing period and Stripe linkage
  SELECT s.billing_period_start, s.billing_period_end, s.stripe_subscription_id
    INTO v_sub_start, v_sub_end, v_sub_stripe_id
  FROM public.subscriptions s
  WHERE s.user_id = p_user_id
  LIMIT 1;

  IF v_sub_start IS NOT NULL AND v_sub_end IS NOT NULL AND now() <= v_sub_end THEN
    v_new_start := v_sub_start;
    v_new_end := v_sub_end;
  ELSE
    v_new_start := now();
    v_new_end := now() + interval '30 days';

    -- For non-Stripe users, keep subscriptions.billing_period_* aligned with the
    -- new usage period so the Account UI shows the same renewal date as TopBar.
    -- Stripe-managed subscriptions remain the source of truth and are not touched.
    IF v_sub_stripe_id IS NULL THEN
      UPDATE public.subscriptions
      SET billing_period_start = v_new_start,
          billing_period_end = v_new_end,
          updated_at = now()
      WHERE user_id = p_user_id;
    END IF;
  END IF;

  INSERT INTO public.usage_counters (user_id, period_start, period_end)
  VALUES (p_user_id, v_new_start, v_new_end)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;