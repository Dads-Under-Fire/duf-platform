-- ══════════════════════════════════════════════════════════════
-- GOLD SUITE CASES — add expected staged behavior fields
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.ai_gold_suite_cases
  ADD COLUMN IF NOT EXISTS expected_sendability_status text NULL,
  ADD COLUMN IF NOT EXISTS expected_output_path text NULL,
  ADD COLUMN IF NOT EXISTS expected_detected_intent text NULL,
  ADD COLUMN IF NOT EXISTS expected_risk_flags jsonb NULL,
  ADD COLUMN IF NOT EXISTS expected_needs_goal_selection boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS selected_goal_for_test text NULL,
  ADD COLUMN IF NOT EXISTS expected_no_message_recommended boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ai_gold_suite_cases.expected_sendability_status IS 'Expected triage: safe, salvageable, redirect';
COMMENT ON COLUMN public.ai_gold_suite_cases.expected_output_path IS 'Expected routing: rewrite, redirect_choice, no_message';
COMMENT ON COLUMN public.ai_gold_suite_cases.expected_needs_goal_selection IS 'Whether the flow should pause for goal selection';
COMMENT ON COLUMN public.ai_gold_suite_cases.selected_goal_for_test IS 'Goal to inject for test continuation after goal selection';
COMMENT ON COLUMN public.ai_gold_suite_cases.expected_no_message_recommended IS 'Whether the expected final outcome is no_message';

-- ══════════════════════════════════════════════════════════════
-- GOLD SUITE RESULTS — add actual staged outcome fields + validation scores
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.ai_gold_suite_results
  ADD COLUMN IF NOT EXISTS actual_sendability_status text NULL,
  ADD COLUMN IF NOT EXISTS actual_output_path text NULL,
  ADD COLUMN IF NOT EXISTS actual_detected_intent text NULL,
  ADD COLUMN IF NOT EXISTS actual_risk_flags jsonb NULL,
  ADD COLUMN IF NOT EXISTS actual_needs_goal_selection boolean NULL,
  ADD COLUMN IF NOT EXISTS actual_selected_goal text NULL,
  ADD COLUMN IF NOT EXISTS actual_primary_output text NULL,
  ADD COLUMN IF NOT EXISTS actual_redirect_message text NULL,
  ADD COLUMN IF NOT EXISTS actual_no_message_recommended boolean NULL,
  ADD COLUMN IF NOT EXISTS triage_accuracy_score integer NULL,
  ADD COLUMN IF NOT EXISTS routing_accuracy_score integer NULL,
  ADD COLUMN IF NOT EXISTS goal_alignment_score integer NULL,
  ADD COLUMN IF NOT EXISTS escalation_safety_score integer NULL,
  ADD COLUMN IF NOT EXISTS actionability_score integer NULL,
  ADD COLUMN IF NOT EXISTS focus_discipline_score integer NULL,
  ADD COLUMN IF NOT EXISTS court_safe_phrasing_score integer NULL,
  ADD COLUMN IF NOT EXISTS redirect_quality_score integer NULL,
  ADD COLUMN IF NOT EXISTS no_message_quality_score integer NULL;

COMMENT ON COLUMN public.ai_gold_suite_results.actual_sendability_status IS 'Triage result: safe, salvageable, redirect';
COMMENT ON COLUMN public.ai_gold_suite_results.actual_output_path IS 'Routing result: rewrite, redirect_choice, no_message';
COMMENT ON COLUMN public.ai_gold_suite_results.triage_accuracy_score IS 'How well triage matched expected (1-10)';
COMMENT ON COLUMN public.ai_gold_suite_results.routing_accuracy_score IS 'How well routing matched expected (1-10)';

-- ══════════════════════════════════════════════════════════════
-- GOLD SUITE RUNS — add workflow_version for staged tracking
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.ai_gold_suite_runs
  ADD COLUMN IF NOT EXISTS workflow_version text NULL;

-- ══════════════════════════════════════════════════════════════
-- BACKFILL existing cases with expected staged behavior
-- ══════════════════════════════════════════════════════════════

-- RW-01 to RW-04: safe_logistics → safe / rewrite
UPDATE public.ai_gold_suite_cases SET
  expected_sendability_status = 'safe',
  expected_output_path = 'rewrite',
  expected_needs_goal_selection = false,
  expected_no_message_recommended = false
