
-- Replace increment_message_rewrites to use auth.uid() directly
CREATE OR REPLACE FUNCTION public.increment_message_rewrites(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.profiles
  SET message_rewrites_used = message_rewrites_used + 1,
      updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

-- Replace check_message_rewrite_quota to use auth.uid() directly
CREATE OR REPLACE FUNCTION public.check_message_rewrite_quota(p_user_id uuid)
RETURNS TABLE(allowed boolean, used integer, "limit" integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    (p.message_rewrites_used < p.message_rewrites_limit) AS allowed,
    p.message_rewrites_used AS used,
    p.message_rewrites_limit AS "limit"
  FROM public.profiles p
  WHERE p.user_id = p_user_id;
END;
$$;
