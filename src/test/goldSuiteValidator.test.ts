import { describe, it, expect } from "vitest";
import {
  runValidator,
  hasWeLanguage,
  matchesToken,
  normalizeTypos,
  canonicalizeFlag,
  isAcknowledgmentOnly,
  isLogisticsQuestion,
  type RewriteResult,
  type ValidatorRules,
} from "@/lib/goldSuiteValidator";

function makeResult(overrides: Partial<RewriteResult> = {}): RewriteResult {
  return {
    primary_rewrite: "Please confirm the pickup time for tomorrow.",
    shorter_version: "Please confirm pickup time.",
    firmer_version: "Confirm the pickup time for tomorrow.",
    tone_assessment: "Neutral",
    risk_flags: ["Safe message"],
    why_this_is_safer: "Removes emotional language.",
    original_score: 3,
    original_score_notes: ["Contains vague language"],
    rewrite_quality_score: 9,
    rewrite_quality_notes: ["Clear and concise"],
    ...overrides,
  };
}

// ── hasWeLanguage ──

describe("hasWeLanguage", () => {
  it("detects standalone 'we'", () => expect(hasWeLanguage("We should talk")).toBe(true));
  it("does NOT trigger on 'Tuesday'", () => expect(hasWeLanguage("See you Tuesday")).toBe(false));
  it("does NOT trigger on 'because'", () => expect(hasWeLanguage("because it matters")).toBe(false));
  it("detects 'us'", () => expect(hasWeLanguage("between us")).toBe(true));
  it("does NOT trigger on 'useful'", () => expect(hasWeLanguage("That is useful info")).toBe(false));
  it("detects let's", () => expect(hasWeLanguage("Let's discuss")).toBe(true));
  it("detects 'our'", () => expect(hasWeLanguage("our schedule")).toBe(true));
});

// ── matchesToken ──

describe("matchesToken", () => {
  it("matches exact word", () => expect(matchesToken("I am guessin about it", "guessin")).toBe(true));
  it("does NOT match inside longer word", () => expect(matchesToken("I am guessing about it", "guessin")).toBe(false));
  it("matches 'escalate'", () => expect(matchesToken("I will escalate this", "escalate")).toBe(true));
});

// ── normalizeTypos ──

describe("normalizeTypos", () => {
  it("maps common typos", () => expect(normalizeTypos("plz cnfirm tomorw")).toBe("please confirm tomorrow"));
  it("leaves correct words unchanged", () => expect(normalizeTypos("please confirm tomorrow")).toBe("please confirm tomorrow"));
  it("maps 'afta schol'", () => expect(normalizeTypos("afta schol")).toBe("after school"));
});

// ── canonicalizeFlag ──

describe("canonicalizeFlag", () => {
  it("recognizes canonical flags", () => {
    expect(canonicalizeFlag("Safe message")).toBe("Safe message");
    expect(canonicalizeFlag("Admission trap")).toBe("Admission trap");
  });
  it("returns null for 'No risk flags'", () => expect(canonicalizeFlag("No risk flags")).toBeNull());
  it("returns null for unknown", () => expect(canonicalizeFlag("Some random flag")).toBeNull());
});

// ── isAcknowledgmentOnly ──

describe("isAcknowledgmentOnly", () => {
  it("detects 'Received.'", () => expect(isAcknowledgmentOnly("Received.")).toBe(true));
  it("detects 'Noted.'", () => expect(isAcknowledgmentOnly("Noted.")).toBe(true));
  it("detects 'Thanks for letting me know.'", () => expect(isAcknowledgmentOnly("Thanks for letting me know.")).toBe(true));
  it("does NOT flag real rewrite", () => expect(isAcknowledgmentOnly("Please confirm the pickup time for tomorrow.")).toBe(false));
});

// ── isLogisticsQuestion ──

describe("isLogisticsQuestion", () => {
  it("detects question with logistics term", () => expect(isLogisticsQuestion("What time is pickup?")).toBe(true));
  it("does NOT flag non-logistics question", () => expect(isLogisticsQuestion("Are you happy?")).toBe(false));
  it("does NOT flag statement with logistics", () => expect(isLogisticsQuestion("The pickup is at 3pm")).toBe(false));
});

