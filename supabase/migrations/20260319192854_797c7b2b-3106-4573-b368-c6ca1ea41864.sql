UPDATE public.ai_system_prompts
SET prompt_text = REPLACE(
  REPLACE(
    REPLACE(
      REPLACE(
        REPLACE(prompt_text,
          'original_score_deductions', 'original_score_notes'),
        'self_score_deductions', 'rewrite_quality_notes'),
      '"self_score"', '"rewrite_quality_score"'),
    'self_score', 'rewrite_quality_score'),
  'Apply these deductions to rewrite_quality_score_deductions', 'Apply these deductions to rewrite_quality_score'),
  updated_at = now()
WHERE feature_key = 'communication_shield'
  AND mode = 'rewrite'
  AND version_label = 'v2'
  AND is_active = true;