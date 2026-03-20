
-- Fix ai_gold_suite_results: admin-only INSERT
DROP POLICY IF EXISTS "Authenticated users can insert gold suite results" ON public.ai_gold_suite_results;
CREATE POLICY "Only admins can insert gold suite results"
ON public.ai_gold_suite_results FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

-- Fix ai_gold_suite_runs: admin-only INSERT and UPDATE
DROP POLICY IF EXISTS "Authenticated users can insert gold suite runs" ON public.ai_gold_suite_runs;
CREATE POLICY "Only admins can insert gold suite runs"
ON public.ai_gold_suite_runs FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can update gold suite runs" ON public.ai_gold_suite_runs;
CREATE POLICY "Only admins can update gold suite runs"
ON public.ai_gold_suite_runs FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));
