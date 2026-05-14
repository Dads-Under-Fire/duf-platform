UPDATE public.profiles p
SET intended_plan = NULL, updated_at = now()
FROM public.subscriptions s
WHERE s.user_id = p.user_id
  AND p.intended_plan IS NOT NULL
  AND (s.stripe_customer_id IS NOT NULL OR s.plan = 'free');