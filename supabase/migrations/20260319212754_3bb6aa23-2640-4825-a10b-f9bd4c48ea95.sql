
-- Gold suite test cases
CREATE TABLE public.ai_gold_suite_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL,
  mode text NOT NULL,
  test_id text NOT NULL,
  category text NOT NULL,
  original_message text NOT NULL,
  expected_behavior text,
  must_not_do text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Gold suite runs
CREATE TABLE public.ai_gold_suite_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL,
  mode text NOT NULL,
  prompt_version text,
  prompt_source text,
  run_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Gold suite results
CREATE TABLE public.ai_gold_suite_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.ai_gold_suite_runs(id) ON DELETE CASCADE,
  test_id text NOT NULL,
  category text NOT NULL,
  original_message text NOT NULL,
  primary_rewrite text,
  shorter_version text,
  firmer_version text,
  tone_assessment text,
  risk_flags jsonb DEFAULT '[]'::jsonb,
  why_this_is_safer text,
  original_score integer,
  original_score_notes jsonb,
  rewrite_quality_score integer,
  rewrite_quality_notes jsonb,
  prompt_version text,
  prompt_source text,
  validator_pass boolean,
  validator_notes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: admin-only (no public policies, accessed via service role or disabled RLS for internal use)
ALTER TABLE public.ai_gold_suite_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_gold_suite_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_gold_suite_results ENABLE ROW LEVEL SECURITY;

-- Allow authenticated admins to read/write (we'll check admin role in app code; 
-- for simplicity allow all authenticated since only admins can reach the page)
CREATE POLICY "Authenticated users can read gold suite cases" ON public.ai_gold_suite_cases FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert gold suite cases" ON public.ai_gold_suite_cases FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can read gold suite runs" ON public.ai_gold_suite_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert gold suite runs" ON public.ai_gold_suite_runs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can read gold suite results" ON public.ai_gold_suite_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert gold suite results" ON public.ai_gold_suite_results FOR INSERT TO authenticated WITH CHECK (true);

-- Seed the 6 starter cases
INSERT INTO public.ai_gold_suite_cases (feature_key, mode, test_id, category, original_message, expected_behavior, must_not_do) VALUES
('communication_shield', 'rewrite', 'financial-neutralize', 'Financial Language',
 'You''re making way more money now so you should be paying more for the kids'' activities.',
 'Neutralize financial assertions into inquiry',
 'Must not contain "you should pay", "adjust your contributions", or assert income change'),

('communication_shield', 'rewrite', 'confirmation-preserve', 'Confirmation Preservation',
 'Can you confirm you will pick up Jake from soccer practice at 4pm Thursday at Lincoln Park?',
 'Preserve confirmation language, time, day, and location',
 'Must not remove confirmation request or specific details'),

('communication_shield', 'rewrite', 'emotional-suppress', 'Emotional Suppression',
 'I miss when we were a real family. The kids were happier then.',
 'Minimize/redirect emotional content; keep brief',
 'Must not preserve "I miss" language; must not expand emotional discussion'),

('communication_shield', 'rewrite', 'over-softening', 'Over-softening',
 'You need to stop being late to pick up the kids. This is the third time.',
 'Direct and professional tone without over-softening',
 'Must not contain "I would like to", "I was hoping", "if possible"'),

('communication_shield', 'rewrite', 'clean-passthrough', 'Preservation',
 'Drop-off is at 5pm Friday at Lincoln Elementary.',
 'Preserve as-is with high scores (>=9)',
 'Must not unnecessarily rewrite clean messages'),

('communication_shield', 'rewrite', 'strategic-intent', 'Strategic Intent',
 'I need you to return the car seat, winter jacket, and school backpack by Wednesday at drop-off.',
 'Preserve all specific items and deadline',
 'Must not generalize specific items into vague language');
