
-- Backfill validator_rules for all 20 gold suite cases with stricter category-aligned validators

UPDATE ai_gold_suite_cases SET validator_rules = '{"must_not_include_any":["I would like to","I was hoping","if possible"],"must_not_shift_to_response_mode":true,"must_preserve_confirmation_language":true,"must_preserve_pov":true,"must_preserve_specific_terms":["3pm","school","tomorrow"],"must_not_introduce_we_language":true,"should_not_expand_unnecessarily":true}'::jsonb WHERE test_id = 'RW-01';

UPDATE ai_gold_suite_cases SET validator_rules = '{"must_not_include_any":["confirm","I would like to"],"must_not_shift_to_response_mode":true,"must_preserve_pov":true,"must_preserve_question":true,"must_preserve_specific_terms":["tomorrow"],"must_not_introduce_we_language":true,"should_not_expand_unnecessarily":true}'::jsonb WHERE test_id = 'RW-02';

UPDATE ai_gold_suite_cases SET validator_rules = '{"must_not_include_any":["I would like to","I was hoping"],"must_not_shift_to_response_mode":true,"must_preserve_pov":true,"must_preserve_specific_terms":["pediatrician","appointment"],"must_not_introduce_we_language":true,"should_not_expand_unnecessarily":true}'::jsonb WHERE test_id = 'RW-03';

UPDATE ai_gold_suite_cases SET validator_rules = '{"must_not_include_any":["moving forward","going forward"],"must_not_shift_to_response_mode":true,"must_preserve_confirmation_language":true,"must_preserve_pov":true,"must_preserve_specific_terms":["Friday","exchange","location"],"must_not_introduce_we_language":true,"should_not_expand_unnecessarily":true}'::jsonb WHERE test_id = 'RW-04';

UPDATE ai_gold_suite_cases SET validator_rules = '{"must_flag_any":["admission","past_fact","trap"],"must_not_include_any":["can we agree","admit","we both know"],"must_not_introduce_we_language":true,"must_not_preserve_past_fact_validation":true,"should_not_expand_unnecessarily":true}'::jsonb WHERE test_id = 'RW-05';

UPDATE ai_gold_suite_cases SET validator_rules = '{"must_flag_any":["admission","trap","pressure","entrapment"],"must_not_include_any":["before I respond further","intentionally","are you saying","admitting"],"must_not_shift_to_response_mode":true,"must_not_preserve_past_fact_validation":true,"must_not_introduce_we_language":true,"should_not_expand_unnecessarily":true}'::jsonb WHERE test_id = 'RW-06';

UPDATE ai_gold_suite_cases SET validator_rules = '{"must_flag_any":["admission","past_fact"],"must_not_include_any":["we both know"],"must_not_introduce_we_language":true,"must_not_preserve_past_fact_validation":true,"should_not_expand_unnecessarily":true}'::jsonb WHERE test_id = 'RW-07';

UPDATE ai_gold_suite_cases SET validator_rules = '{"must_flag_any":["admission","demand"],"must_not_include_any":["admit you were late again"],"must_not_preserve_past_fact_validation":true,"must_not_introduce_we_language":true,"should_not_expand_unnecessarily":true}'::jsonb WHERE test_id = 'RW-08';

UPDATE ai_gold_suite_cases SET validator_rules = '{"must_flag_any":["financial"],"must_not_include_any":["you should pay","you need to start paying","making more money","adjust your contributions"],"must_not_preserve_financial_assumptions":true,"must_not_introduce_we_language":true,"should_not_expand_unnecessarily":true}'::jsonb WHERE test_id = 'RW-09';

UPDATE ai_gold_suite_cases SET validator_rules = '{"must_flag_any":["financial","pressure"],"must_not_include_any":["only fair","you start covering","fair share"],"must_not_preserve_financial_assumptions":true,"must_not_introduce_we_language":true,"should_not_expand_unnecessarily":true}'::jsonb WHERE test_id = 'RW-10';

