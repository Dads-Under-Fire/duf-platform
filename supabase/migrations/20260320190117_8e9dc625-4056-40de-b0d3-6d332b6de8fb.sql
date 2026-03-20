INSERT INTO ai_system_prompts (feature_key, mode, version_label, is_active, prompt_text, notes)
SELECT feature_key, mode, 'v7', false, prompt_text, 'v7: Duplicate of v6 for iteration.'
FROM ai_system_prompts
WHERE id = '48e89fca-ed37-46b9-a1a4-c880ff51cb47';