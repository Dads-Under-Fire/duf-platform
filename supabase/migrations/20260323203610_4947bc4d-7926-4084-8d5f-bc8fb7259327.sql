INSERT INTO public.communication_shield_results (
  session_id,
  result_type,
  primary_rewrite,
  primary_response,
  shorter_version,
  firmer_version,
  risk_flags,
  why_this_is_safer,
  generation_index,
  is_selected
)
SELECT
  s.id,
  CASE
    WHEN s.output_path = 'no_message' OR s.session_status = 'no_message_needed' THEN 'no_message'
    WHEN s.mode = 'respond' THEN 'respond_output'
    ELSE 'primary'
  END,
  NULL,
  CASE
    WHEN s.output_path = 'no_message' OR s.session_status = 'no_message_needed'
      THEN COALESCE(NULLIF(TRIM(s.sendability_reason), ''), 'No message recommended.')
    ELSE 'Historical result unavailable due to a prior persistence bug.'
  END,
  NULL,
  NULL,
  '[]'::jsonb,
  CASE
    WHEN s.output_path = 'no_message' OR s.session_status = 'no_message_needed'
      THEN 'Limiting unnecessary communication can help reduce conflict and protect your position.'
    ELSE 'This entry was backfilled to preserve session history after fixing result persistence.'
  END,
  1,
  true
FROM public.communication_shield_sessions s
WHERE s.session_status IN ('completed', 'no_message_needed')
  AND NOT EXISTS (
    SELECT 1
    FROM public.communication_shield_results r
    WHERE r.session_id = s.id
  );