UPDATE public.subscriptions s
SET billing_period_start = u.period_start,
    billing_period_end = u.period_end,
    updated_at = now()
FROM public.usage_counters u
WHERE u.user_id = s.user_id
  AND s.stripe_subscription_id IS NULL
  AND now() BETWEEN u.period_start AND u.period_end
  AND s.billing_period_end <> u.period_end;