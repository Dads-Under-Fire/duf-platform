
-- Backfill validator_rules for all 20 gold suite cases
-- RW-01: safe_logistics, confirmation request
UPDATE ai_gold_suite_cases SET validator_rules = '{"must_preserve_pov": true, "must_preserve_message_type": "request", "must_preserve_confirmation": true, "must_preserve_terms": ["3pm", "school", "tomorrow"], "must_not_introduce_we_language": true, "must_not_shift_to_response_mode": true, "max_word_increase_pct": 0.3, "required_risk_flags_any_of": [["Safe message"]]}'::jsonb WHERE test_id = 'RW-01' AND feature_key = 'communication_shield';

-- RW-02: safe_logistics, time question
UPDATE ai_gold_suite_cases SET validator_rules = '{"must_preserve_pov": true, "must_preserve_message_type": "question", "must_preserve_terms": ["tomorrow"], "must_not_introduce_we_language": true, "must_not_shift_to_response_mode": true, "max_word_increase_pct": 0.3, "required_risk_flags_any_of": [["Safe message"]]}'::jsonb WHERE test_id = 'RW-02' AND feature_key = 'communication_shield';

-- RW-03: safe_logistics, request for info
UPDATE ai_gold_suite_cases SET validator_rules = '{"must_preserve_pov": true, "must_preserve_message_type": "request", "must_preserve_terms": ["pediatrician", "appointment"], "must_not_introduce_we_language": true, "must_not_shift_to_response_mode": true, "max_word_increase_pct": 0.3, "required_risk_flags_any_of": [["Safe message"]]}'::jsonb WHERE test_id = 'RW-03' AND feature_key = 'communication_shield';

-- RW-04: safe_logistics, confirmation of exchange location
UPDATE ai_gold_suite_cases SET validator_rules = '{"must_preserve_pov": true, "must_preserve_message_type": "request", "must_preserve_confirmation": true, "must_preserve_terms": ["exchange", "Friday"], "must_not_introduce_we_language": true, "must_not_shift_to_response_mode": true, "max_word_increase_pct": 0.3, "required_risk_flags_any_of": [["Safe message"]]}'::jsonb WHERE test_id = 'RW-04' AND feature_key = 'communication_shield';

-- RW-05: past_fact_trap
UPDATE ai_gold_suite_cases SET validator_rules = '{"must_preserve_pov": true, "must_not_request_past_validation": true, "must_not_introduce_we_language": true, "must_not_preserve_leverage": true, "must_not_shift_to_response_mode": true, "banned_phrases": ["before i respond further", "are you saying", "admit"], "max_word_increase_pct": 0.25, "required_risk_flags_any_of": [["Admission trap"], ["Past-fact confirmation risk"], ["admission"], ["past_fact"]]}'::jsonb WHERE test_id = 'RW-05' AND feature_key = 'communication_shield';

-- RW-06: past_fact_trap
UPDATE ai_gold_suite_cases SET validator_rules = '{"must_preserve_pov": true, "must_not_request_past_validation": true, "must_not_introduce_we_language": true, "must_not_preserve_leverage": true, "must_not_shift_to_response_mode": true, "banned_phrases": ["are you saying", "intentionally", "admit"], "max_word_increase_pct": 0.25, "required_risk_flags_any_of": [["Admission trap"], ["Past-fact confirmation risk"], ["admission"], ["past_fact"]]}'::jsonb WHERE test_id = 'RW-06' AND feature_key = 'communication_shield';

-- RW-07: past_fact_trap
UPDATE ai_gold_suite_cases SET validator_rules = '{"must_preserve_pov": true, "must_not_request_past_validation": true, "must_not_introduce_we_language": true, "must_not_preserve_leverage": true, "must_not_shift_to_response_mode": true, "banned_phrases": ["admit", "acknowledge"], "max_word_increase_pct": 0.25, "required_risk_flags_any_of": [["Admission trap"], ["Past-fact confirmation risk"], ["admission"], ["past_fact"]]}'::jsonb WHERE test_id = 'RW-07' AND feature_key = 'communication_shield';

