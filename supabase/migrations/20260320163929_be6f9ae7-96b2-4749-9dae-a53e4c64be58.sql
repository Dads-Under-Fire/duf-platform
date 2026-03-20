
-- 1. Create security definer function to check admin role
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = p_user_id AND role = 'admin'
  )
$$;

-- 2. Drop existing overly permissive INSERT policy
DROP POLICY IF EXISTS "Authenticated users can insert gold suite cases" ON public.ai_gold_suite_cases;

-- 3. Create admin-only INSERT policy
CREATE POLICY "Only admins can insert gold suite cases"
ON public.ai_gold_suite_cases FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

-- 4. Keep existing SELECT policy (read is fine for authenticated users viewing QA results)
-- No change needed for SELECT

-- 5. Create admin-only UPDATE policy
CREATE POLICY "Only admins can update gold suite cases"
ON public.ai_gold_suite_cases FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- 6. Create admin-only DELETE policy
CREATE POLICY "Only admins can delete gold suite cases"
ON public.ai_gold_suite_cases FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));
