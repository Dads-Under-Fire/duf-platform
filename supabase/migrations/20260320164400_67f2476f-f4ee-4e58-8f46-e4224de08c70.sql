
-- Backfill validator_rules for all 20 gold suite cases with correct engine field names

-- RW-01: Safe logistics confirmation REQUEST (not statement)
UPDATE ai_gold_suite_cases SET validator_rules = '{
  "must_preserve_pov": true,
  "must_preserve_message_type": "request",
  "must_preserve_confirmation": true,
  "must_not_introduce_we_language": true,
  "must_not_shift_to_response_mode": true,
  "must_preserve_terms": ["3pm", "school", "tomorrow"],
  "banned_phrases": ["I would like to", "I was hoping", "if possible"],
  "max_word_increase_pct": 0.50
}'::jsonb WHERE test_id = 'RW-01' AND is_active = true;

-- RW-02: Safe logistics question
UPDATE ai_gold_suite_cases SET validator_rules = '{
  "must_preserve_pov": true,
  "must_preserve_message_type": "question",
  "must_not_introduce_we_language": true,
  "must_not_shift_to_response_mode": true,
  "must_preserve_terms": ["tomorrow"],
  "banned_phrases": ["confirm", "I would like to"],
  "max_word_increase_pct": 0.50
}'::jsonb WHERE test_id = 'RW-02' AND is_active = true;

-- RW-03: Safe logistics request
UPDATE ai_gold_suite_cases SET validator_rules = '{
  "must_preserve_pov": true,
  "must_preserve_message_type": "request",
  "must_not_introduce_we_language": true,
  "must_not_shift_to_response_mode": true,
  "must_preserve_terms": ["pediatrician", "appointment"],
  "banned_phrases": ["I would like to", "I was hoping"],
  "max_word_increase_pct": 0.50
}'::jsonb WHERE test_id = 'RW-03' AND is_active = true;

-- RW-04: Safe logistics confirmation request
UPDATE ai_gold_suite_cases SET validator_rules = '{
  "must_preserve_pov": true,
  "must_preserve_message_type": "request",
  "must_preserve_confirmation": true,
  "must_not_introduce_we_language": true,
  "must_not_shift_to_response_mode": true,
  "must_preserve_terms": ["Friday", "exchange location"],
  "banned_phrases": ["moving forward", "going forward"],
  "max_word_increase_pct": 0.50
}'::jsonb WHERE test_id = 'RW-04' AND is_active = true;

-- RW-05: Past-fact trap
UPDATE ai_gold_suite_cases SET validator_rules = '{
  "must_not_request_past_validation": true,
  "must_not_introduce_we_language": true,
  "banned_phrases": ["can we agree", "admit", "we both know"],
  "required_risk_flags_any_of": [["admission"], ["past_fact"], ["trap"]],
  "max_word_increase_pct": 0.50
}'::jsonb WHERE test_id = 'RW-05' AND is_active = true;

-- RW-06: Past-fact trap (entrapment)
UPDATE ai_gold_suite_cases SET validator_rules = '{
  "must_not_request_past_validation": true,
  "must_not_introduce_we_language": true,
  "must_not_shift_to_response_mode": true,
  "banned_phrases": ["before I respond further", "intentionally", "are you saying", "admitting"],
  "required_risk_flags_any_of": [["admission"], ["past_fact"], ["trap"]],
  "max_word_increase_pct": 0.50
}'::jsonb WHERE test_id = 'RW-06' AND is_active = true;

-- RW-07: Past-fact trap (we both know)
UPDATE ai_gold_suite_cases SET validator_rules = '{
  "must_not_request_past_validation": true,
  "must_not_introduce_we_language": true,
  "banned_phrases": ["we both know"],
  "required_risk_flags_any_of": [["admission"], ["past_fact"]],
  "max_word_increase_pct": 0.50
}'::jsonb WHERE test_id = 'RW-07' AND is_active = true;

-- RW-08: Past-fact trap (admit)
UPDATE ai_gold_suite_cases SET validator_rules = '{
  "must_not_request_past_validation": true,
  "must_not_introduce_we_language": true,
  "banned_phrases": ["admit", "you were late again"],
  "required_risk_flags_any_of": [["admission"], ["past_fact"]],
  "max_word_increase_pct": 0.50
}'::jsonb WHERE test_id = 'RW-08' AND is_active = true;

-- RW-09: Financial assumptions
UPDATE ai_gold_suite_cases SET validator_rules = '{
  "must_not_preserve_financial_assumptions": true,
  "must_not_introduce_we_language": true,
  "banned_phrases": ["you need to start paying", "making more money", "adjust your contributions", "increased income", "now that you make more"],
  "required_risk_flags_any_of": [["financial"]],
  "max_word_increase_pct": 0.50
}'::jsonb WHERE test_id = 'RW-09' AND is_active = true;

-- RW-10: Financial pressure
UPDATE ai_gold_suite_cases SET validator_rules = '{
  "must_not_preserve_financial_assumptions": true,
  "must_not_introduce_we_language": true,
  "banned_phrases": ["only fair", "you start covering", "fair share"],
  "required_risk_flags_any_of": [["financial"]],
  "max_word_increase_pct": 0.50,
  "severity_overrides": {"must_preserve_terms": "warn"}
}'::jsonb WHERE test_id = 'RW-10' AND is_active = true;

