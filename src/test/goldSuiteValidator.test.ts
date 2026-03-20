import { describe, it, expect } from "vitest";
import {
  runValidator,
  hasWeLanguage,
  matchesToken,
  normalizeTypos,
  canonicalizeFlag,
  type RewriteResult,
  type ValidatorRules,
} from "@/lib/goldSuiteValidator";

// Helper to build a minimal valid result
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
  it("detects standalone 'we'", () => {
    expect(hasWeLanguage("We should talk")).toBe(true);
  });
  it("does NOT trigger on 'Tuesday'", () => {
    expect(hasWeLanguage("See you Tuesday")).toBe(false);
  });
  it("does NOT trigger on 'because'", () => {
    expect(hasWeLanguage("because it matters")).toBe(false);
  });
  it("detects 'us'", () => {
    expect(hasWeLanguage("between us")).toBe(true);
  });
  it("does NOT trigger on 'useful'", () => {
    expect(hasWeLanguage("That is useful info")).toBe(false);
  });
  it("detects let's", () => {
    expect(hasWeLanguage("Let's discuss")).toBe(true);
  });
  it("detects 'our'", () => {
    expect(hasWeLanguage("our schedule")).toBe(true);
  });
});

// ── matchesToken ──

describe("matchesToken", () => {
  it("matches exact word", () => {
    expect(matchesToken("I am guessin about it", "guessin")).toBe(true);
  });
  it("does NOT match 'guessin' inside 'guessing'", () => {
    expect(matchesToken("I am guessing about it", "guessin")).toBe(false);
  });
  it("matches 'escalate'", () => {
    expect(matchesToken("I will escalate this", "escalate")).toBe(true);
  });
});

// ── normalizeTypos ──

describe("normalizeTypos", () => {
  it("maps common typos", () => {
    expect(normalizeTypos("plz cnfirm tomorw")).toBe("please confirm tomorrow");
  });
  it("leaves correct words unchanged", () => {
    expect(normalizeTypos("please confirm tomorrow")).toBe("please confirm tomorrow");
  });
  it("maps 'afta schol'", () => {
    expect(normalizeTypos("afta schol")).toBe("after school");
  });
});

// ── canonicalizeFlag ──

describe("canonicalizeFlag", () => {
  it("recognizes canonical flags", () => {
    expect(canonicalizeFlag("Safe message")).toBe("Safe message");
    expect(canonicalizeFlag("Admission trap")).toBe("Admission trap");
  });
  it("maps synonyms", () => {
    expect(canonicalizeFlag("No risk flags")).toBe("Safe message");
  });
  it("returns null for unknown", () => {
    expect(canonicalizeFlag("Some random flag")).toBeNull();
  });
});

// ── Schema validation (rule 1) ──

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

  it("fails on score out of range", () => {
    const v = runValidator(null, makeResult({ original_score: 0 }), "hi");
    expect(v.checks.find(c => c.rule === "schema_original_score")?.severity).toBe("fail");
  });
});

// ── Shared framing bans (rule 2) ──

describe("shared framing bans", () => {
  it("fails when primary_rewrite contains 'we'", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "We should discuss pickup." }), "What time?");
    expect(v.checks.find(c => c.rule === "no_shared_framing" && c.reason.includes("primary_rewrite"))?.severity).toBe("fail");
  });

  it("passes clean rewrite", () => {
    const v = runValidator(null, makeResult(), "What time?");
    const framingChecks = v.checks.filter(c => c.rule === "no_shared_framing");
    expect(framingChecks.every(c => c.severity === "pass")).toBe(true);
  });
});

// ── Escalation bans (rule 3) ──

