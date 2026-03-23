import { describe, it, expect } from "vitest";
import {
  runStagedValidator,
  type StagedExpectations,
  type StagedOutcome,
} from "@/lib/goldSuiteValidator";

// ══════════════════════════════════════════════════════════════
// STAGED VALIDATOR TESTS — DB-driven expected vs actual only
// ══════════════════════════════════════════════════════════════

describe("staged validator — safe → rewrite", () => {
  it("passes when all fields match", () => {
    const expectations: StagedExpectations = {
      expected_sendability_status: "safe",
      expected_output_path: "rewrite",
      expected_needs_goal_selection: false,
    };
    const outcome: StagedOutcome = {
      actual_sendability_status: "safe",
      actual_output_path: "rewrite",
      actual_needs_goal_selection: false,
      actual_primary_output: "Please confirm the pickup time for tomorrow.",
    };
    const v = runStagedValidator(expectations, outcome);
    expect(v.status).toBe("pass");
    expect(v.triageScore).toBe(10);
    expect(v.routingScore).toBe(10);
    expect(v.outcomeScore).toBe(10);
  });

  it("fails when sendability mismatch", () => {
    const v = runStagedValidator(
      { expected_sendability_status: "safe", expected_output_path: "rewrite" },
      { actual_sendability_status: "salvageable", actual_output_path: "rewrite", actual_primary_output: "text" },
    );
    expect(v.checks.find(c => c.rule === "sendability_match")?.severity).toBe("fail");
    expect(v.triageScore).toBeLessThan(10);
  });

  it("fails when rewrite has no output", () => {
    const v = runStagedValidator(
      { expected_sendability_status: "safe", expected_output_path: "rewrite" },
      { actual_sendability_status: "safe", actual_output_path: "rewrite" },
    );
    expect(v.checks.find(c => c.rule === "rewrite_has_output")?.severity).toBe("fail");
  });
});

describe("staged validator — salvageable → goal selection → rewrite", () => {
  it("passes when goal selection correctly required then rewrite generated", () => {
    const v = runStagedValidator(
      { expected_sendability_status: "salvageable", expected_output_path: "rewrite", expected_needs_goal_selection: true },
      { actual_sendability_status: "salvageable", actual_output_path: "rewrite", actual_needs_goal_selection: true, actual_primary_output: "Confirmed schedule." },
    );
    expect(v.status).toBe("pass");
    expect(v.triageScore).toBe(10);
    expect(v.routingScore).toBe(10);
  });

  it("fails when goal selection not required but expected", () => {
    const v = runStagedValidator(
      { expected_sendability_status: "salvageable", expected_output_path: "rewrite", expected_needs_goal_selection: true },
      { actual_sendability_status: "salvageable", actual_output_path: "rewrite", actual_needs_goal_selection: false, actual_primary_output: "text" },
    );
    expect(v.checks.find(c => c.rule === "needs_goal_selection_match")?.severity).toBe("fail");
  });
});

describe("staged validator — redirect → redirect_choice", () => {
  it("passes when correctly classified", () => {
    const v = runStagedValidator(
      { expected_sendability_status: "redirect", expected_output_path: "redirect_choice", expected_needs_goal_selection: true },
      { actual_sendability_status: "redirect", actual_output_path: "redirect_choice", actual_needs_goal_selection: true },
    );
    expect(v.status).toBe("pass");
    expect(v.routingScore).toBe(10);
  });

  it("warns when redirect_choice has premature output", () => {
    const v = runStagedValidator(
      { expected_sendability_status: "redirect", expected_output_path: "redirect_choice" },
      { actual_sendability_status: "redirect", actual_output_path: "redirect_choice", actual_primary_output: "Premature text" },
    );
    expect(v.checks.find(c => c.rule === "redirect_choice_no_premature_output")?.severity).toBe("warn");
  });

  it("fails when wrong output_path", () => {
    const v = runStagedValidator(
      { expected_sendability_status: "redirect", expected_output_path: "redirect_choice" },
      { actual_sendability_status: "redirect", actual_output_path: "no_message" },
    );
    expect(v.checks.find(c => c.rule === "output_path_match")?.severity).toBe("fail");
  });
});