// ── Schema validation ──

describe("schema validation", () => {
  it("passes with valid result", () => {
    const v = runValidator(null, makeResult(), "hi");
    const schemaChecks = v.checks.filter(c => c.rule.startsWith("schema_"));
    expect(schemaChecks.every(c => c.severity === "pass")).toBe(true);
  });
  it("fails on non-Neutral/Firm tone", () => {
    const v = runValidator(null, makeResult({ tone_assessment: "Aggressive" }), "hi");
    expect(v.checks.find(c => c.rule === "schema_tone")?.severity).toBe("fail");
  });
  it("fails on empty risk_flags", () => {
    const v = runValidator(null, makeResult({ risk_flags: [] }), "hi");
    expect(v.checks.find(c => c.rule === "schema_risk_flags")?.severity).toBe("fail");
  });
  it("forces adjustedScore to 1 on schema failure", () => {
    const v = runValidator(null, makeResult({ tone_assessment: "Bad" }), "hi");
    expect(v.adjustedScore).toBe(1);
  });
});

// ── Risk flag taxonomy ──

describe("risk flag taxonomy", () => {
  it("fails on 'No risk flags'", () => {
    const v = runValidator(null, makeResult({ risk_flags: ["No risk flags"] }), "test");
    expect(v.checks.find(c => c.rule === "risk_flags_canonical")?.severity).toBe("fail");
  });
  it("fails on unknown flags", () => {
    const v = runValidator(null, makeResult({ risk_flags: ["Some invented flag"] }), "test");
    expect(v.checks.find(c => c.rule === "risk_flags_canonical")?.severity).toBe("fail");
  });
  it("safe_logistics requires exactly Safe message", () => {
    const v = runValidator(null, makeResult({ risk_flags: ["Safe message", "Emotional language detected"] }), "test", "safe_logistics");
    expect(v.checks.find(c => c.rule === "safe_logistics_flags")?.severity).toBe("fail");
  });
  it("past_fact_trap requires admission flag", () => {
    const v = runValidator(null, makeResult({ risk_flags: ["Safe message"] }), "test", "past_fact_trap");
    expect(v.checks.find(c => c.rule === "past_fact_trap_flags")?.severity).toBe("fail");
  });
  it("past_fact_trap passes with correct flags", () => {
    const v = runValidator(null, makeResult({ risk_flags: ["Admission trap"] }), "test", "past_fact_trap");
    expect(v.checks.find(c => c.rule === "past_fact_trap_flags")?.severity).toBe("pass");
  });
});

// ── Shared framing bans ──

describe("shared framing bans", () => {
  it("fails when primary_rewrite contains 'we'", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "We should discuss pickup." }), "What time?");
    expect(v.checks.find(c => c.rule === "no_shared_framing" && c.reason.includes("primary_rewrite"))?.severity).toBe("fail");
  });
  it("passes clean rewrite", () => {
    const v = runValidator(null, makeResult(), "What time?");
    expect(v.checks.filter(c => c.rule === "no_shared_framing").every(c => c.severity === "pass")).toBe(true);
  });
});

// ── Acknowledgment-only ban ──

describe("acknowledgment-only ban", () => {
  it("fails on 'Received.'", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "Received." }), "I changed the plan");
    expect(v.checks.some(c => c.rule === "no_acknowledgment_only" && c.severity === "fail")).toBe(true);
  });
  it("fails on 'Noted.'", () => {
    const v = runValidator(null, makeResult({ shorter_version: "Noted." }), "test");
    expect(v.checks.some(c => c.rule === "no_acknowledgment_only" && c.severity === "fail")).toBe(true);
  });
  it("passes substantive rewrite", () => {
    const v = runValidator(null, makeResult(), "test");
    expect(v.checks.filter(c => c.rule === "no_acknowledgment_only").every(c => c.severity === "pass")).toBe(true);
  });
});

// ── Escalation bans ──

