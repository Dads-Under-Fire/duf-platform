import { describe, it, expect } from "vitest";
import {
  runValidator,
  runTriageValidator,
  runStagedValidator,
  hasWeLanguage,
  matchesToken,
  normalizeTypos,
  canonicalizeFlag,
  isAcknowledgmentOnly,
  isLogisticsQuestion,
  type RewriteResult,
  type TriageResult,
  type ValidatorRules,
  type StagedExpectations,
  type StagedOutcome,
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

// ── Legacy schema validation ──

describe("legacy schema validation", () => {
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

// ── Legacy pass/fail ──

describe("legacy pass/fail decision", () => {
  it("passes fully compliant result", () => {
    const v = runValidator(null, makeResult(), "Please confirm the pickup time for tomorrow.");
    expect(v.status).toBe("pass");
  });
  it("fails on any hard fail", () => {
    const v = runValidator(null, makeResult({ primary_rewrite: "Received." }), "hi");
    expect(v.status).toBe("fail");
  });
});

// ── Triage validation ──

function makeTriageResult(overrides: Partial<TriageResult> = {}): TriageResult {
  return {
    sendability_status: "salvageable",
    detected_intent: "schedule coordination",
    detected_tone: "emotional",
    risk_flags: ["Emotional language detected"],
    confidence: 0.85,
    suggested_goals: ["Narrow emotional content", "Confirm logistics"],
    reason: "Message contains emotional language but has logistics intent.",
    ...overrides,
  };
}

describe("triage validation", () => {
  it("passes valid triage result", () => {
    const v = runTriageValidator(makeTriageResult());
    expect(v.status).toBe("pass");
  });

  it("fails on invalid sendability_status", () => {
    const v = runTriageValidator(makeTriageResult({ sendability_status: "unknown" as any }));
    expect(v.checks.find(c => c.rule === "triage_schema_sendability")?.severity).toBe("fail");
  });

  it("fails on non-canonical risk flags", () => {
    const v = runTriageValidator(makeTriageResult({ risk_flags: ["Some random flag"] }));
    expect(v.checks.find(c => c.rule === "triage_risk_flags_canonical")?.severity).toBe("fail");
  });

  it("validates expected sendability", () => {
    const v = runTriageValidator(makeTriageResult({ sendability_status: "redirect" }), "salvageable");
    expect(v.checks.find(c => c.rule === "triage_expected_sendability")?.severity).toBe("fail");
  });

  it("validates output_path for redirect with explicit output_path", () => {
    const v = runTriageValidator(
      makeTriageResult({ sendability_status: "redirect", output_path: "no_message" }),
      undefined, undefined, "no_message"
    );
    expect(v.checks.find(c => c.rule === "triage_expected_output_path")?.severity).toBe("pass");
  });

  it("validates output_path for redirect_choice", () => {
    const v = runTriageValidator(
      makeTriageResult({ sendability_status: "redirect", output_path: "redirect_choice" }),
      undefined, undefined, "redirect_choice"
    );
    expect(v.checks.find(c => c.rule === "triage_expected_output_path")?.severity).toBe("pass");
  });

  it("validates output_path for salvageable → rewrite", () => {
    const v = runTriageValidator(makeTriageResult({ sendability_status: "salvageable" }), undefined, undefined, "rewrite");
    expect(v.checks.find(c => c.rule === "triage_expected_output_path")?.severity).toBe("pass");
  });

  it("validates expected risk flags", () => {
    const v = runTriageValidator(makeTriageResult({ risk_flags: ["Safe message"] }), undefined, undefined, undefined, ["Emotional language detected"]);
    expect(v.checks.find(c => c.rule === "triage_expected_risk_flags")?.severity).toBe("fail");
  });
});

// ══════════════════════════════════════════════════════════════
// STAGED VALIDATOR TESTS
// ══════════════════════════════════════════════════════════════

describe("staged validator — safe → rewrite path", () => {
  it("passes when triage + routing + rewrite all correct", () => {
    const expectations: StagedExpectations = {
      expected_sendability_status: "safe",
      expected_output_path: "rewrite",
      expected_needs_goal_selection: false,
    };
    const outcome: StagedOutcome = {
      actual_sendability_status: "safe",
      actual_output_path: "rewrite",
      actual_needs_goal_selection: false,
      primary_rewrite: "Please confirm the pickup time for tomorrow.",
      shorter_version: "Please confirm pickup time.",
      firmer_version: "Confirm the pickup time for tomorrow.",
      why_this_is_safer: "Removes emotional language.",
    };
    const v = runStagedValidator(expectations, outcome, "What time is pickup tomorrow?");
    expect(v.status).toBe("pass");
    expect(v.triageScore).toBe(10);
    expect(v.routingScore).toBe(10);
    expect(v.outcomeScore).toBeGreaterThanOrEqual(8);
  });

  it("fails when sendability mismatch", () => {
    const expectations: StagedExpectations = {
      expected_sendability_status: "safe",
      expected_output_path: "rewrite",
    };
    const outcome: StagedOutcome = {
      actual_sendability_status: "salvageable",
      actual_output_path: "rewrite",
      primary_rewrite: "Please confirm pickup.",
      shorter_version: "Confirm pickup.",
      firmer_version: "Confirm pickup time.",
    };
    const v = runStagedValidator(expectations, outcome);
    expect(v.checks.find(c => c.rule === "staged_sendability_match")?.severity).toBe("fail");
    expect(v.triageScore).toBeLessThan(10);
  });
});

describe("staged validator — salvageable → goal selection → rewrite", () => {
  it("passes when goal selection is correctly required then rewrite generated", () => {
    const expectations: StagedExpectations = {
      expected_sendability_status: "salvageable",
      expected_output_path: "rewrite",
      expected_needs_goal_selection: true,
    };
    // After goal selection, rewrite was generated
    const outcome: StagedOutcome = {
      actual_sendability_status: "salvageable",
      actual_output_path: "rewrite",
      actual_needs_goal_selection: true,
      actual_selected_goal: "Remove admission risk",
      primary_rewrite: "Please confirm the schedule for this Friday.",
      shorter_version: "Confirm Friday schedule.",
      firmer_version: "Confirm the schedule for Friday.",
      why_this_is_safer: "Removes admission trap language.",
    };
    const v = runStagedValidator(expectations, outcome, "Can we agree last Friday didn't follow the schedule?", "past_fact_trap");
    expect(v.status).toBe("pass");
    expect(v.triageScore).toBe(10);
    expect(v.routingScore).toBe(10);
  });

  it("fails when goal selection not required but expected", () => {
    const expectations: StagedExpectations = {
      expected_sendability_status: "salvageable",
      expected_output_path: "rewrite",
      expected_needs_goal_selection: true,
    };
    const outcome: StagedOutcome = {
      actual_sendability_status: "salvageable",
      actual_output_path: "rewrite",
      actual_needs_goal_selection: false,
      primary_rewrite: "Please confirm the schedule.",
      shorter_version: "Confirm schedule.",
      firmer_version: "Confirm the schedule.",
    };
    const v = runStagedValidator(expectations, outcome);
    expect(v.checks.find(c => c.rule === "staged_goal_selection_match")?.severity).toBe("fail");
  });
});

describe("staged validator — redirect → redirect_choice", () => {
  it("passes when correctly classified as redirect_choice", () => {
    const expectations: StagedExpectations = {
      expected_sendability_status: "redirect",
      expected_output_path: "redirect_choice",
      expected_needs_goal_selection: true,
      expected_no_message_recommended: false,
    };
    const outcome: StagedOutcome = {
      actual_sendability_status: "redirect",
      actual_output_path: "redirect_choice",
      actual_needs_goal_selection: true,
      actual_no_message_recommended: false,
    };
    const v = runStagedValidator(expectations, outcome, "I've been documenting everything and I will escalate if I have to.");
    expect(v.status).toBe("pass");
    expect(v.routingScore).toBe(10);
  });

  it("fails when redirect_choice has premature rewrite", () => {
    const expectations: StagedExpectations = {
      expected_sendability_status: "redirect",
      expected_output_path: "redirect_choice",
      expected_needs_goal_selection: true,
    };
    const outcome: StagedOutcome = {
      actual_sendability_status: "redirect",
      actual_output_path: "redirect_choice",
      actual_needs_goal_selection: true,
      primary_rewrite: "Some premature rewrite text that should not exist yet.",
    };
    const v = runStagedValidator(expectations, outcome);
    expect(v.checks.find(c => c.rule === "redirect_choice_no_premature_output")?.severity).toBe("fail");
  });

  it("fails when wrong output_path (no_message instead of redirect_choice)", () => {
    const expectations: StagedExpectations = {
      expected_sendability_status: "redirect",
      expected_output_path: "redirect_choice",
    };
    const outcome: StagedOutcome = {
      actual_sendability_status: "redirect",
      actual_output_path: "no_message",
      actual_no_message_recommended: true,
    };
    const v = runStagedValidator(expectations, outcome);
    expect(v.checks.find(c => c.rule === "staged_output_path_match")?.severity).toBe("fail");
  });
});

describe("staged validator — redirect → no_message", () => {
  it("passes when correctly classified as no_message", () => {
    const expectations: StagedExpectations = {
      expected_sendability_status: "redirect",
      expected_output_path: "no_message",
      expected_needs_goal_selection: false,
      expected_no_message_recommended: true,
    };
    const outcome: StagedOutcome = {
      actual_sendability_status: "redirect",
      actual_output_path: "no_message",
      actual_needs_goal_selection: false,
      actual_no_message_recommended: true,
    };
    const v = runStagedValidator(expectations, outcome, "I had a dream about us last night.");
    expect(v.status).toBe("pass");
    expect(v.triageScore).toBe(10);
    expect(v.routingScore).toBe(10);
    expect(v.outcomeScore).toBe(10);
  });

  it("fails when no_message produces a rewrite", () => {
    const expectations: StagedExpectations = {
      expected_sendability_status: "redirect",
      expected_output_path: "no_message",
      expected_no_message_recommended: true,
    };
    const outcome: StagedOutcome = {
      actual_sendability_status: "redirect",
      actual_output_path: "no_message",
      actual_no_message_recommended: true,
      primary_rewrite: "Some rewrite that shouldn't exist.",
    };
    const v = runStagedValidator(expectations, outcome);
    expect(v.checks.find(c => c.rule === "no_message_no_rewrite")?.severity).toBe("fail");
    expect(v.outcomeScore).toBeLessThan(10);
  });

  it("fails when no_message not recommended", () => {
    const expectations: StagedExpectations = {
      expected_sendability_status: "redirect",
      expected_output_path: "no_message",
      expected_no_message_recommended: true,
    };
    const outcome: StagedOutcome = {
      actual_sendability_status: "redirect",
      actual_output_path: "no_message",
      actual_no_message_recommended: false,
    };
    const v = runStagedValidator(expectations, outcome);
    expect(v.checks.find(c => c.rule === "no_message_recommended")?.severity).toBe("fail");
    expect(v.outcomeScore).toBeLessThanOrEqual(5);
  });

  it("fails when wrong output_path (redirect_choice instead of no_message)", () => {
    const expectations: StagedExpectations = {
      expected_sendability_status: "redirect",
      expected_output_path: "no_message",
    };
    const outcome: StagedOutcome = {
      actual_sendability_status: "redirect",
      actual_output_path: "redirect_choice",
      actual_needs_goal_selection: true,
    };
    const v = runStagedValidator(expectations, outcome);
    expect(v.checks.find(c => c.rule === "staged_output_path_match")?.severity).toBe("fail");
    expect(v.routingScore).toBeLessThan(10);
  });
});

describe("staged validator — score failure not blocking", () => {
  it("score stage failure does not fail the case", () => {
    // A case that passes triage + routing + outcome should pass even if scoring fails
    const expectations: StagedExpectations = {
      expected_sendability_status: "safe",
      expected_output_path: "rewrite",
    };
    const outcome: StagedOutcome = {
      actual_sendability_status: "safe",
      actual_output_path: "rewrite",
      primary_rewrite: "Please confirm the pickup time for tomorrow.",
      shorter_version: "Confirm pickup time.",
      firmer_version: "Confirm pickup time tomorrow.",
      why_this_is_safer: "Neutral and concise.",
    };
    const v = runStagedValidator(expectations, outcome, "What time is pickup tomorrow?");
    expect(v.status).toBe("pass");
  });
});

describe("staged validator — overall score weighting", () => {
  it("overall score reflects weighted average", () => {
    const expectations: StagedExpectations = {
      expected_sendability_status: "safe",
      expected_output_path: "rewrite",
    };
    const outcome: StagedOutcome = {
      actual_sendability_status: "safe",
      actual_output_path: "rewrite",
      primary_rewrite: "Please confirm pickup.",
      shorter_version: "Confirm pickup.",
      firmer_version: "Confirm pickup.",
      why_this_is_safer: "Clean.",
    };
    const v = runStagedValidator(expectations, outcome);
    // All perfect: 10*0.3 + 10*0.3 + ~10*0.4 = 10
    expect(v.overallScore).toBeGreaterThanOrEqual(9);
  });
});