describe("escalation bans", () => {
  it("fails on 'take action'", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "I will take action if needed." }), "test");
    expect(v.checks.some(c => c.rule === "no_escalation" && c.severity === "fail")).toBe(true);
  });

  it("fails on 'prepared to'", () => {
    const v = runValidator(null, makeResult({ firmer_version: "I am prepared to escalate." }), "test");
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

// ── Admission trap (rule 4) ──

describe("admission trap", () => {
  it("fails when rewrite asks to admit after original has trap trigger", () => {
    const v = runValidator(null,
      makeResult({ primary_rewrite: "Please acknowledge that you changed the plan." }),
      "Are you admitting you changed the schedule?",
    );
    expect(v.checks.some(c => c.rule === "no_admission_trap" && c.severity === "fail")).toBe(true);
  });

  it("passes when rewrite asks for future confirmation", () => {
    const v = runValidator(null,
      makeResult({ primary_rewrite: "Please confirm the pickup time for tomorrow." }),
      "Are you saying you won't be there?",
    );
    const trapChecks = v.checks.filter(c => c.rule === "no_admission_trap");
    expect(trapChecks.every(c => c.severity === "pass")).toBe(true);
  });
});

// ── past_fact_trap category flags ──

describe("past_fact_trap category", () => {
  it("requires admission/past-fact flags", () => {
    const v = runValidator(null,
      makeResult({ risk_flags: ["Safe message"] }),
      "test", "past_fact_trap",
    );
    expect(v.checks.find(c => c.rule === "past_fact_trap_flags")?.severity).toBe("fail");
  });

  it("passes with correct flags", () => {
    const v = runValidator(null,
      makeResult({ risk_flags: ["Admission trap"] }),
      "test", "past_fact_trap",
    );
    expect(v.checks.find(c => c.rule === "past_fact_trap_flags")?.severity).toBe("pass");
  });
});

// ── Financial bans (rule 5) ──

describe("financial assumption bans", () => {
  it("warns on primary_rewrite financial language (soft)", () => {
    const v = runValidator(null,
      makeResult({ primary_rewrite: "Since you are making more money, you should pay more." }),
      "Since you're making more money, pay your fair share.",
    );
    const check = v.checks.find(c => c.rule === "no_financial_assumptions" && c.reason.includes("primary_rewrite"));
    expect(check?.severity).toBe("warn");
  });

  it("hard fails on shorter_version financial language", () => {
    const v = runValidator(null,
      makeResult({ shorter_version: "It's only fair you cover more." }),
      "Since you're making more money, pay your fair share.",
    );
    const check = v.checks.find(c => c.rule === "no_financial_assumptions" && c.reason.includes("shorter_version"));
    expect(check?.severity).toBe("fail");
  });
});

// ── Confirmation language (rule 6) ──

describe("confirmation language", () => {
  it("fails when original asks to confirm but rewrite lacks 'confirm'", () => {
    const v = runValidator(null,
      makeResult({ primary_rewrite: "What time is pickup?" }),
      "Can you cnfirm pickup time?",
    );
    expect(v.checks.find(c => c.rule === "confirmation_preserved")?.severity).toBe("fail");
  });

  it("passes when rewrite includes confirm", () => {
    const v = runValidator(null,
      makeResult({ primary_rewrite: "Please confirm the pickup time." }),
      "Can you confirm pickup time?",
    );
    expect(v.checks.find(c => c.rule === "confirmation_preserved")?.severity).toBe("pass");
  });

  it("triggers on question mark + schedule word", () => {
    const v = runValidator(null,
      makeResult({ primary_rewrite: "What time is the schedule change?" }),
      "What time is pickup tomorrow?",
    );
    expect(v.checks.find(c => c.rule === "confirmation_preserved")?.severity).toBe("fail");
  });
});

// ── Risk flag taxonomy (rule 7) ──

describe("risk flag taxonomy", () => {
  it("fails on unknown flags", () => {
    const v = runValidator(null,
      makeResult({ risk_flags: ["Some invented flag"] }),
      "test",
    );
    expect(v.checks.find(c => c.rule === "risk_flags_canonical")?.severity).toBe("fail");
  });

  it("safe_logistics requires exactly Safe message", () => {
    const v = runValidator(null,
      makeResult({ risk_flags: ["Safe message", "Emotional language detected"] }),
      "test", "safe_logistics",
    );
    expect(v.checks.find(c => c.rule === "safe_logistics_flags")?.severity).toBe("fail");
  });

  it("safe_logistics passes with only Safe message", () => {
    const v = runValidator(null, makeResult(), "test", "safe_logistics");
    expect(v.checks.find(c => c.rule === "safe_logistics_flags")?.severity).toBe("pass");
  });

  it("emotional_irrelevant requires relevant flag", () => {
    const v = runValidator(null,
      makeResult({ risk_flags: ["Safe message"] }),
      "test", "emotional_irrelevant",
    );
    expect(v.checks.find(c => c.rule === "emotional_irrelevant_flags")?.severity).toBe("fail");
  });
});

// ── Typo normalization / no new facts (rule 8) ──

describe("no new facts with typo normalization", () => {
  it("does NOT flag corrected typos as new facts", () => {
    const v = runValidator(null,
      makeResult({ primary_rewrite: "Please confirm tomorrow after school." }),
      "plz cnfirm tomorw afta schol",
    );
    const check = v.checks.find(c => c.rule === "no_new_facts");
    expect(check?.severity).toBe("pass");
  });

  it("flags genuinely new dates", () => {
    const v = runValidator(null,
      makeResult({ primary_rewrite: "Pickup is at 3:00 pm on 12/15." }),
      "What time is pickup?",
    );
    const check = v.checks.find(c => c.rule === "no_new_facts");
    expect(check?.severity).toBe("fail");
  });
});

// ── Length controls (rule 9) ──

describe("length controls", () => {
  it("passes when rewrite is same length", () => {
    const orig = "What time is the pickup tomorrow afternoon please";
    const v = runValidator(null, makeResult({ primary_rewrite: orig }), orig);
    const check = v.checks.find(c => c.rule === "word_length");
    expect(check?.severity).toBe("pass");
  });

  it("hard fails at 1.75x", () => {
    const orig = "What time?"; // 2 words
    // 1.75 * 2 = 3.5 -> ceil = 4. Need > 4 words = 5+
    const v = runValidator(null,
      makeResult({ primary_rewrite: "Please confirm what time is the scheduled pickup for tomorrow afternoon." }),
      orig,
    );
    const check = v.checks.find(c => c.rule === "word_length");
    expect(check?.severity).toBe("fail");
  });
});

// ── Scoring (rule 10) ──

describe("scoring logic", () => {
  it("starts at 10 for clean result", () => {
    const v = runValidator(null, makeResult(), "What time is pickup?");
    expect(v.adjustedScore).toBe(10);
  });

  it("penalizes blame language", () => {
    const v = runValidator(null,
      makeResult({ primary_rewrite: "You always do this." }),
      "test message here",
    );
    // -3 for blame, and likely other deductions
    expect(v.adjustedScore!).toBeLessThanOrEqual(7);
  });
});

// ── Per-test rules ──

describe("per-test validator_rules", () => {
  it("banned_tokens uses word boundaries", () => {
    const rules: ValidatorRules = { banned_tokens: ["guessin"] };
    // "guessing" should NOT trigger
    const v1 = runValidator(rules, makeResult({ primary_rewrite: "I am guessing about it." }), "test");
    expect(v1.checks.filter(c => c.rule === "banned_token").every(c => c.severity === "pass")).toBe(true);

    // "guessin" should trigger
    const v2 = runValidator(rules, makeResult({ primary_rewrite: "I am guessin about it." }), "test");
    expect(v2.checks.some(c => c.rule === "banned_token" && c.severity === "fail")).toBe(true);
  });

  it("required_risk_flags_any_of works", () => {
    const rules: ValidatorRules = {
      required_risk_flags_any_of: [["Escalation language detected"]],
    };
    const v = runValidator(rules,
      makeResult({ risk_flags: ["Safe message"] }),
      "test",
    );
    expect(v.checks.find(c => c.rule === "required_risk_flags")?.severity).toBe("fail");
  });
});