describe("escalation bans", () => {
  it("fails on 'take action'", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "I will take action if needed." }), "test");
    expect(v.checks.some(c => c.rule === "no_escalation" && c.severity === "fail")).toBe(true);
  });
  it("fails on 'prepared to'", () => {
    const v = runValidator(null, makeResult({ firmer_version: "I am prepared to escalate." }), "test");
    expect(v.checks.some(c => c.rule === "no_escalation" && c.severity === "fail")).toBe(true);
  });
  it("fails on 'prepared to' in financial rewrite", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "I am prepared to discuss the reimbursement." }), "pay your fair share");
    expect(v.checks.some(c => c.rule === "no_escalation" && c.severity === "fail")).toBe(true);
  });
  it("fails on 'documenting'", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "I am documenting everything." }), "test");
    expect(v.checks.some(c => c.rule === "no_escalation" && c.severity === "fail")).toBe(true);
  });
  it("fails on 'pattern'", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "This is a pattern of behavior." }), "test");
    expect(v.checks.some(c => c.rule === "no_escalation" && c.severity === "fail")).toBe(true);
  });
  it("fails on 'address this matter'", () => {
    const v = runValidator(null, makeResult({ shorter_version: "I need to address this matter." }), "test");
    expect(v.checks.some(c => c.rule === "no_escalation" && c.severity === "fail")).toBe(true);
  });
});

// ── Question preservation ──

describe("question preservation", () => {
  it("fails if original is logistics question but rewrite is statement", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "I need the pickup time." }), "What time is pickup tomorrow?");
    expect(v.checks.find(c => c.rule === "question_preserved")?.severity).toBe("fail");
  });
  it("passes if rewrite keeps question mark", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "Can you confirm the pickup time for tomorrow?" }), "What time is pickup tomorrow?");
    expect(v.checks.find(c => c.rule === "question_preserved")?.severity).toBe("pass");
  });
});

// ── Confirm rule (relaxed) ──

describe("confirm rule", () => {
  it("requires 'confirm' when original explicitly says confirm", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "What time is pickup?" }), "Can you cnfirm pickup time?");
    expect(v.checks.find(c => c.rule === "confirmation_preserved")?.severity).toBe("fail");
  });
  it("passes when rewrite includes confirm for explicit confirm original", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "Please confirm the pickup time." }), "Can you confirm pickup time?");
    expect(v.checks.find(c => c.rule === "confirmation_preserved")?.severity).toBe("pass");
  });
  it("passes schedule question with question mark even without 'confirm'", () => {
    // Relaxed: original is schedule question but doesn't say "confirm" — accept question form
    const v = runValidator(null, makeResult({ primary_rewrite: "What time will the child be dropped off tomorrow?" }), "What time is pickup tomorrow?");
    expect(v.checks.find(c => c.rule === "confirmation_preserved")?.severity).toBe("pass");
  });
  it("passes schedule question with 'confirm' verb", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "Can you confirm the drop-off time for tomorrow?" }), "What time is pickup tomorrow?");
    expect(v.checks.find(c => c.rule === "confirmation_preserved")?.severity).toBe("pass");
  });
  it("fails schedule question when rewrite is neither question nor uses confirm", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "I need the pickup time." }), "What time is pickup tomorrow?");
    expect(v.checks.find(c => c.rule === "confirmation_preserved")?.severity).toBe("fail");
  });
});

// ── Admission trap ──

describe("admission trap", () => {
  it("fails when rewrite references disputed past", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "Can you clarify what happened last weekend?" }), "Are you admitting you changed the plan?");
    expect(v.checks.some(c => c.rule === "no_admission_trap" && c.severity === "fail")).toBe(true);
  });
  it("fails on 'acknowledge that you'", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "Please acknowledge that you changed the plan." }), "Are you admitting you changed the schedule?");
    expect(v.checks.some(c => c.rule === "no_admission_trap" && c.severity === "fail")).toBe(true);
  });
  it("passes when rewrite asks for future confirmation", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "Please confirm the pickup time for tomorrow." }), "Are you saying you won't be there?");
    const trapChecks = v.checks.filter(c => c.rule === "no_admission_trap");
    expect(trapChecks.every(c => c.severity === "pass")).toBe(true);
  });
});

// ── Emotional boundary rewrites (fixed contradiction) ──