describe("staged validator — redirect → no_message", () => {
  it("passes when correctly classified", () => {
    const v = runStagedValidator(
      { expected_sendability_status: "redirect", expected_output_path: "no_message", expected_no_message_recommended: true },
      { actual_sendability_status: "redirect", actual_output_path: "no_message", actual_no_message_recommended: true },
    );
    expect(v.status).toBe("pass");
    expect(v.triageScore).toBe(10);
    expect(v.routingScore).toBe(10);
    expect(v.outcomeScore).toBe(10);
  });

  it("fails when no_message not recommended", () => {
    const v = runStagedValidator(
      { expected_sendability_status: "redirect", expected_output_path: "no_message", expected_no_message_recommended: true },
      { actual_sendability_status: "redirect", actual_output_path: "no_message", actual_no_message_recommended: false },
    );
    expect(v.checks.find(c => c.rule === "no_message_match")?.severity).toBe("fail");
    expect(v.outcomeScore).toBeLessThan(10);
  });

  it("warns when no_message produces a rewrite", () => {
    const v = runStagedValidator(
      { expected_sendability_status: "redirect", expected_output_path: "no_message", expected_no_message_recommended: true },
      { actual_sendability_status: "redirect", actual_output_path: "no_message", actual_no_message_recommended: true, actual_primary_output: "Some output" },
    );
    expect(v.checks.find(c => c.rule === "no_message_no_rewrite")?.severity).toBe("warn");
  });

  it("fails when wrong output_path", () => {
    const v = runStagedValidator(
      { expected_sendability_status: "redirect", expected_output_path: "no_message" },
      { actual_sendability_status: "redirect", actual_output_path: "redirect_choice" },
    );
    expect(v.checks.find(c => c.rule === "output_path_match")?.severity).toBe("fail");
  });
});

describe("staged validator — null/undefined normalization", () => {
  it("treats undefined needs_goal_selection as false", () => {
    const v = runStagedValidator(
      { expected_sendability_status: "safe", expected_output_path: "rewrite", expected_needs_goal_selection: false },
      { actual_sendability_status: "safe", actual_output_path: "rewrite", actual_primary_output: "text" },
    );
    expect(v.checks.find(c => c.rule === "needs_goal_selection_match")?.severity).toBe("pass");
  });
});

describe("staged validator — soft checks", () => {
  it("intent mismatch is a warn, not fail", () => {
    const v = runStagedValidator(
      { expected_sendability_status: "safe", expected_output_path: "rewrite", expected_detected_intent: "schedule coordination" },
      { actual_sendability_status: "safe", actual_output_path: "rewrite", actual_detected_intent: "completely different", actual_primary_output: "text" },
    );
    expect(v.checks.find(c => c.rule === "intent_match")?.severity).toBe("warn");
    expect(v.status).toBe("warn"); // not fail
  });

  it("risk flag mismatch is a warn, not fail", () => {
    const v = runStagedValidator(
      { expected_sendability_status: "safe", expected_output_path: "rewrite", expected_risk_flags: ["Emotional language detected"] },
      { actual_sendability_status: "safe", actual_output_path: "rewrite", actual_risk_flags: ["Safe message"], actual_primary_output: "text" },
    );
    expect(v.checks.find(c => c.rule === "risk_flags_match")?.severity).toBe("warn");
  });

  it("fuzzy intent matching works", () => {
    const v = runStagedValidator(
      { expected_detected_intent: "confirm logistics" },
      { actual_detected_intent: "schedule coordination" },
    );
    expect(v.checks.find(c => c.rule === "intent_match")?.severity).toBe("pass");
  });
});

describe("staged validator — overall scoring", () => {
  it("perfect case scores 10", () => {
    const v = runStagedValidator(
      { expected_sendability_status: "safe", expected_output_path: "rewrite" },
      { actual_sendability_status: "safe", actual_output_path: "rewrite", actual_primary_output: "text" },
    );
    expect(v.overallScore).toBe(10);
  });

  it("rewrite_with_guidance normalizes to rewrite", () => {
    const v = runStagedValidator(
      { expected_output_path: "rewrite" },
      { actual_output_path: "rewrite_with_guidance" as any, actual_primary_output: "text" },
    );
    expect(v.checks.find(c => c.rule === "output_path_match")?.severity).toBe("pass");
  });
});
