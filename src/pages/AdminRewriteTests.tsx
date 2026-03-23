import { useState, useCallback, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Play, CheckCircle, XCircle, AlertTriangle, Loader2, Send, BookmarkPlus } from "lucide-react";
import { toast } from "sonner";
import {
  type RewriteResult,
  type StagedExpectations,
  type StagedOutcome,
  runStagedValidator,
} from "@/lib/goldSuiteValidator";

// ── Types (UI-only) ──

interface GoldCase {
  id: string;
  name: string;
  category: string;
  input_message: string;
  expected_sendability_status: "safe" | "salvageable" | "redirect" | null;
  expected_output_path: "rewrite" | "redirect_choice" | "no_message" | null;
  expected_detected_intent: string | null;
  expected_risk_flags: string[] | null;
  expected_needs_goal_selection: boolean;
  selected_goal_for_test: string | null;
  expected_no_message_recommended: boolean;
}

interface CaseRunResult {
  name: string;
  category: string;
  input_message: string;
  result: RewriteResult | null;
  validatorStatus: "pass" | "warn" | "fail";
  validatorNotes: string[];
  error?: string;
  promptVersion: string;
  promptSource: string;
}

interface RunHistoryRow {
  id: string;
  prompt_version: string | null;
  prompt_source: string | null;
  run_label: string | null;
  created_at: string;
  pass_count: number;
  warn_count: number;
  fail_count: number;
}

const normalizeOutputPath = (path: unknown): "rewrite" | "redirect_choice" | "no_message" | null => {
  if (path === "rewrite_with_guidance") return "rewrite";
  if (path === "rewrite" || path === "redirect_choice" || path === "no_message") return path;
  return null;
};

const normalizeRiskFlags = (flags: unknown): string[] => {
  if (!Array.isArray(flags)) return [];
  const alias: Record<string, string> = {
    "emotional language": "emotional language detected",
    "personal attack": "denigration / disparagement",
    accusation: "admission trap",
    sarcasm: "emotional language detected",
    threat: "leverage or intimidation language detected",
    coercion: "leverage or intimidation language detected",
    manipulation: "denigration / disparagement",
    vague: "vague or imprecise language",
    romantic: "irrelevant or non-child-related topic",
    "irrelevant content": "irrelevant or non-child-related topic",
  };

  const mapped = flags
    .map((f) => String(f ?? "").trim().toLowerCase())
    .filter(Boolean)
    .map((f) => alias[f] ?? f);

  return [...new Set(mapped)];
};

