-- Seed metadata for active Communication Shield prompts

-- respond / generate (active)
UPDATE public.ai_system_prompts SET
  prompt_name = 'Respond Generator',
  prompt_purpose = 'Generate safe response suggestions when user receives a message from the other parent',
  output_schema_key = 'communication_shield_respond_v1'
WHERE id = '47ec7228-350b-4f5f-929b-2bf736e6c462';

-- respond / generate (legacy, inactive)
UPDATE public.ai_system_prompts SET
  prompt_name = 'Respond Generator (Legacy)',
  prompt_purpose = 'Original respond mode prompt — superseded by staged version',
  output_schema_key = 'communication_shield_respond_v1',
  deprecated_at = now()
WHERE id = '163e18c1-dbfd-4cbb-8176-0ebfe3af97e8';

-- rewrite / triage (active)
UPDATE public.ai_system_prompts SET
  prompt_name = 'Rewrite Triage Classifier',
  prompt_purpose = 'Classify pasted draft as safe, salvageable, or redirect. Detect intent, tone, and risk flags.',
  output_schema_key = 'communication_shield_triage_v1'
WHERE id = '04829c4c-713c-4b68-97cf-d3b782bdbb9f';

-- rewrite / generate (active v7)
UPDATE public.ai_system_prompts SET
  prompt_name = 'Rewrite Generator',
  prompt_purpose = 'Generate rewrite outputs (primary, shorter, firmer) for safe or salvageable messages using triage context and selected goal',
  output_schema_key = 'communication_shield_rewrite_v1'
WHERE id = 'ef0e3e7f-7e76-4865-83d7-f750c2bd7eab';

-- rewrite / redirect (active)
UPDATE public.ai_system_prompts SET
  prompt_name = 'Rewrite Redirect Handler',
  prompt_purpose = 'Handle messages that should not be sent. Provide redirect explanation, safe alternative, and optional alternatives.',
  output_schema_key = 'communication_shield_redirect_v1'
WHERE id = '0634fdbc-6175-463b-bbc9-e72df8fe22af';

-- rewrite / score (active)
UPDATE public.ai_system_prompts SET
  prompt_name = 'Rewrite Scorer',
  prompt_purpose = 'Evaluate staged rewrite output against DUF scoring dimensions: admission risk, escalation safety, actionability, focus discipline, court-safe phrasing',
  output_schema_key = 'communication_shield_score_v1'
WHERE id = '159513e9-07bf-4945-b464-31ad28eeb16d';

-- Deprecate old rewrite/generate versions (v1-v6)
UPDATE public.ai_system_prompts SET
  deprecated_at = now(),
  prompt_name = COALESCE(prompt_name, 'Rewrite Generator (Legacy ' || version_label || ')'),
  prompt_purpose = COALESCE(prompt_purpose, 'Superseded rewrite generator version'),
  output_schema_key = COALESCE(output_schema_key, 'communication_shield_rewrite_v1')
WHERE feature_key = 'communication_shield'
  AND mode = 'rewrite'
  AND stage_key = 'generate'
  AND is_active = false
  AND deprecated_at IS NULL;