-- RW-08: past_fact_trap
UPDATE ai_gold_suite_cases SET validator_rules = '{"must_preserve_pov": true, "must_not_request_past_validation": true, "must_not_introduce_we_language": true, "must_not_preserve_leverage": true, "must_not_shift_to_response_mode": true, "banned_phrases": ["admit", "late again"], "max_word_increase_pct": 0.25, "required_risk_flags_any_of": [["Admission trap"], ["Past-fact confirmation risk"], ["admission"], ["past_fact"]]}'::jsonb WHERE test_id = 'RW-08' AND feature_key = 'communication_shield';

-- RW-09: financial assumptions
UPDATE ai_gold_suite_cases SET validator_rules = '{"must_preserve_pov": true, "must_not_preserve_financial_assumptions": true, "must_not_introduce_we_language": true, "must_not_preserve_leverage": true, "must_not_shift_to_response_mode": true, "banned_phrases": ["increased income", "making more money", "now that you make more", "you need to start paying", "only fair", "fair share"], "max_word_increase_pct": 0.3, "required_risk_flags_any_of": [["Financial demand or assumption"], ["financial"]]}'::jsonb WHERE test_id = 'RW-09' AND feature_key = 'communication_shield';

-- RW-10: financial - fairness language
UPDATE ai_gold_suite_cases SET validator_rules = '{"must_preserve_pov": true, "must_not_preserve_financial_assumptions": true, "must_not_introduce_we_language": true, "must_not_preserve_leverage": true, "must_not_shift_to_response_mode": true, "banned_phrases": ["only fair", "fair share", "covering more"], "max_word_increase_pct": 0.3, "required_risk_flags_any_of": [["Financial demand or assumption"], ["financial"]]}'::jsonb WHERE test_id = 'RW-10' AND feature_key = 'communication_shield';

-- RW-11: financial - neutral reimbursement
UPDATE ai_gold_suite_cases SET validator_rules = '{"must_preserve_pov": true, "must_preserve_message_type": "request", "must_not_introduce_we_language": true, "must_not_shift_to_response_mode": true, "must_preserve_terms": ["reimbursement"], "max_word_increase_pct": 0.3, "severity_overrides": {"must_preserve_terms": "warn"}}'::jsonb WHERE test_id = 'RW-11' AND feature_key = 'communication_shield';

-- RW-12: emotional_irrelevant
UPDATE ai_gold_suite_cases SET validator_rules = '{"must_preserve_pov": true, "must_not_introduce_we_language": true, "must_not_deepen_nonessential_content": true, "must_not_shift_to_response_mode": true, "max_word_increase_pct": 0.15, "max_words": 25, "required_risk_flags_any_of": [["Irrelevant or non-child-related topic"], ["irrelevant"], ["non-child-related"], ["emotional"]]}'::jsonb WHERE test_id = 'RW-12' AND feature_key = 'communication_shield';

-- RW-13: emotional_irrelevant
UPDATE ai_gold_suite_cases SET validator_rules = '{"must_preserve_pov": true, "must_not_introduce_we_language": true, "must_not_deepen_nonessential_content": true, "must_not_shift_to_response_mode": true, "max_word_increase_pct": 0.20, "max_words": 35, "required_risk_flags_any_of": [["Irrelevant or non-child-related topic"], ["irrelevant"], ["non-child-related"], ["emotional"]]}'::jsonb WHERE test_id = 'RW-13' AND feature_key = 'communication_shield';