describe("emotional boundary rewrites", () => {
  it("passes neutral boundary with abstract scope words like 'schedule'", () => {
    const v = runValidator(null, makeResult({
      primary_rewrite: "Please send schedule and child-related updates only.",
      shorter_version: "Please send child-related updates only.",
      firmer_version: "Messages should focus on child logistics.",
      risk_flags: ["Emotional language detected"],
    }), "You are a terrible person.", "emotional_irrelevant");
    // Should NOT fail for topic:schedule or topic shift
    expect(v.checks.filter(c => c.rule === "no_new_facts").every(c => c.severity === "pass")).toBe(true);
    expect(v.checks.filter(c => c.rule === "no_topic_shift").every(c => c.severity !== "fail")).toBe(true);
    expect(v.status === "pass" || v.status === "warn").toBe(true);
  });
  it("passes 'Please keep messages focused on the child and logistics.'", () => {
    const v = runValidator(null, makeResult({
      primary_rewrite: "Please keep messages focused on the child and logistics.",
      shorter_version: "Child-related updates only, please.",
      firmer_version: "Keep messages about the child only.",
      risk_flags: ["Irrelevant or non-child-related topic"],
    }), "I hate you so much.", "emotional_irrelevant");
    expect(v.status === "pass" || v.status === "warn").toBe(true);
  });
  it("fails acknowledgment-only in emotional_irrelevant", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "Ok.", risk_flags: ["Emotional language detected"] }), "You're the worst parent ever", "emotional_irrelevant");
    expect(v.checks.some(c => c.rule === "emotional_irrelevant_substance" && c.severity === "fail")).toBe(true);
  });
});

// ── No new facts (narrowed) ──

describe("no new facts", () => {
  it("does NOT flag corrected typos as new facts", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "Please confirm tomorrow after school." }), "plz cnfirm tomorw afta schol");
    expect(v.checks.find(c => c.rule === "no_new_facts")?.severity).toBe("pass");
  });
  it("flags genuinely new dates", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "Pickup is at 3:00 pm on 12/15." }), "What time is pickup?");
    expect(v.checks.find(c => c.rule === "no_new_facts")?.severity).toBe("fail");
  });
  it("does NOT flag abstract boundary word 'schedule' as new fact", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "Please keep messages about the schedule and child." }), "You never listen to me.");
    expect(v.checks.find(c => c.rule === "no_new_facts")?.severity).toBe("pass");
  });
  it("flags genuinely new dollar amounts", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "Please send $150 for the school supplies." }), "Send money for school supplies.");
    expect(v.checks.find(c => c.rule === "no_new_facts")?.severity).toBe("fail");
  });
});

// ── Topic shift ──

describe("context-aware topic-shift", () => {
  it("does NOT flag 'schedule' as topic shift (removed from invented topics)", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "Please keep the schedule in mind." }), "You are a terrible person.");
    expect(v.checks.filter(c => c.rule === "no_topic_shift").every(c => c.severity !== "fail")).toBe(true);
  });
  it("still flags 'communication arrangements' as topic shift", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "I would like to discuss communication arrangements." }), "You are a terrible person.");
    expect(v.checks.some(c => c.rule === "no_topic_shift" && c.severity === "fail")).toBe(true);
  });
  it("passes if original already mentions schedule", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "Please confirm the schedule for tomorrow." }), "You changed the schedule again.");
    expect(v.checks.filter(c => c.rule === "no_topic_shift").every(c => c.severity !== "fail")).toBe(true);
  });
});

// ── Financial bans ──

describe("financial assumption bans", () => {
  it("warns on primary_rewrite financial language (soft)", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "Since you are making more money, you should pay more." }), "Since you're making more money, pay your fair share.");
    const check = v.checks.find(c => c.rule === "no_financial_assumptions" && c.reason.includes("primary_rewrite"));
    expect(check?.severity).toBe("warn");
  });
  it("hard fails on shorter_version financial language", () => {
    const v = runValidator(null, makeResult({ shorter_version: "It's only fair you cover more." }), "Since you're making more money, pay your fair share.");
    const check = v.checks.find(c => c.rule === "no_financial_assumptions" && c.reason.includes("shorter_version"));
    expect(check?.severity).toBe("fail");
  });
});

// ── Length controls ──

