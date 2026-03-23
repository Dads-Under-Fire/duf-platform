-- PART 1: Delete all legacy/deprecated Communication Shield prompt rows
-- Keep only the 5 active production prompts
DELETE FROM ai_system_prompts 
WHERE feature_key = 'communication_shield' 
AND is_active = false;
