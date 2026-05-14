-- 1. Webhook idempotency table
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  payload_created_at timestamptz,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies: only service role (which bypasses RLS) may touch this table.

-- 2. Eager rollover routine for expired usage periods
CREATE OR REPLACE FUNCTION public.roll_forward_expired_usage_periods()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user record;
  v_count integer := 0;
BEGIN
  FOR v_user IN
    SELECT DISTINCT uc.user_id
    FROM public.usage_counters uc
    WHERE uc.period_end < now()
      AND NOT EXISTS (
        SELECT 1 FROM public.usage_counters uc2
        WHERE uc2.user_id = uc.user_id
          AND now() BETWEEN uc2.period_start AND uc2.period_end
      )
  LOOP
    PERFORM public.ensure_current_usage_period(v_user.user_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- 3. Schedule hourly via pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'roll-forward-usage-periods') THEN
    PERFORM cron.unschedule('roll-forward-usage-periods');
  END IF;
  PERFORM cron.schedule(
    'roll-forward-usage-periods',
    '0 * * * *',
    $cron$ SELECT public.roll_forward_expired_usage_periods(); $cron$
  );
END $$;