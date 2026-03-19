
-- Deactivate current active rewrite prompt
UPDATE public.ai_system_prompts
SET is_active = false
WHERE feature_key = 'communication_shield' AND mode = 'rewrite' AND is_active = true;

-- Duplicate v4 as v5
INSERT INTO public.ai_system_prompts (feature_key, mode, version_label, is_active, prompt_text, notes)
SELECT feature_key, mode, 'v5', true, prompt_text, 'v5 — duplicate of v4'
FROM public.ai_system_prompts
WHERE feature_key = 'communication_shield' AND mode = 'rewrite' AND version_label = 'v4';