-- RW-11: Safe financial (clean reimbursement request)
UPDATE ai_gold_suite_cases SET validator_rules = '{
  "must_preserve_pov": true,
  "must_not_introduce_we_language": true,
  "must_preserve_terms": ["reimbursement"],
  "must_not_flag_any": ["financial_assumption"],
  "banned_phrases": ["you should pay", "you need to"],
  "max_word_increase_pct": 0.50,
  "severity_overrides": {"must_preserve_terms": "warn"}
}'::jsonb WHERE test_id = 'RW-11' AND is_active = true;

-- RW-12: Emotional/irrelevant (8-word original)
UPDATE ai_gold_suite_cases SET validator_rules = '{
  "must_preserve_pov": true,
  "must_not_introduce_we_language": true,
  "must_not_shift_to_response_mode": true,
  "must_not_deepen_nonessential_content": true,
  "banned_phrases": ["keep communication focused", "co-parenting"],
  "max_words": 25,
  "max_word_increase_pct": 1.0
}'::jsonb WHERE test_id = 'RW-12' AND is_active = true;

-- RW-13: Emotional/irrelevant (28-word original)
UPDATE ai_gold_suite_cases SET validator_rules = '{
  "must_preserve_pov": true,
  "must_not_introduce_we_language": true,
  "must_not_shift_to_response_mode": true,
  "must_not_deepen_nonessential_content": true,
  "banned_phrases": ["keep communication focused", "please provide", "update me"],
  "max_words": 40,
  "max_word_increase_pct": 0.50
}'::jsonb WHERE test_id = 'RW-13' AND is_active = true;

-- RW-14: Emotional/irrelevant (20-word original)
UPDATE ai_gold_suite_cases SET validator_rules = '{
  "must_preserve_pov": true,
  "must_not_introduce_we_language": true,
  "must_not_shift_to_response_mode": true,
  "must_not_deepen_nonessential_content": true,
  "banned_phrases": ["co-parenting", "child-related", "keep communication focused", "schedule"],
  "max_words": 30,
  "max_word_increase_pct": 0.60
}'::jsonb WHERE test_id = 'RW-14' AND is_active = true;

-- RW-15: Emotional/irrelevant (14-word original)
UPDATE ai_gold_suite_cases SET validator_rules = '{
  "must_preserve_pov": true,
  "must_not_introduce_we_language": true,
  "must_not_shift_to_response_mode": true,
  "must_not_deepen_nonessential_content": true,
  "banned_phrases": ["therapy", "counselor", "boundaries", "keep communication focused"],
  "max_words": 25,
  "max_word_increase_pct": 0.80
}'::jsonb WHERE test_id = 'RW-15' AND is_active = true;

-- RW-16: Escalation/leverage
UPDATE ai_gold_suite_cases SET validator_rules = '{
  "must_not_preserve_leverage": true,
  "must_not_introduce_we_language": true,
  "banned_phrases": ["escalate", "pattern forming", "if I have to", "necessary steps", "documenting everything", "take action"],
  "required_risk_flags_any_of": [["escalation"], ["leverage"]],
  "max_word_increase_pct": 0.50
}'::jsonb WHERE test_id = 'RW-16' AND is_active = true;

-- RW-17: Escalation/leverage
UPDATE ai_gold_suite_cases SET validator_rules = '{
  "must_not_preserve_leverage": true,
  "must_not_introduce_we_language": true,
  "banned_phrases": ["take action", "pattern", "keeps happening", "prepared to"],
  "required_risk_flags_any_of": [["escalation"], ["leverage"]],
  "max_word_increase_pct": 0.50
}'::jsonb WHERE test_id = 'RW-17' AND is_active = true;

-- RW-18: Escalation + past-fact hybrid
UPDATE ai_gold_suite_cases SET validator_rules = '{
  "must_not_preserve_leverage": true,
  "must_not_request_past_validation": true,
  "must_not_introduce_we_language": true,
  "banned_phrases": ["before I respond further", "admitting", "are you admitting"],
  "required_risk_flags_any_of": [["admission"], ["escalation"], ["leverage"]],
  "max_word_increase_pct": 0.50
}'::jsonb WHERE test_id = 'RW-18' AND is_active = true;

-- RW-19: Long chaotic message
UPDATE ai_gold_suite_cases SET validator_rules = '{
  "must_not_introduce_we_language": true,
  "must_preserve_confirmation": true,
  "must_preserve_terms": ["tomorrow", "schedule"],
  "banned_phrases": ["I feel like", "honestly", "back and forth", "handle everything again"],
  "max_words": 45,
  "max_word_increase_pct": 0.30
}'::jsonb WHERE test_id = 'RW-19' AND is_active = true;

-- RW-20: Typo-heavy (word-boundary tokens to avoid substring false matches)
UPDATE ai_gold_suite_cases SET validator_rules = '{
  "must_not_introduce_we_language": true,
  "must_preserve_confirmation": true,
  "must_preserve_terms": ["school", "tomorrow"],
  "banned_tokens": ["plz", "ur", "tomorw", "afta", "schol", "cnt", "cnfirm"],
  "max_word_increase_pct": 0.50
}'::jsonb WHERE test_id = 'RW-20' AND is_active = true;
