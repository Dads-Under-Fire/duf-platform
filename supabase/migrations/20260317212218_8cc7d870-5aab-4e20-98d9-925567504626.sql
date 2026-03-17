
-- Fix usage_counters unique constraint to include period_end
ALTER TABLE public.usage_counters
  DROP CONSTRAINT usage_counters_user_id_period_start_key;

ALTER TABLE public.usage_counters
  ADD CONSTRAINT usage_counters_user_id_period_start_period_end_key
  UNIQUE (user_id, period_start, period_end);

-- Add user_id indexes for tables that don't already have one via unique constraint
CREATE INDEX idx_message_rewrites_user_id ON public.message_rewrites (user_id);
CREATE INDEX idx_evidence_analyses_user_id ON public.evidence_analyses (user_id);
CREATE INDEX idx_usage_counters_user_id ON public.usage_counters (user_id);
