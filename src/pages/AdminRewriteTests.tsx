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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Play, CheckCircle, XCircle, AlertTriangle, Loader2, Send, BookmarkPlus } from "lucide-react";
import { toast } from "sonner";
import {
  type StagedExpectations,
  type StagedOutcome,
  type StagedValidatorResult,
  runStagedValidator,
} from "@/lib/goldSuiteValidator";

// ── Types ──

interface GoldCase {
  id: string;
  name: string;
  category: string;
  input_message: string;
  expected_sendability_status: string | null;
  expected_output_path: string | null;
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
  expected: StagedExpectations;
  actual: StagedOutcome;
  validation: StagedValidatorResult;
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

const normalizeOutputPath = (path: unknown): string | null => {
  if (path === "rewrite_with_guidance") return "rewrite";
  if (path === "rewrite" || path === "redirect_choice" || path === "no_message") return path as string;
  return null;
};

const normalizeRiskFlags = (flags: unknown): string[] => {
  if (!Array.isArray(flags)) return [];
  return [...new Set(
    flags.map(f => String(f ?? "").trim().toLowerCase()).filter(Boolean)
  )];
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

  // Ad hoc
  const [adHocMessage, setAdHocMessage] = useState("");
  const [adHocCategory, setAdHocCategory] = useState("");
  const [adHocNotes, setAdHocNotes] = useState("");
  const [adHocRunning, setAdHocRunning] = useState(false);
  const [adHocResult, setAdHocResult] = useState<Record<string, any> | null>(null);
  const [adHocError, setAdHocError] = useState<string | null>(null);
  const [adHocSaving, setAdHocSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await (supabase.from as any)("ai_gold_suite_cases")
        .select("id,name,category,input_message,expected_sendability_status,expected_output_path,expected_detected_intent,expected_risk_flags,expected_needs_goal_selection,selected_goal_for_test,expected_no_message_recommended")
        .eq("feature_key", "communication_shield")
        .eq("mode", "rewrite")
        .eq("active", true)
        .order("category", { ascending: true });
      setCases((data ?? []) as GoldCase[]);
      setLoadingCases(false);
    }
    load();
  }, []);

  useEffect(() => {
    async function loadHistory() {
      const { data: runs } = await (supabase.from as any)("ai_gold_suite_runs")
        .select("id, prompt_version, prompt_source, run_label, created_at")
        .eq("feature_key", "communication_shield")
        .eq("mode", "rewrite")
        .order("created_at", { ascending: false })
        .limit(20);
      if (!runs) return;
      const enriched: RunHistoryRow[] = [];
      for (const run of runs) {
        const { data: results } = await (supabase.from as any)("ai_gold_suite_results")
          .select("validator_status")
          .eq("run_id", run.id);
        const passCount = (results ?? []).filter((r: any) => r.validator_status === "pass").length;
        const warnCount = (results ?? []).filter((r: any) => r.validator_status === "warn").length;
        const failCount = (results ?? []).filter((r: any) => r.validator_status === "fail").length;
        enriched.push({ ...run, pass_count: passCount, warn_count: warnCount, fail_count: failCount });
      }
      setRunHistory(enriched);
    }
    loadHistory();
  }, [latestResults]);

  const runFullSuite = useCallback(async () => {
    if (cases.length === 0) return;
    setRunning(true);
    setLatestResults([]);
    setSelectedRunResults(null);

    const { data: runRow, error: runErr } = await (supabase.from as any)("ai_gold_suite_runs")
      .insert({ feature_key: "communication_shield", mode: "rewrite", run_label: `Suite run ${new Date().toISOString()}` })
      .select("id")
      .single();

    if (runErr || !runRow) { setRunning(false); return; }
    const runId = runRow.id;

    const results: CaseRunResult[] = [];
    let firstPromptVersion = "unknown";
    let firstPromptSource = "unknown";

    for (const tc of cases) {
      setCurrentCase(tc.name);

      const expectations: StagedExpectations = {
        expected_sendability_status: tc.expected_sendability_status ?? undefined,
        expected_output_path: tc.expected_output_path ?? undefined,
        expected_detected_intent: tc.expected_detected_intent ?? undefined,
        expected_risk_flags: tc.expected_risk_flags ?? undefined,
        expected_needs_goal_selection: tc.expected_needs_goal_selection,
        expected_no_message_recommended: tc.expected_no_message_recommended,
        selected_goal_for_test: tc.selected_goal_for_test ?? undefined,
      };

      const emptyOutcome: StagedOutcome = {};
      const failResult = (err: string): CaseRunResult => ({
        name: tc.name, category: tc.category, input_message: tc.input_message,
        expected: expectations, actual: emptyOutcome,
        validation: { status: "fail", checks: [{ rule: "error", severity: "fail", reason: err }], failReason: err },
        error: err, promptVersion: "unknown", promptSource: "unknown",
      });

      try {
        const { data: firstData, error: firstError } = await supabase.functions.invoke("communication-shield", {
          body: { message: tc.input_message, mode: "rewrite", skip_quota: true },
        });

        if (firstError || !firstData) {
          const cr = failResult(firstError?.message ?? "No data returned");
          await (supabase.from as any)("ai_gold_suite_results").insert({
            run_id: runId, test_id: tc.name, category: tc.category, original_message: tc.input_message,
            validator_pass: false, validator_status: "fail",
            validator_notes: { expected: expectations, actual: {}, reason: cr.error },
          });
          results.push(cr);
          setLatestResults([...results]);
          continue;
        }

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
          actual_risk_flags: normalizeRiskFlags(first.risk_flags),
          actual_needs_goal_selection: typeof first.needs_goal_selection === "boolean" ? first.needs_goal_selection : undefined,
          actual_redirect_message: first.redirect_message,
          actual_no_message_recommended: first._noMessageNeeded === true || normalizeOutputPath(first.output_path) === "no_message",
          actual_primary_output: first.primary_rewrite ?? first.primary_response ?? first.redirect_message ?? undefined,
        };

        // If goal selection needed and expected path is rewrite, do second call
        const needsGoalSelection = first.needs_goal_selection === true;
        const expectedPath = normalizeOutputPath(tc.expected_output_path);
        const shouldContinue = needsGoalSelection && expectedPath === "rewrite" && typeof first.session_id === "string" && first.session_id.length > 0;

        if (shouldContinue) {
          const selectedGoal = tc.selected_goal_for_test ?? (Array.isArray(first.goal_options) ? first.goal_options[0] : null) ?? "Refocus on logistics";
          const { data: secondData, error: secondError } = await supabase.functions.invoke("communication-shield", {
            body: { message: tc.input_message, mode: "rewrite", skip_quota: true, session_id: first.session_id, selected_goal: selectedGoal },
          });

          if (secondError || !secondData) {
            const cr = failResult(`Continuation failed: ${secondError?.message ?? "No data"}`);
            await (supabase.from as any)("ai_gold_suite_results").insert({
              run_id: runId, test_id: tc.name, category: tc.category, original_message: tc.input_message,
              prompt_version: pv, prompt_source: ps, validator_pass: false, validator_status: "fail",
              validator_notes: { expected: expectations, actual: outcome, reason: cr.error },
            });
            results.push(cr);
            setLatestResults([...results]);
            continue;
          }

          const second = secondData as Record<string, any>;
          outcome.actual_output_path = normalizeOutputPath(second.output_path) ?? outcome.actual_output_path;
          outcome.actual_selected_goal = selectedGoal;
          outcome.actual_primary_output = second.primary_rewrite ?? second.primary_response ?? second.redirect_message ?? outcome.actual_primary_output;
          outcome.actual_redirect_message = second.redirect_message ?? outcome.actual_redirect_message;
          outcome.actual_needs_goal_selection = false;
          outcome.actual_no_message_recommended = second._noMessageNeeded === true || normalizeOutputPath(second.output_path) === "no_message";
        }

        const validation = runStagedValidator(expectations, outcome);

        const caseResult: CaseRunResult = {
          name: tc.name, category: tc.category, input_message: tc.input_message,
          expected: expectations, actual: outcome, validation,
          promptVersion: pv, promptSource: ps,
        };

        await (supabase.from as any)("ai_gold_suite_results").insert({
          run_id: runId, test_id: tc.name, category: tc.category, original_message: tc.input_message,
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
          prompt_version: pv, prompt_source: ps,
          validator_pass: validation.status === "pass",
          validator_status: validation.status,
          validator_notes: { expected: expectations, actual: outcome, checks: validation.checks, scores: { triage: validation.triageScore, routing: validation.routingScore, outcome: validation.outcomeScore, overall: validation.overallScore } },
        });

        results.push(caseResult);
      } catch (e: any) {
        const cr = failResult(e.message);
        await (supabase.from as any)("ai_gold_suite_results").insert({
          run_id: runId, test_id: tc.name, category: tc.category, original_message: tc.input_message,
          validator_pass: false, validator_status: "fail", validator_notes: { reason: e.message },
        });
        results.push(cr);
      }

      setLatestResults([...results]);
    }

    await (supabase.from as any)("ai_gold_suite_runs")
      .update({ prompt_version: firstPromptVersion, prompt_source: firstPromptSource })
      .eq("id", runId);

    setCurrentCase(null);
    setRunning(false);
  }, [cases]);

  const loadRunResults = useCallback(async (runId: string) => {
    const { data } = await (supabase.from as any)("ai_gold_suite_results")
      .select("*").eq("run_id", runId).order("created_at", { ascending: true });
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
      if (error || !data) { setAdHocError(error?.message ?? "No data returned"); }
      else { setAdHocResult(data as Record<string, any>); }
    } catch (e: any) { setAdHocError(e.message); }
    setAdHocRunning(false);
  }, [adHocMessage]);

  const saveAsGoldCandidate = useCallback(async () => {
    if (!adHocMessage.trim()) return;
    setAdHocSaving(true);
    const testName = `ADHOC-${Date.now()}`;
    const { error } = await (supabase.from as any)("ai_gold_suite_cases").insert({
      feature_key: "communication_shield", mode: "rewrite", name: testName,
      category: adHocCategory.trim() || "ad_hoc", input_message: adHocMessage.trim(),
      notes: adHocNotes.trim() || "Saved from ad hoc test", active: false,
    });
    setAdHocSaving(false);
    if (error) { toast.error("Failed to save: " + error.message); }
    else { toast.success(`Saved as gold-suite candidate: ${testName}`); }
  }, [adHocMessage, adHocCategory, adHocNotes]);

  if (authLoading || roleLoading) {
    return (<AppLayout><div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></AppLayout>);
  }
  if (!user || !isAdmin) return <Navigate to="/" replace />;

  const passCount = latestResults.filter(r => r.validation.status === "pass").length;
  const warnCount = latestResults.filter(r => r.validation.status === "warn").length;
  const failCount = latestResults.filter(r => r.validation.status === "fail").length;

  return (
    <AppLayout>
      <div className="h-full overflow-y-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Rewrite QA — Gold Suite</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Internal admin tool · {loadingCases ? "…" : `${cases.length} active cases`}
            </p>
          </div>
          <Button onClick={runFullSuite} disabled={running || loadingCases} className="gap-2">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? `Running (${latestResults.length}/${cases.length})` : "Run Suite"}
          </Button>
        </div>

        {latestResults.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card><CardContent className="pt-4 pb-4 text-center"><p className="text-3xl font-bold text-foreground">{latestResults.length}</p><p className="text-xs text-muted-foreground">Total</p></CardContent></Card>
            <Card><CardContent className="pt-4 pb-4 text-center"><p className="text-3xl font-bold text-green-500">{passCount}</p><p className="text-xs text-muted-foreground">Passed</p></CardContent></Card>
            <Card><CardContent className="pt-4 pb-4 text-center"><p className="text-3xl font-bold text-yellow-500">{warnCount}</p><p className="text-xs text-muted-foreground">Warnings</p></CardContent></Card>
            <Card><CardContent className="pt-4 pb-4 text-center"><p className="text-3xl font-bold text-destructive">{failCount}</p><p className="text-xs text-muted-foreground">Failed</p></CardContent></Card>
            <Card><CardContent className="pt-4 pb-4 text-center"><p className="text-3xl font-bold text-foreground">{latestResults.length > 0 ? `${Math.round((passCount / latestResults.length) * 100)}%` : "—"}</p><p className="text-xs text-muted-foreground">Pass Rate</p></CardContent></Card>
          </div>
        )}

        <Tabs defaultValue="results">
          <TabsList>
            <TabsTrigger value="results">Results</TabsTrigger>
            <TabsTrigger value="failures">Failures{failCount > 0 && <Badge variant="destructive" className="ml-2 text-xs">{failCount}</Badge>}</TabsTrigger>
            <TabsTrigger value="history">History{runHistory.length > 0 && <Badge variant="secondary" className="ml-2 text-xs">{runHistory.length}</Badge>}</TabsTrigger>
            <TabsTrigger value="adhoc">Ad Hoc Test</TabsTrigger>
          </TabsList>

          {/* ── Results Tab ── */}
          <TabsContent value="results" className="space-y-3 mt-4">
            {latestResults.length === 0 && !running && (
              <p className="text-muted-foreground text-sm">Click "Run Suite" to execute the gold test cases.</p>
            )}
            {latestResults.map((r) => (
              <Card key={r.name}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    {r.validation.status === "pass" ? <CheckCircle className="h-5 w-5 text-green-500 shrink-0" /> :
                     r.validation.status === "warn" ? <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" /> :
                     <XCircle className="h-5 w-5 text-destructive shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm font-medium">{r.name}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">Category: {r.category}</p>
                    </div>
                    <Badge variant={r.validation.status === "pass" ? "default" : r.validation.status === "warn" ? "secondary" : "destructive"}>
                      {r.validation.status.toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-xs">
                    <span className="text-muted-foreground font-medium">Input: </span>
                    <span className="text-foreground">{r.input_message}</span>
                  </div>
                  {r.error && <p className="text-xs text-destructive">Error: {r.error}</p>}

                  {/* Expected vs Actual comparison */}
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="space-y-1">
                      <p className="font-medium text-muted-foreground">Expected (from DB)</p>
                      <p>sendability: <span className="text-foreground font-medium">{r.expected.expected_sendability_status ?? "—"}</span></p>
                      <p>output_path: <span className="text-foreground font-medium">{r.expected.expected_output_path ?? "—"}</span></p>
                      <p>intent: <span className="text-foreground font-medium">{r.expected.expected_detected_intent ?? "—"}</span></p>
                      <p>needs_goal: <span className="text-foreground font-medium">{String(r.expected.expected_needs_goal_selection ?? false)}</span></p>
                      <p>no_message: <span className="text-foreground font-medium">{String(r.expected.expected_no_message_recommended ?? false)}</span></p>
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium text-muted-foreground">Actual (from system)</p>
                      <p>sendability: <span className="text-foreground font-medium">{r.actual.actual_sendability_status ?? "—"}</span></p>
                      <p>output_path: <span className="text-foreground font-medium">{r.actual.actual_output_path ?? "—"}</span></p>
                      <p>intent: <span className="text-foreground font-medium">{r.actual.actual_detected_intent ?? "—"}</span></p>
                      <p>needs_goal: <span className="text-foreground font-medium">{String(r.actual.actual_needs_goal_selection ?? false)}</span></p>
                      <p>no_message: <span className="text-foreground font-medium">{String(r.actual.actual_no_message_recommended ?? false)}</span></p>
                    </div>
                  </div>

                  {/* Check results */}
                  <div className="text-xs space-y-0.5">
                    <p className="text-muted-foreground font-medium">Checks:</p>
                    {r.validation.checks.map((c, i) => (
                      <p key={i} className="flex items-center gap-1.5">
                        {c.severity === "pass" ? <CheckCircle className="h-3 w-3 text-green-500" /> :
                         c.severity === "warn" ? <AlertTriangle className="h-3 w-3 text-yellow-500" /> :
                         <XCircle className="h-3 w-3 text-destructive" />}
                        <span className="text-muted-foreground">{c.rule}:</span> {c.reason.replace(/^[✓✗⚠]\s*/, "")}
                      </p>
                    ))}
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Scores: triage={r.validation.triageScore} routing={r.validation.routingScore} outcome={r.validation.outcomeScore} overall={r.validation.overallScore}
                  </div>
                </CardContent>
              </Card>
            ))}
            {running && currentCase && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Running: {currentCase}
              </div>
            )}
          </TabsContent>

          {/* ── Failures Tab ── */}
          <TabsContent value="failures" className="mt-4">
            {failCount === 0 ? (
              <p className="text-muted-foreground text-sm">{latestResults.length === 0 ? "No results yet." : "All tests passed!"}</p>
            ) : (
              <div className="space-y-3">
                {latestResults.filter(r => r.validation.status === "fail").map(r => (
                  <Card key={r.name} className="border-destructive/50">
                    <CardContent className="pt-4 pb-4 space-y-2">
                      <p className="text-sm font-medium text-foreground">{r.name} <Badge variant="destructive" className="ml-2">FAIL</Badge></p>
                      <p className="text-xs text-muted-foreground">{r.input_message}</p>
                      {r.validation.checks.filter(c => c.severity === "fail").map((c, i) => (
                        <p key={i} className="text-xs text-destructive flex items-center gap-1.5">
                          <XCircle className="h-3 w-3" /> {c.rule}: {c.reason.replace(/^✗\s*/, "")}
                        </p>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── History Tab ── */}
          <TabsContent value="history" className="mt-4">
            {runHistory.length === 0 ? (
              <p className="text-muted-foreground text-sm">No runs yet.</p>
            ) : (
              <div className="space-y-3">
                {runHistory.map((run) => (
                  <Card key={run.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => loadRunResults(run.id)}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">{new Date(run.created_at).toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">Prompt: {run.prompt_version ?? "—"}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-green-500 font-medium">{run.pass_count} pass</span>
                          <span className="text-sm text-yellow-500 font-medium">{run.warn_count} warn</span>
                          <span className="text-sm text-destructive font-medium">{run.fail_count} fail</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {selectedRunResults && (
                  <Card className="mt-4">
                    <CardHeader><CardTitle className="text-sm">Run Detail</CardTitle></CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Test</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Triage</TableHead>
                            <TableHead>Route</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedRunResults.map((r: any) => (
                            <TableRow key={r.id}>
                              <TableCell className="text-xs">{r.test_id}</TableCell>
                              <TableCell className="text-xs">{r.category}</TableCell>
                              <TableCell>
                                {r.validator_status === "pass" ? <CheckCircle className="h-4 w-4 text-green-500" /> :
                                 r.validator_status === "warn" ? <AlertTriangle className="h-4 w-4 text-yellow-500" /> :
                                 <XCircle className="h-4 w-4 text-destructive" />}
                              </TableCell>
                              <TableCell className="text-xs">{r.triage_accuracy_score ?? "—"}</TableCell>
                              <TableCell className="text-xs">{r.routing_accuracy_score ?? "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          {/* ── Ad Hoc Tab ── */}
          <TabsContent value="adhoc" className="mt-4 space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Run a single message through the live rewrite engine</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Textarea placeholder="Paste the original message here…" value={adHocMessage} onChange={e => setAdHocMessage(e.target.value)} rows={3} className="text-sm" />
                <div className="flex gap-3">
                  <Input placeholder="Category (optional)" value={adHocCategory} onChange={e => setAdHocCategory(e.target.value)} className="text-sm max-w-[200px]" />
                  <Input placeholder="Notes (optional)" value={adHocNotes} onChange={e => setAdHocNotes(e.target.value)} className="text-sm flex-1" />
                </div>
                <div className="flex gap-2">
                  <Button onClick={runAdHocTest} disabled={adHocRunning || !adHocMessage.trim()} className="gap-2">
                    {adHocRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {adHocRunning ? "Running…" : "Run Test"}
                  </Button>
                  {adHocResult && (
                    <Button variant="outline" onClick={saveAsGoldCandidate} disabled={adHocSaving} className="gap-2">
                      {adHocSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookmarkPlus className="h-4 w-4" />}
                      Save as Gold-Suite Candidate
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
            {adHocError && <Card className="border-destructive"><CardContent className="pt-4 pb-4"><p className="text-sm text-destructive">Error: {adHocError}</p></CardContent></Card>}
            {adHocResult && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Result</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="space-y-1">
                      <p className="font-medium text-muted-foreground">Triage</p>
                      <p>sendability: <span className="font-medium text-foreground">{adHocResult.sendability_status ?? "—"}</span></p>
                      <p>output_path: <span className="font-medium text-foreground">{adHocResult.output_path ?? "—"}</span></p>
                      <p>intent: <span className="font-medium text-foreground">{adHocResult.detected_intent ?? "—"}</span></p>
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium text-muted-foreground">Output</p>
                      <p>rewrite: <span className="font-medium text-foreground">{adHocResult.primary_rewrite ?? "—"}</span></p>
                      <p>redirect: <span className="font-medium text-foreground">{adHocResult.redirect_message ?? "—"}</span></p>
                    </div>
                  </div>
                  {adHocResult.why_this_is_safer && (
                    <>
                      <Separator />
                      <div className="text-xs">
                        <span className="text-muted-foreground font-medium">Why safer: </span>
                        <span className="text-foreground">{adHocResult.why_this_is_safer}</span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