WHERE test_id IN ('RW-01','RW-02','RW-03','RW-04');

-- RW-05 to RW-08: past_fact_trap → salvageable / rewrite (needs goal)
UPDATE public.ai_gold_suite_cases SET
  expected_sendability_status = 'salvageable',
  expected_output_path = 'rewrite',
  expected_needs_goal_selection = true,
  selected_goal_for_test = 'Remove admission risk',
  expected_no_message_recommended = false
WHERE test_id IN ('RW-05','RW-06','RW-07','RW-08');

-- RW-09, RW-10: financial with assumptions → salvageable / rewrite
UPDATE public.ai_gold_suite_cases SET
  expected_sendability_status = 'salvageable',
  expected_output_path = 'rewrite',
  expected_needs_goal_selection = true,
  selected_goal_for_test = 'Make it neutral and court-safe',
  expected_no_message_recommended = false
WHERE test_id IN ('RW-09','RW-10');

-- RW-11: financial already safe → safe / rewrite
UPDATE public.ai_gold_suite_cases SET
  expected_sendability_status = 'safe',
  expected_output_path = 'rewrite',
  expected_needs_goal_selection = false,
  expected_no_message_recommended = false
WHERE test_id = 'RW-11';

-- RW-12: nostalgic question → redirect / no_message
UPDATE public.ai_gold_suite_cases SET
  expected_sendability_status = 'redirect',
  expected_output_path = 'no_message',
  expected_needs_goal_selection = false,
  expected_no_message_recommended = true
WHERE test_id = 'RW-12';

-- RW-13: family gossip / emotional → redirect / no_message
UPDATE public.ai_gold_suite_cases SET
  expected_sendability_status = 'redirect',
  expected_output_path = 'no_message',
  expected_needs_goal_selection = false,
  expected_no_message_recommended = true
WHERE test_id = 'RW-13';

-- RW-14: random personality question → redirect / no_message
UPDATE public.ai_gold_suite_cases SET
  expected_sendability_status = 'redirect',
  expected_output_path = 'no_message',
  expected_needs_goal_selection = false,
  expected_no_message_recommended = true
WHERE test_id = 'RW-14';

-- RW-15: dream about us → redirect / no_message
UPDATE public.ai_gold_suite_cases SET
  expected_sendability_status = 'redirect',
  expected_output_path = 'no_message',
  expected_needs_goal_selection = false,
  expected_no_message_recommended = true
WHERE test_id = 'RW-15';

-- RW-16: documenting + leverage threat → redirect / redirect_choice (buried logistics concern)
UPDATE public.ai_gold_suite_cases SET
  expected_sendability_status = 'redirect',
  expected_output_path = 'redirect_choice',
  expected_needs_goal_selection = true,
  selected_goal_for_test = 'Set a neutral boundary',
  expected_no_message_recommended = false
WHERE test_id = 'RW-16';

-- RW-17: pattern + threat → redirect / redirect_choice
UPDATE public.ai_gold_suite_cases SET
  expected_sendability_status = 'redirect',
  expected_output_path = 'redirect_choice',
  expected_needs_goal_selection = true,
  selected_goal_for_test = 'Set a neutral boundary',
  expected_no_message_recommended = false
WHERE test_id = 'RW-17';

-- RW-18: admission trap + leverage → salvageable / rewrite
UPDATE public.ai_gold_suite_cases SET
  expected_sendability_status = 'salvageable',
  expected_output_path = 'rewrite',
  expected_needs_goal_selection = true,
  selected_goal_for_test = 'Remove admission risk',
  expected_no_message_recommended = false
WHERE test_id = 'RW-18';

-- RW-19: long chaotic but has logistics → salvageable / rewrite
UPDATE public.ai_gold_suite_cases SET
  expected_sendability_status = 'salvageable',
  expected_output_path = 'rewrite',
  expected_needs_goal_selection = true,
  selected_goal_for_test = 'Confirm logistics',
  expected_no_message_recommended = false
WHERE test_id = 'RW-19';

-- RW-20: typo heavy but has logistics → safe or salvageable / rewrite
UPDATE public.ai_gold_suite_cases SET
  expected_sendability_status = 'safe',
  expected_output_path = 'rewrite',
  expected_needs_goal_selection = false,
  expected_no_message_recommended = false
WHERE test_id = 'RW-20';