-- RW-14: emotional_irrelevant
UPDATE ai_gold_suite_cases SET validator_rules = '{"must_preserve_pov": true, "must_not_introduce_we_language": true, "must_not_deepen_nonessential_content": true, "must_not_shift_to_response_mode": true, "max_word_increase_pct": 0.20, "max_words": 35, "required_risk_flags_any_of": [["Irrelevant or non-child-related topic"], ["irrelevant"], ["non-child-related"], ["emotional"]]}'::jsonb WHERE test_id = 'RW-14' AND feature_key = 'communication_shield';

-- RW-15: emotional_irrelevant
UPDATE ai_gold_suite_cases SET validator_rules = '{"must_preserve_pov": true, "must_not_introduce_we_language": true, "must_not_deepen_nonessential_content": true, "must_not_shift_to_response_mode": true, "max_word_increase_pct": 0.15, "max_words": 25, "required_risk_flags_any_of": [["Irrelevant or non-child-related topic"], ["irrelevant"], ["non-child-related"], ["emotional"]]}'::jsonb WHERE test_id = 'RW-15' AND feature_key = 'communication_shield';

-- RW-16: escalation_leverage
UPDATE ai_gold_suite_cases SET validator_rules = '{"must_preserve_pov": true, "must_not_preserve_leverage": true, "must_not_introduce_we_language": true, "must_not_shift_to_response_mode": true, "banned_tokens": ["escalate", "escalation", "documenting", "documented", "consequences"], "banned_phrases": ["recurring pattern", "take action", "necessary steps", "ongoing issues", "ongoing concerns"], "max_word_increase_pct": 0.25, "required_risk_flags_any_of": [["Escalation language detected"], ["escalation"], ["leverage"]]}'::jsonb WHERE test_id = 'RW-16' AND feature_key = 'communication_shield';

-- RW-17: escalation_leverage
UPDATE ai_gold_suite_cases SET validator_rules = '{"must_preserve_pov": true, "must_not_preserve_leverage": true, "must_not_introduce_we_language": true, "must_not_shift_to_response_mode": true, "banned_tokens": ["escalate", "escalation", "consequences"], "banned_phrases": ["recurring pattern", "recurring issue", "take action", "prepared to", "if necessary", "necessary steps", "address this matter"], "max_word_increase_pct": 0.25, "required_risk_flags_any_of": [["Escalation language detected"], ["escalation"], ["leverage"]]}'::jsonb WHERE test_id = 'RW-17' AND feature_key = 'communication_shield';

-- RW-18: escalation_leverage + past fact trap combo
UPDATE ai_gold_suite_cases SET validator_rules = '{"must_preserve_pov": true, "must_not_preserve_leverage": true, "must_not_request_past_validation": true, "must_not_introduce_we_language": true, "must_not_shift_to_response_mode": true, "banned_phrases": ["before i respond further", "are you admitting", "changed the plan"], "banned_tokens": ["escalate", "escalation"], "max_word_increase_pct": 0.25, "required_risk_flags_any_of": [["Escalation language detected"], ["Admission trap"], ["escalation"], ["admission"], ["past_fact"]]}'::jsonb WHERE test_id = 'RW-18' AND feature_key = 'communication_shield';

-- RW-19: long_chaotic - should be shortened
UPDATE ai_gold_suite_cases SET validator_rules = '{"must_preserve_pov": true, "must_not_introduce_we_language": true, "must_not_preserve_leverage": true, "must_not_shift_to_response_mode": true, "max_word_increase_pct": 0.0}'::jsonb WHERE test_id = 'RW-19' AND feature_key = 'communication_shield';

-- RW-20: typo_heavy - confirm intent preserved
UPDATE ai_gold_suite_cases SET validator_rules = '{"must_preserve_pov": true, "must_preserve_message_type": "request", "must_preserve_confirmation": true, "must_not_introduce_we_language": true, "must_not_shift_to_response_mode": true, "banned_tokens": ["plz", "cnfirm", "ur", "tomorw", "afta", "schol", "cnt", "guessin"], "max_word_increase_pct": 0.3}'::jsonb WHERE test_id = 'RW-20' AND feature_key = 'communication_shield';
