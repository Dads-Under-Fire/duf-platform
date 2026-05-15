ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS billing_interval text NOT NULL DEFAULT 'month'
CHECK (billing_interval IN ('month','year'));