export default function AdminRewriteTests() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, isLoading: roleLoading } = useAdminRole();

  const [cases, setCases] = useState<GoldCase[]>([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [running, setRunning] = useState(false);
  const [currentCase, setCurrentCase] = useState<string | null>(null);
  const [latestResults, setLatestResults] = useState<CaseRunResult[]>([]);
  const [runHistory, setRunHistory] = useState<RunHistoryRow[]>([]);
  const [selectedRunResults, setSelectedRunResults] = useState<any[] | null>(null);

  // Ad hoc test state
  const [adHocMessage, setAdHocMessage] = useState("");
  const [adHocCategory, setAdHocCategory] = useState("");
  const [adHocNotes, setAdHocNotes] = useState("");
  const [adHocRunning, setAdHocRunning] = useState(false);
  const [adHocResult, setAdHocResult] = useState<RewriteResult | null>(null);
  const [adHocError, setAdHocError] = useState<string | null>(null);
  const [adHocSaving, setAdHocSaving] = useState(false);

  // Load active gold suite cases
  useEffect(() => {
    async function load() {
      const { data } = await (supabase.from as any)("ai_gold_suite_cases")
        .select(`
          id,
          name,
          category,
          input_message,
          expected_sendability_status,
          expected_output_path,
          expected_detected_intent,
          expected_risk_flags,
          expected_needs_goal_selection,
          selected_goal_for_test,
          expected_no_message_recommended
        `)
        .eq("feature_key", "communication_shield")
        .eq("mode", "rewrite")
        .eq("active", true)
        .order("created_at", { ascending: true });
      setCases((data ?? []) as GoldCase[]);
      setLoadingCases(false);
    }
    load();
  }, []);

  // Load run history
  useEffect(() => {
    async function loadHistory() {
      const { data: runs } = await (supabase.from as any)("ai_gold_suite_runs")
        .select("id, prompt_version, prompt_source, run_label, created_at")
        .eq("feature_key", "communication_shield")
        .eq("mode", "rewrite")
        .order("created_at", { ascending: false })
        .limit(20);
      if (!runs) return;

      // Get pass/fail counts for each run
      const enriched: RunHistoryRow[] = [];
      for (const run of runs) {
        const { data: results } = await (supabase.from as any)("ai_gold_suite_results")
          .select("validator_pass, validator_status")
          .eq("run_id", run.id);
        const passCount = (results ?? []).filter((r: any) => (r.validator_status ?? (r.validator_pass ? "pass" : "fail")) === "pass").length;
        const warnCount = (results ?? []).filter((r: any) => (r.validator_status ?? "") === "warn").length;
        const failCount = (results ?? []).filter((r: any) => {
          const s = r.validator_status ?? (r.validator_pass ? "pass" : "fail");
          return s === "fail";
        }).length;
        enriched.push({ ...run, pass_count: passCount, warn_count: warnCount, fail_count: failCount });
      }
      setRunHistory(enriched);
    }
    loadHistory();
  }, [latestResults]); // reload after a new run

  const runFullSuite = useCallback(async () => {
    if (cases.length === 0) return;
    setRunning(true);
    setLatestResults([]);
    setSelectedRunResults(null);

    // Create a run row
    const { data: runRow, error: runErr } = await (supabase.from as any)("ai_gold_suite_runs")
      .insert({
        feature_key: "communication_shield",
        mode: "rewrite",
        run_label: `Suite run ${new Date().toISOString()}`,
      })
      .select("id")
      .single();

    if (runErr || !runRow) {
      setRunning(false);
      return;
    }
    const runId = runRow.id;

    const results: CaseRunResult[] = [];
    let firstPromptVersion = "unknown";
    let firstPromptSource = "unknown";

    for (const tc of cases) {
      setCurrentCase(tc.name);
      let caseResult: CaseRunResult;

      const expectations: StagedExpectations = {
        expected_sendability_status: tc.expected_sendability_status ?? undefined,
        expected_output_path: tc.expected_output_path ?? undefined,
        expected_detected_intent: tc.expected_detected_intent ?? undefined,
        expected_risk_flags: tc.expected_risk_flags ?? undefined,
        expected_needs_goal_selection: tc.expected_needs_goal_selection,
        expected_no_message_recommended: tc.expected_no_message_recommended,
        selected_goal_for_test: tc.selected_goal_for_test ?? undefined,
      };

      try {
        const { data: firstData, error: firstError } = await supabase.functions.invoke("communication-shield", {
          body: { message: tc.input_message, mode: "rewrite", skip_quota: true },
        });

        if (firstError || !firstData) {
          caseResult = {
            name: tc.name,
            category: tc.category,
            input_message: tc.input_message,
            result: null,
            validatorStatus: "fail",
            validatorNotes: [firstError?.message ?? "No data returned"],
            error: firstError?.message ?? "No data returned",
            promptVersion: "unknown",
            promptSource: "unknown",
          };
        } else {
          const first = firstData as Record<string, any>;
          const pv = first.prompt_version ?? "unknown";
          const ps = first.prompt_source ?? "unknown";
          if (firstPromptVersion === "unknown" && pv !== "unknown") {
            firstPromptVersion = pv;
            firstPromptSource = ps;
          }

          const outcome: StagedOutcome = {
            actual_sendability_status: first.sendability_status,
            actual_output_path: normalizeOutputPath(first.output_path) ?? undefined,
            actual_detected_intent: first.detected_intent,
            actual_detected_tone: first.detected_tone,
            actual_risk_flags: normalizeRiskFlags(first.risk_flags),
            actual_needs_goal_selection: typeof first.needs_goal_selection === "boolean" ? first.needs_goal_selection : undefined,
            actual_redirect_message: first.redirect_message,
            actual_no_message_recommended:
              first._noMessageNeeded === true || normalizeOutputPath(first.output_path) === "no_message",
            actual_primary_output:
              first.primary_rewrite ?? first.primary_response ?? first.redirect_message ?? null,
            primary_rewrite: first.primary_rewrite,
            shorter_version: first.shorter_version,
            firmer_version: first.firmer_version,
            why_this_is_safer: first.why_this_is_safer,
          };

          const needsGoalSelection = first.needs_goal_selection === true;
          const expectedPath = normalizeOutputPath(tc.expected_output_path);
          const shouldContinueToGenerate =
            needsGoalSelection &&
            expectedPath === "rewrite" &&
            typeof first.session_id === "string" &&
            first.session_id.length > 0;

          let displayResult: RewriteResult | null =
            first.primary_rewrite ? (first as RewriteResult) : null;

          if (shouldContinueToGenerate) {
            const selectedGoal =
              tc.selected_goal_for_test ??
              (Array.isArray(first.goal_options) ? first.goal_options[0] : null) ??
              "Refocus on logistics";

            const { data: secondData, error: secondError } = await supabase.functions.invoke("communication-shield", {
              body: {
                message: tc.input_message,
                mode: "rewrite",
                skip_quota: true,
                session_id: first.session_id,
                selected_goal: selectedGoal,
              },
            });

            if (secondError || !secondData) {
              caseResult = {
                name: tc.name,
                category: tc.category,
                input_message: tc.input_message,
                result: null,
                validatorStatus: "fail",
                validatorNotes: [`Continuation failed: ${secondError?.message ?? "No data returned"}`],
                error: secondError?.message ?? "No data returned",
                promptVersion: pv,
                promptSource: ps,
              };
              await (supabase.from as any)("ai_gold_suite_results").insert({
                run_id: runId,
                test_id: tc.name,
                category: tc.category,
                original_message: tc.input_message,
                prompt_version: pv,
                prompt_source: ps,
                validator_pass: false,
                validator_status: "fail",
                validator_notes: {
                  expected: expectations,
                  actual: outcome,
                  reason: `Continuation failed: ${secondError?.message ?? "No data returned"}`,
                },
              });
              results.push(caseResult);
              setLatestResults([...results]);
              continue;
            }

            const second = secondData as Record<string, any>;
            outcome.actual_output_path = normalizeOutputPath(second.output_path) ?? outcome.actual_output_path;
            outcome.actual_selected_goal = selectedGoal;
            outcome.actual_primary_output =
              second.primary_rewrite ?? second.primary_response ?? second.redirect_message ?? outcome.actual_primary_output;
            outcome.actual_redirect_message = second.redirect_message ?? outcome.actual_redirect_message;
            outcome.actual_needs_goal_selection = false;
            outcome.actual_no_message_recommended =
              second._noMessageNeeded === true || normalizeOutputPath(second.output_path) === "no_message";
            outcome.primary_rewrite = second.primary_rewrite;
            outcome.shorter_version = second.shorter_version;
            outcome.firmer_version = second.firmer_version;
            outcome.why_this_is_safer = second.why_this_is_safer;
            displayResult = second.primary_rewrite ? (second as RewriteResult) : displayResult;
          }

          const validation = runStagedValidator(expectations, outcome, tc.input_message, tc.category);
          const debugLines = [
            `Expected sendability=${expectations.expected_sendability_status ?? "—"} | Actual=${outcome.actual_sendability_status ?? "—"}`,
            `Expected output_path=${expectations.expected_output_path ?? "—"} | Actual=${outcome.actual_output_path ?? "—"}`,
            `Expected intent=${expectations.expected_detected_intent ?? "—"} | Actual=${outcome.actual_detected_intent ?? "—"}`,
            `Expected needs_goal_selection=${String(expectations.expected_needs_goal_selection)} | Actual=${String(outcome.actual_needs_goal_selection)}`,
          ];

          caseResult = {
            name: tc.name,
            category: tc.category,
            input_message: tc.input_message,
            result: displayResult,
            validatorStatus: validation.status,
            validatorNotes: [...debugLines, ...validation.notes],
            promptVersion: pv,
            promptSource: ps,
          };

          const pathForScoring = outcome.actual_output_path ?? normalizeOutputPath(tc.expected_output_path);

          await (supabase.from as any)("ai_gold_suite_results").insert({
            run_id: runId,
            test_id: tc.name,
            category: tc.category,
            original_message: tc.input_message,
            actual_sendability_status: outcome.actual_sendability_status ?? null,
            actual_output_path: outcome.actual_output_path ?? null,
            actual_detected_intent: outcome.actual_detected_intent ?? null,
            actual_risk_flags: outcome.actual_risk_flags ?? null,
            actual_needs_goal_selection: outcome.actual_needs_goal_selection ?? null,
            actual_selected_goal: outcome.actual_selected_goal ?? null,
            actual_primary_output: outcome.actual_primary_output ?? null,
            actual_redirect_message: outcome.actual_redirect_message ?? null,
            actual_no_message_recommended: outcome.actual_no_message_recommended ?? null,
            triage_accuracy_score: validation.triageScore,
            routing_accuracy_score: validation.routingScore,
            goal_alignment_score: pathForScoring === "rewrite" ? validation.outcomeScore : null,
            redirect_quality_score: pathForScoring === "redirect_choice" ? validation.outcomeScore : null,
            no_message_quality_score: pathForScoring === "no_message" ? validation.outcomeScore : null,
            prompt_version: pv,
            prompt_source: ps,
            validator_pass: validation.status === "pass",
            validator_status: validation.status,
            validator_notes: {
              expected: expectations,
              actual: outcome,
              checks: validation.checks,
              scores: {
                triage: validation.triageScore,
                routing: validation.routingScore,
                outcome: validation.outcomeScore,
                overall: validation.overallScore,
              },
            },
          });
        }
      } catch (e: any) {
        caseResult = {
          name: tc.name,
          category: tc.category,
          input_message: tc.input_message,
          result: null,
          validatorStatus: "fail",
          validatorNotes: [e.message],
          error: e.message,
          promptVersion: "unknown",
          promptSource: "unknown",
        };

        await (supabase.from as any)("ai_gold_suite_results").insert({
          run_id: runId,
          test_id: tc.name,
          category: tc.category,
          original_message: tc.input_message,
          validator_pass: false,
          validator_status: "fail",
          validator_notes: { reason: e.message },
        });
      }

      results.push(caseResult);
      setLatestResults([...results]);
    }

    // Update run with prompt metadata
    await (supabase.from as any)("ai_gold_suite_runs")
      .update({ prompt_version: firstPromptVersion, prompt_source: firstPromptSource })
      .eq("id", runId);

    setCurrentCase(null);
    setRunning(false);
  }, [cases]);

  const loadRunResults = useCallback(async (runId: string) => {
    const { data } = await (supabase.from as any)("ai_gold_suite_results")
      .select("*")
      .eq("run_id", runId)
      .order("created_at", { ascending: true });
    setSelectedRunResults(data ?? []);
  }, []);

  const runAdHocTest = useCallback(async () => {
    if (!adHocMessage.trim()) return;
    setAdHocRunning(true);
    setAdHocResult(null);
    setAdHocError(null);
    try {
      const { data, error } = await supabase.functions.invoke("communication-shield", {
        body: { message: adHocMessage.trim(), mode: "rewrite", skip_quota: true },
      });
      if (error || !data) {
        setAdHocError(error?.message ?? "No data returned");
      } else {
        setAdHocResult(data as RewriteResult);
      }
    } catch (e: any) {
      setAdHocError(e.message);
    }
    setAdHocRunning(false);
  }, [adHocMessage]);

  const saveAsGoldCandidate = useCallback(async () => {
    if (!adHocMessage.trim()) return;
    setAdHocSaving(true);
    const testName = `ADHOC-${Date.now()}`;
    const { error } = await (supabase.from as any)("ai_gold_suite_cases").insert({
      feature_key: "communication_shield",
      mode: "rewrite",
      name: testName,
      category: adHocCategory.trim() || "ad_hoc",
      input_message: adHocMessage.trim(),
      notes: adHocNotes.trim() || "Saved from ad hoc test",
      active: false,
    });
    setAdHocSaving(false);
    if (error) {
      toast.error("Failed to save: " + error.message);
    } else {
      toast.success(`Saved as gold-suite candidate: ${testName}`);
    }
  }, [adHocMessage, adHocCategory, adHocNotes]);

  if (authLoading || roleLoading) {

    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!user || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  const passCount = latestResults.filter((r) => r.validatorStatus === "pass").length;
  const warnCount = latestResults.filter((r) => r.validatorStatus === "warn").length;
  const failCount = latestResults.filter((r) => r.validatorStatus === "fail").length;
  const failedByCategory = latestResults
    .filter((r) => r.validatorStatus === "fail")
    .reduce<Record<string, number>>((acc, r) => {
      acc[r.category] = (acc[r.category] ?? 0) + 1;
      return acc;
    }, {});

  const latestPromptVersion =
    latestResults.find((r) => r.promptVersion !== "unknown")?.promptVersion ?? "—";
  const latestPromptSource =
    latestResults.find((r) => r.promptSource !== "unknown")?.promptSource ?? "—";

  return (
    <AppLayout>
      <div className="h-full overflow-y-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Rewrite QA — Gold Suite
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Internal admin tool · {loadingCases ? "…" : `${cases.length} active cases`}
              {latestPromptVersion !== "—" && (
                <> · Prompt: <span className="font-medium text-foreground">{latestPromptVersion}</span> · Source: {latestPromptSource}</>
              )}
            </p>
          </div>
          <Button onClick={runFullSuite} disabled={running || loadingCases} className="gap-2">
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {running ? `Running (${latestResults.length}/${cases.length})` : "Run Suite"}
          </Button>
        </div>

        {/* Summary cards */}
        {latestResults.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-3xl font-bold text-foreground">{latestResults.length}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-3xl font-bold text-green-500">{passCount}</p>
                <p className="text-xs text-muted-foreground">Passed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-3xl font-bold text-yellow-500">{warnCount}</p>
                <p className="text-xs text-muted-foreground">Warnings</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-3xl font-bold text-destructive">{failCount}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-3xl font-bold text-foreground">
                  {latestResults.length > 0
                    ? `${Math.round((passCount / latestResults.length) * 100)}%`
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground">Pass Rate</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs defaultValue="results">
          <TabsList>
            <TabsTrigger value="results">Results</TabsTrigger>
            <TabsTrigger value="failures">
              Failures
              {failCount > 0 && (
                <Badge variant="destructive" className="ml-2 text-xs">{failCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history">
              History
              {runHistory.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">{runHistory.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="adhoc">Ad Hoc Test</TabsTrigger>
          </TabsList>

          <TabsContent value="results" className="space-y-3 mt-4">
            {latestResults.length === 0 && !running && (
              <p className="text-muted-foreground text-sm">
                Click "Run Suite" to execute the gold test cases from the database.
              </p>
            )}
            {latestResults.map((r) => (
              <Card key={r.name}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    {r.validatorStatus === "pass" ? (
                      <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                    ) : r.validatorStatus === "warn" ? (
                      <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-destructive shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm font-medium">{r.name}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Category: {r.category} · Prompt: {r.promptVersion} · Source: {r.promptSource}
                      </p>
                    </div>
                    <Badge variant={r.validatorStatus === "pass" ? "default" : r.validatorStatus === "warn" ? "secondary" : "destructive"}>
                      {r.validatorStatus.toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-xs">
                    <span className="text-muted-foreground font-medium">Input: </span>
                    <span className="text-foreground">{r.input_message}</span>
                  </div>
                  {r.error && <p className="text-xs text-destructive">Error: {r.error}</p>}
                  {r.result && (
                    <div className="text-xs space-y-1">
                      <p>
                        <span className="text-muted-foreground font-medium">Rewrite: </span>
                        {r.result.primary_rewrite}
                      </p>
                      <p>
                        <span className="text-muted-foreground font-medium">Why safer: </span>
                        {r.result.why_this_is_safer ?? "—"}
                      </p>
                    </div>
                  )}
                  {r.validatorNotes.length > 0 && (
                    <div className="text-xs space-y-0.5">
                      <p className="text-muted-foreground font-medium">Assertions:</p>
                      {r.validatorNotes.map((note, i) => (
                        <p key={i} className="flex items-center gap-1.5">
                          {note.startsWith("✓") ? (
                            <CheckCircle className="h-3 w-3 text-green-500" />
                          ) : note.startsWith("⚠") ? (
                            <AlertTriangle className="h-3 w-3 text-yellow-500" />
                          ) : (
                            <XCircle className="h-3 w-3 text-destructive" />
                          )}
                          {note.replace(/^[✓✗⚠]\s*/, "")}
                        </p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {running && currentCase && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Running: {currentCase}
              </div>
            )}
          </TabsContent>

          <TabsContent value="failures" className="mt-4">
            {Object.keys(failedByCategory).length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {latestResults.length === 0 ? "No results yet." : "All tests passed!"}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Failures</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(failedByCategory)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, count]) => (
                      <TableRow key={cat}>
                        <TableCell>{cat}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="destructive">{count}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            {runHistory.length === 0 ? (
              <p className="text-muted-foreground text-sm">No runs yet.</p>
            ) : (
              <div className="space-y-3">
                {runHistory.map((run) => (
                  <Card
                    key={run.id}
                    className="cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => loadRunResults(run.id)}
                  >
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {new Date(run.created_at).toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Prompt: {run.prompt_version ?? "—"} · Source: {run.prompt_source ?? "—"}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-green-500 font-medium">{run.pass_count} pass</span>
                          <span className="text-sm text-yellow-500 font-medium">{run.warn_count} warn</span>
                          <span className="text-sm text-destructive font-medium">{run.fail_count} fail</span>
                          <Badge variant={run.fail_count === 0 ? "default" : "destructive"}>
                            {run.pass_count + run.warn_count + run.fail_count > 0
                              ? `${Math.round((run.pass_count / (run.pass_count + run.warn_count + run.fail_count)) * 100)}%`
                              : "—"}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {/* Expanded run results */}
                {selectedRunResults && (
                  <Card className="mt-4">
                    <CardHeader>
                      <CardTitle className="text-sm">Run Detail</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Test</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Triage/Route</TableHead>
                            <TableHead>Prompt</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedRunResults.map((r: any) => {
                            const status = r.validator_status ?? (r.validator_pass ? "pass" : "fail");
                            return (
                            <TableRow key={r.id}>
                              <TableCell className="text-xs">{r.test_id}</TableCell>
                              <TableCell className="text-xs">{r.category}</TableCell>
                              <TableCell>
                                {status === "pass" ? (
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                ) : status === "warn" ? (
                                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-destructive" />
                                )}
                              </TableCell>
                              <TableCell className="text-xs">
                                {r.triage_accuracy_score ?? "—"}/{r.routing_accuracy_score ?? "—"}
                              </TableCell>
                              <TableCell className="text-xs">{r.prompt_version ?? "—"}</TableCell>
                            </TableRow>
                          );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="adhoc" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Run a single message through the live rewrite engine</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  placeholder="Paste the original message here…"
                  value={adHocMessage}
                  onChange={(e) => setAdHocMessage(e.target.value)}
                  rows={3}
                  className="text-sm"
                />
                <div className="flex gap-3">
                  <Input
                    placeholder="Category label (optional)"
                    value={adHocCategory}
                    onChange={(e) => setAdHocCategory(e.target.value)}
                    className="text-sm max-w-[200px]"
                  />
                  <Input
                    placeholder="Notes (optional)"
                    value={adHocNotes}
                    onChange={(e) => setAdHocNotes(e.target.value)}
                    className="text-sm flex-1"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={runAdHocTest}
                    disabled={adHocRunning || !adHocMessage.trim()}
                    className="gap-2"
                  >
                    {adHocRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {adHocRunning ? "Running…" : "Run Test"}
                  </Button>
                  {adHocResult && (
                    <Button
                      variant="outline"
                      onClick={saveAsGoldCandidate}
                      disabled={adHocSaving}
                      className="gap-2"
                    >
                      {adHocSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookmarkPlus className="h-4 w-4" />}
                      Save as Gold-Suite Candidate
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {adHocError && (
              <Card className="border-destructive">
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm text-destructive">Error: {adHocError}</p>
                </CardContent>
              </Card>
            )}

            {adHocResult && (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Result</CardTitle>
                    <div className="text-xs text-muted-foreground">
                      Prompt: <span className="font-medium text-foreground">{(adHocResult as any).prompt_version ?? "—"}</span>
                      {" · "}Source: {(adHocResult as any).prompt_source ?? "—"}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Rewrites */}
                  <div className="space-y-2 text-sm">
                    <div>
                      <p className="text-muted-foreground font-medium text-xs mb-1">Primary Rewrite</p>
                      <p className="text-foreground bg-muted/50 rounded p-2">{adHocResult.primary_rewrite}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground font-medium text-xs mb-1">Shorter Version</p>
                      <p className="text-foreground bg-muted/50 rounded p-2">{adHocResult.shorter_version}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground font-medium text-xs mb-1">Firmer Version</p>
                      <p className="text-foreground bg-muted/50 rounded p-2">{adHocResult.firmer_version}</p>
                    </div>
                  </div>

                  <Separator />

                  {/* Why Safer */}
                  <div className="text-xs">
                    <span className="text-muted-foreground font-medium">Why This is Safer: </span>
                    <span className="text-foreground">{adHocResult.why_this_is_safer}</span>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
