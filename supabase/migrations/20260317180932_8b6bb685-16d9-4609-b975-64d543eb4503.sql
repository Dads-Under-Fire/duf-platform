
-- Create a SECURITY DEFINER function to increment message_rewrites_used
-- Only callable server-side, bypasses RLS
CREATE OR REPLACE FUNCTION public.increment_message_rewrites(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET message_rewrites_used = message_rewrites_used + 1,
      updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

-- Create a SECURITY DEFINER function to check quota
CREATE OR REPLACE FUNCTION public.check_message_rewrite_quota(p_user_id uuid)
RETURNS TABLE(allowed boolean, used integer, "limit" integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (p.message_rewrites_used < p.message_rewrites_limit) AS allowed,
    p.message_rewrites_used AS used,
    p.message_rewrites_limit AS "limit"
  FROM public.profiles p
  WHERE p.user_id = p_user_id;
END;
$$;

-- Drop the overly permissive UPDATE policy
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Create a restricted UPDATE policy that only allows updating display_name
CREATE POLICY "Users can update own display_name"
ON public.profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
