
CREATE POLICY "Authenticated users can update gold suite runs" ON public.ai_gold_suite_runs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
