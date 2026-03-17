
-- =============================================
-- 1. Create plan_type and subscription_status enums
-- =============================================
CREATE TYPE public.plan_type AS ENUM ('free', 'core', 'pro', 'case_builder');
CREATE TYPE public.subscription_status AS ENUM ('active', 'inactive', 'trialing', 'canceled', 'past_due');

-- =============================================
-- 2. Create subscriptions table
-- =============================================
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  plan plan_type NOT NULL DEFAULT 'free',
  status subscription_status NOT NULL DEFAULT 'active',
  billing_period_start timestamp with time zone NOT NULL DEFAULT now(),
  billing_period_end timestamp with time zone NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own subscription" ON public.subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can insert own subscription" ON public.subscriptions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- =============================================
-- 3. Create usage_counters table
-- =============================================
CREATE TABLE public.usage_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start timestamp with time zone NOT NULL DEFAULT now(),
  period_end timestamp with time zone NOT NULL DEFAULT (now() + interval '30 days'),
  message_rewrites_used integer NOT NULL DEFAULT 0,
  evidence_analyses_used integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_start)
);

ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own usage" ON public.usage_counters
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can insert own usage" ON public.usage_counters
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- =============================================
-- 4. Create evidence_analyses table
-- =============================================
CREATE TABLE public.evidence_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_content text NOT NULL,
  analysis_result text NOT NULL,
  analysis_type text NOT NULL DEFAULT 'general',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.evidence_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own analyses" ON public.evidence_analyses
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can insert own analyses" ON public.evidence_analyses
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- =============================================
-- 5. Remove usage/limit columns from profiles
-- =============================================
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS message_rewrites_used,
  DROP COLUMN IF EXISTS message_rewrites_limit,
  DROP COLUMN IF EXISTS evidence_analyses_used,
  DROP COLUMN IF EXISTS evidence_analyses_limit;

-- =============================================
-- 6. Seed subscriptions + usage_counters for existing users
-- =============================================
INSERT INTO public.subscriptions (user_id, plan, status)
SELECT user_id, 'free', 'active' FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.usage_counters (user_id, period_start, period_end, message_rewrites_used, evidence_analyses_used)
SELECT user_id, now(), now() + interval '30 days', 0, 0 FROM public.profiles
ON CONFLICT (user_id, period_start) DO NOTHING;

-- =============================================
-- 7. Update handle_new_user trigger to also create subscription + usage
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));

  INSERT INTO public.subscriptions (user_id, plan, status)
  VALUES (NEW.id, 'free', 'active');

  INSERT INTO public.usage_counters (user_id, period_start, period_end)
  VALUES (NEW.id, now(), now() + interval '30 days');

  RETURN NEW;
END;
$$;

-- =============================================
-- 8. Define plan limits function
-- =============================================
CREATE OR REPLACE FUNCTION public.get_plan_limits(p_plan plan_type)
RETURNS TABLE(message_rewrites_limit integer, evidence_analyses_limit integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    CASE p_plan
      WHEN 'free' THEN 25
      WHEN 'core' THEN 250
      WHEN 'pro' THEN 1000
      WHEN 'case_builder' THEN 5000
    END AS message_rewrites_limit,
    CASE p_plan
      WHEN 'free' THEN 5
      WHEN 'core' THEN 25
      WHEN 'pro' THEN 100
      WHEN 'case_builder' THEN 500
    END AS evidence_analyses_limit;
$$;

-- =============================================
-- 9. Replace check_message_rewrite_quota
-- =============================================
CREATE OR REPLACE FUNCTION public.check_message_rewrite_quota(p_user_id uuid)
RETURNS TABLE(allowed boolean, used integer, "limit" integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_plan plan_type;
  v_used integer;
  v_limit integer;
BEGIN
  -- Get user plan
  SELECT s.plan INTO v_plan
  FROM public.subscriptions s
  WHERE s.user_id = p_user_id AND s.status IN ('active', 'trialing')
  LIMIT 1;

  IF v_plan IS NULL THEN
    v_plan := 'free';
  END IF;

  -- Get limit from plan
  SELECT pl.message_rewrites_limit INTO v_limit
  FROM public.get_plan_limits(v_plan) pl;

  -- Get current period usage
  SELECT COALESCE(uc.message_rewrites_used, 0) INTO v_used
  FROM public.usage_counters uc
  WHERE uc.user_id = p_user_id AND now() BETWEEN uc.period_start AND uc.period_end
  ORDER BY uc.period_start DESC
  LIMIT 1;

  IF v_used IS NULL THEN
    v_used := 0;
  END IF;

  RETURN QUERY SELECT (v_used < v_limit), v_used, v_limit;
END;
$$;

-- =============================================
-- 10. Replace increment_message_rewrites
-- =============================================
CREATE OR REPLACE FUNCTION public.increment_message_rewrites(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.usage_counters
  SET message_rewrites_used = message_rewrites_used + 1,
      updated_at = now()
  WHERE user_id = p_user_id
    AND now() BETWEEN period_start AND period_end;

  -- If no row was updated, create a new period
  IF NOT FOUND THEN
    INSERT INTO public.usage_counters (user_id, period_start, period_end, message_rewrites_used)
    VALUES (p_user_id, now(), now() + interval '30 days', 1);
  END IF;
END;
$$;