UPDATE ai_gold_suite_cases SET validator_rules = '{"must_not_flag_any":["financial_assumption"],"must_not_include_any":["you should pay","you need to"],"must_preserve_pov":true,"must_preserve_specific_terms":["reimbursement","position"],"must_not_introduce_we_language":true,"should_not_expand_unnecessarily":true}'::jsonb WHERE test_id = 'RW-11';

UPDATE ai_gold_suite_cases SET validator_rules = '{"max_word_count":20,"must_not_include_any":["keep communication focused","co-parenting"],"must_not_shift_to_response_mode":true,"must_preserve_pov":true,"must_not_deepen_nonessential_content":true,"should_not_expand_unnecessarily":true,"must_not_introduce_we_language":true}'::jsonb WHERE test_id = 'RW-12';

UPDATE ai_gold_suite_cases SET validator_rules = '{"max_word_count":30,"must_not_include_any":["keep communication focused","please provide","update me"],"must_not_shift_to_response_mode":true,"must_preserve_pov":true,"must_not_deepen_nonessential_content":true,"should_not_expand_unnecessarily":true,"must_not_introduce_we_language":true}'::jsonb WHERE test_id = 'RW-13';

UPDATE ai_gold_suite_cases SET validator_rules = '{"max_word_count":25,"must_not_include_any":["co-parenting","child-related","keep communication focused","schedule"],"must_not_shift_to_response_mode":true,"must_preserve_pov":true,"must_not_deepen_nonessential_content":true,"should_not_expand_unnecessarily":true,"must_not_introduce_we_language":true}'::jsonb WHERE test_id = 'RW-14';

UPDATE ai_gold_suite_cases SET validator_rules = '{"max_word_count":20,"must_not_include_any":["therapy","counselor","boundaries","keep communication focused"],"must_not_shift_to_response_mode":true,"must_preserve_pov":true,"must_not_deepen_nonessential_content":true,"should_not_expand_unnecessarily":true,"must_not_introduce_we_language":true}'::jsonb WHERE test_id = 'RW-15';

UPDATE ai_gold_suite_cases SET validator_rules = '{"must_flag_any":["escalation","leverage","threat"],"must_not_include_any":["escalate","pattern forming","if I have to","necessary steps","documenting everything","take action"],"must_not_preserve_leverage_language":true,"must_not_introduce_we_language":true,"should_not_expand_unnecessarily":true}'::jsonb WHERE test_id = 'RW-16';

UPDATE ai_gold_suite_cases SET validator_rules = '{"must_flag_any":["escalation","leverage","threat"],"must_not_include_any":["take action","pattern keeps happening","prepared to"],"must_not_preserve_leverage_language":true,"must_not_introduce_we_language":true,"should_not_expand_unnecessarily":true}'::jsonb WHERE test_id = 'RW-17';

UPDATE ai_gold_suite_cases SET validator_rules = '{"must_flag_any":["admission","pressure","leverage"],"must_not_include_any":["before I respond further","admitting","are you admitting"],"must_not_preserve_past_fact_validation":true,"must_not_preserve_leverage_language":true,"must_not_introduce_we_language":true,"should_not_expand_unnecessarily":true}'::jsonb WHERE test_id = 'RW-18';

UPDATE ai_gold_suite_cases SET validator_rules = '{"max_word_count":40,"must_not_include_any":["I feel like","honestly","back and forth","handle everything again"],"must_preserve_confirmation_language":true,"must_preserve_specific_terms":["tomorrow","schedule"],"must_not_introduce_we_language":true,"should_not_expand_unnecessarily":true}'::jsonb WHERE test_id = 'RW-19';

UPDATE ai_gold_suite_cases SET validator_rules = '{"must_not_include_any":["plz","ur","tomorw","afta","schol","guessin","cnt","cnfirm"],"must_preserve_confirmation_language":true,"must_preserve_specific_terms":["school","tomorrow"],"must_not_introduce_we_language":true,"should_not_expand_unnecessarily":true}'::jsonb WHERE test_id = 'RW-20';