describe("length controls", () => {
  it("passes when rewrite is same length", () => {
    const orig = "What time is the pickup tomorrow afternoon please";
    const v = runValidator(null, makeResult({ primary_rewrite: orig }), orig);
    expect(v.checks.find(c => c.rule === "word_length")?.severity).toBe("pass");
  });
  it("hard fails at 1.75x", () => {
    const orig = "What time?";
    const v = runValidator(null, makeResult({ primary_rewrite: "Please confirm what time is the scheduled pickup for tomorrow afternoon." }), orig);
    expect(v.checks.find(c => c.rule === "word_length")?.severity).toBe("fail");
  });
});

// ── Child-as-messenger ──

describe("child-as-messenger ban", () => {
  it("fails on 'tell your mom'", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "Tell your mom I said no." }), "test");
    expect(v.checks.some(c => c.rule === "no_child_messenger" && c.severity === "fail")).toBe(true);
  });
  it("passes clean rewrite", () => {
    const v = runValidator(null, makeResult(), "test");
    expect(v.checks.filter(c => c.rule === "no_child_messenger").every(c => c.severity === "pass")).toBe(true);
  });
});

// ── Scoring ──

describe("scoring logic", () => {
  it("starts at 10 for clean result", () => {
    const v = runValidator(null, makeResult(), "Please confirm the pickup time for tomorrow.");
    expect(v.adjustedScore).toBe(10);
  });
  it("caps at 4 on hard fail", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "We should discuss." }), "test");
    expect(v.adjustedScore!).toBeLessThanOrEqual(4);
  });
  it("penalizes blame language", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "You always do this." }), "test message here");
    expect(v.adjustedScore!).toBeLessThanOrEqual(7);
  });
  it("forces 1 on schema failure", () => {
    const v = runValidator(null, makeResult({ original_score: 0 }), "test");
    expect(v.adjustedScore).toBe(1);
  });
});

// ── Notes noise reduction ──

describe("notes output", () => {
  it("returns only summary line when all checks pass", () => {
    const v = runValidator(null, makeResult(), "Please confirm the pickup time for tomorrow.");
    expect(v.notes).toHaveLength(1);
    expect(v.notes[0]).toBe("✓ All validation checks passed");
  });
  it("returns only failed/warned checks when failures exist", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "Received." }), "hi");
    expect(v.notes.length).toBeGreaterThan(0);
    expect(v.notes.every(n => n.startsWith("✗") || n.startsWith("⚠"))).toBe(true);
  });
});

// ── Pass/fail decision ──

describe("pass/fail decision", () => {
  it("passes fully compliant result", () => {
    const v = runValidator(null, makeResult(), "Please confirm the pickup time for tomorrow.");
    expect(v.status).toBe("pass");
  });
  it("fails on any hard fail", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "Received." }), "hi");
    expect(v.status).toBe("fail");
  });
  it("fails on empty score notes", () => {
    const v = runValidator(null, makeResult({ original_score_notes: [] }), "test");
    expect(v.status).toBe("fail");
  });
  it("fails on 'prepared to' across all categories", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "I am prepared to handle the expenses." }), "test");
    expect(v.status).toBe("fail");
  });
});

// ── Per-test rules ──

describe("per-test validator_rules", () => {
  it("banned_tokens uses word boundaries", () => {
    const rules: ValidatorRules = { banned_tokens: ["guessin"] };
    const v1 = runValidator(rules, makeResult({ primary_rewrite: "I am guessing about it." }), "test");
    expect(v1.checks.filter(c => c.rule === "banned_token").every(c => c.severity === "pass")).toBe(true);
    const v2 = runValidator(rules, makeResult({ primary_rewrite: "I am guessin about it." }), "test");
    expect(v2.checks.some(c => c.rule === "banned_token" && c.severity === "fail")).toBe(true);
  });
  it("required_risk_flags_any_of works", () => {
    const rules: ValidatorRules = { required_risk_flags_any_of: [["Escalation language detected"]] };
    const v = runValidator(rules, makeResult({ risk_flags: ["Safe message"] }), "test");
    expect(v.checks.find(c => c.rule === "required_risk_flags")?.severity).toBe("fail");
  });
});
