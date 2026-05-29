-- Swap context and summary on seeded dev entries so context is the short title-like label
-- and summary is the longer factual narrative, matching the intended DUF UX model.
UPDATE public.case_log_entries
SET context = summary,
    summary = context
WHERE user_id = '4923cf10-dae4-494d-911f-71d132b8859a'
  AND case_id = '1f055242-8efa-4231-b498-214a5f8dcbe6'
  AND length(context) > length(summary);