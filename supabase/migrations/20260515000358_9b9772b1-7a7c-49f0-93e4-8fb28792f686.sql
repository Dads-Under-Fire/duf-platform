UPDATE public.subscriptions
SET plan = 'pro',
    status = 'active',
    stripe_customer_id = 'cus_UWBU4akPrxYvQc',
    stripe_subscription_id = 'sub_1TX978Q4McEga1ntptqkbddw',
    cancel_at_period_end = false,
    billing_period_start = to_timestamp(1778802983),
    billing_period_end = to_timestamp(1781481383),
    updated_at = now()
WHERE user_id = '4923cf10-dae4-494d-911f-71d132b8859a';

UPDATE public.profiles
SET intended_plan = NULL, updated_at = now()
WHERE user_id = '4923cf10-dae4-494d-911f-71d132b8859a';

-- Clear stale dedupe rows so any future Stripe replay can re-process
DELETE FROM public.stripe_webhook_events
WHERE event_id IN ('evt_1TX979Q4McEga1ntXiZzIS6o','evt_1TX97AQ4McEga1ntTjWHniWG','evt_1TX979Q4McEga1ntxBSWTE1T');