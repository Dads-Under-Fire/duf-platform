import { describe, it, expect } from "vitest";
import {
  runStagedValidator,
  type StagedExpectations,
  type StagedOutcome,
} from "@/lib/goldSuiteValidator";

describe("simplified validator — safe rewrite", () => {
  it("passes when route + output correct", () => {
    const v = runStagedValidator(
      { expected_sendability_status: "safe", expected_output_path: "rewrite", expected_needs_goal_selection: false },
      { actual_sendability_status: "safe", actual_output_path: "rewrite", actual_needs_goal_selection: false, actual_primary_output: "Confirmed pickup." },
    );
    expect(v.status).toBe("pass");
    expect(v.failReason).toBeNull();
  });

  it("fails when no rewrite output", () => {
    const v = runStagedValidator(
      { expected_sendability_status: "safe", expected_output_path: "rewrite" },
      { actual_sendability_status: "safe", actual_output_path: "rewrite" },
    );
    expect(v.status).toBe("fail");
    expect(v.checks.find(c => c.rule === "rewrite_exists")?.severity).toBe("fail");
  });

  it("fails on sendability mismatch", () => {
    const v = runStagedValidator(
      { expected_sendability_status: "safe", expected_output_path: "rewrite" },
      { actual_sendability_status: "salvageable", actual_output_path: "rewrite", actual_primary_output: "text" },
    );
    expect(v.status).toBe("fail");
  });
});

describe("simplified validator — salvageable rewrite", () => {
  it("passes with goal selection + output", () => {
    const v = runStagedValidator(
      { expected_sendability_status: "salvageable", expected_output_path: "rewrite", expected_needs_goal_selection: true },
      { actual_sendability_status: "salvageable", actual_output_path: "rewrite", actual_needs_goal_selection: true, actual_primary_output: "Rewritten." },
    );
    expect(v.status).toBe("pass");
  });
});

describe("simplified validator — no_message", () => {
  it("passes when correctly classified", () => {
    const v = runStagedValidator(
      { expected_sendability_status: "redirect", expected_output_path: "no_message", expected_no_message_recommended: true },
      { actual_sendability_status: "redirect", actual_output_path: "no_message", actual_no_message_recommended: true },
    );
    expect(v.status).toBe("pass");
  });

  it("warns when no_message produces output", () => {
    const v = runStagedValidator(
      { expected_sendability_status: "redirect", expected_output_path: "no_message", expected_no_message_recommended: true },
      { actual_sendability_status: "redirect", actual_output_path: "no_message", actual_no_message_recommended: true, actual_primary_output: "Some output" },
    );
    expect(v.status).toBe("warn");
  });
});

describe("simplified validator — redirect_choice", () => {
  it("passes without requiring output", () => {
    const v = runStagedValidator(
      { expected_sendability_status: "redirect", expected_output_path: "redirect_choice", expected_needs_goal_selection: true },
      { actual_sendability_status: "redirect", actual_output_path: "redirect_choice", actual_needs_goal_selection: true },
    );
    expect(v.status).toBe("pass");
  });
});

describe("simplified validator — normalization", () => {
  it("treats undefined needs_goal_selection as false", () => {
    const v = runStagedValidator(
      { expected_needs_goal_selection: false },
      {},
    );
    expect(v.checks.find(c => c.rule === "goal_selection_match")?.severity).toBe("pass");
  });

  it("normalizes rewrite_with_guidance to rewrite", () => {
    const v = runStagedValidator(
      { expected_output_path: "rewrite" },
      { actual_output_path: "rewrite_with_guidance" as any, actual_primary_output: "text" },
    );
    expect(v.checks.find(c => c.rule === "output_path_match")?.severity).toBe("pass");
  });
});
