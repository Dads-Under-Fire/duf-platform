ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS pending_plan plan_type,
  ADD COLUMN IF NOT EXISTS pending_interval text,
  ADD COLUMN IF NOT EXISTS pending_effective_at timestamptz;