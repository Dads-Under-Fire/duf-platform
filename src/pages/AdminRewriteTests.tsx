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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Play, CheckCircle, XCircle, Loader2 } from "lucide-react";

// ── Types ──

interface GoldCase {
  id: string;
  test_id: string;
  category: string;
  original_message: string;
  expected_behavior: string | null;
  must_not_do: string | null;
}

interface RewriteResult {
  primary_rewrite: string;
  shorter_version: string;
  firmer_version: string;
  original_score: number;
  rewrite_quality_score: number;
  risk_flags: string[];
  tone_assessment: string;
  original_score_notes: string[];
  rewrite_quality_notes: string[];
  why_this_is_safer: string;
  _prompt_version?: string;
  _prompt_source?: string;
}

interface CaseRunResult {
  test_id: string;
  category: string;
  original_message: string;
  result: RewriteResult | null;
  validatorPass: boolean;
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
  fail_count: number;
}

// ── Built-in validators (client-side assertions matching original gold suite) ──

const BANNED_SOFT = [
  /\bi would like to\b/i,
  /\bi was hoping\b/i,
  /\bif possible\b/i,
  /\bi would appreciate\b/i,
  /\bi was wondering\b/i,
  /\bperhaps we could\b/i,
];

type ValidatorFn = (r: RewriteResult) => { pass: boolean; reason: string }[];

const VALIDATORS: Record<string, ValidatorFn> = {
  "financial-neutralize": (r) => [
    { pass: !/you should (be )?pay/i.test(r.primary_rewrite), reason: "Must not contain 'you should pay'" },
    { pass: !/adjust your contributions/i.test(r.primary_rewrite), reason: "Must not contain 'adjust your contributions'" },
    { pass: !/making (way )?more money/i.test(r.primary_rewrite), reason: "Must not assert income change" },
    { pass: r.risk_flags.some((f) => /financial/i.test(f)), reason: "Risk flags should mention financial assumption" },
  ],
  "confirmation-preserve": (r) => [
    { pass: /confirm/i.test(r.primary_rewrite), reason: "Must preserve confirmation language" },
    { pass: /4\s?pm/i.test(r.primary_rewrite) || /4:00/i.test(r.primary_rewrite), reason: "Must preserve time '4pm'" },
    { pass: /thursday/i.test(r.primary_rewrite), reason: "Must preserve 'Thursday'" },
    { pass: /lincoln park/i.test(r.primary_rewrite), reason: "Must preserve 'Lincoln Park'" },
  ],
  "emotional-suppress": (r) => [
    { pass: !/i miss/i.test(r.primary_rewrite), reason: "Must not preserve 'I miss' language" },
    { pass: r.primary_rewrite.split(/\s+/).length <= 30, reason: "Should be brief (≤30 words)" },
    { pass: r.risk_flags.some((f) => /emotional|irrelevant|non-child/i.test(f)), reason: "Risk flags should mention emotional/irrelevant content" },
  ],
  "over-softening": (r) =>
    BANNED_SOFT.map((p) => ({ pass: !p.test(r.primary_rewrite), reason: `Must not contain '${p.source}'` })),
  "clean-passthrough": (r) => [
    { pass: r.original_score >= 9, reason: "original_score should be ≥9 for clean message" },
    { pass: r.rewrite_quality_score >= 9, reason: "rewrite_quality_score should be ≥9 for clean message" },
    { pass: /5\s?pm/i.test(r.primary_rewrite), reason: "Must preserve '5pm'" },
    { pass: /friday/i.test(r.primary_rewrite), reason: "Must preserve 'Friday'" },
    { pass: /lincoln elementary/i.test(r.primary_rewrite), reason: "Must preserve 'Lincoln Elementary'" },
  ],
  "strategic-intent": (r) => [
    { pass: /car seat/i.test(r.primary_rewrite), reason: "Must preserve 'car seat'" },
    { pass: /winter jacket/i.test(r.primary_rewrite), reason: "Must preserve 'winter jacket'" },
    { pass: /backpack/i.test(r.primary_rewrite), reason: "Must preserve 'backpack'" },
    { pass: /wednesday/i.test(r.primary_rewrite), reason: "Must preserve 'Wednesday'" },
  ],
};

function runValidator(testId: string, result: RewriteResult): { pass: boolean; notes: string[] } {
  const fn = VALIDATORS[testId];
  if (!fn) return { pass: true, notes: ["No validator defined — auto-pass"] };
  const checks = fn(result);
  const failures = checks.filter((c) => !c.pass);
  return {
    pass: failures.length === 0,
    notes: checks.map((c) => `${c.pass ? "✓" : "✗"} ${c.reason}`),
  };
}

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

  // Load active gold suite cases
  useEffect(() => {
    async function load() {
      const { data } = await (supabase.from as any)("ai_gold_suite_cases")
        .select("id, test_id, category, original_message, expected_behavior, must_not_do")
        .eq("feature_key", "communication_shield")
        .eq("mode", "rewrite")
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      setCases(data ?? []);
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
          .select("validator_pass")
          .eq("run_id", run.id);
        const passCount = (results ?? []).filter((r: any) => r.validator_pass).length;
        const failCount = (results ?? []).filter((r: any) => !r.validator_pass).length;
        enriched.push({ ...run, pass_count: passCount, fail_count: failCount });
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
      setCurrentCase(tc.test_id);
      let caseResult: CaseRunResult;

      try {
        const { data, error } = await supabase.functions.invoke("communication-shield", {
          body: { message: tc.original_message, mode: "rewrite" },
        });

        if (error || !data) {
          caseResult = {
            test_id: tc.test_id,
            category: tc.category,
            original_message: tc.original_message,
            result: null,
            validatorPass: false,
            validatorNotes: [error?.message ?? "No data returned"],
            error: error?.message ?? "No data returned",
            promptVersion: "unknown",
            promptSource: "unknown",
          };
        } else {
          const result: RewriteResult = data;
          const pv = (data as any)._prompt_version ?? "unknown";
          const ps = (data as any)._prompt_source ?? "unknown";
          if (firstPromptVersion === "unknown" && pv !== "unknown") {
            firstPromptVersion = pv;
            firstPromptSource = ps;
          }
          const validation = runValidator(tc.test_id, result);
          caseResult = {
            test_id: tc.test_id,
            category: tc.category,
            original_message: tc.original_message,
            result,
            validatorPass: validation.pass,
            validatorNotes: validation.notes,
            promptVersion: pv,
            promptSource: ps,
          };
        }
      } catch (e: any) {
        caseResult = {
          test_id: tc.test_id,
          category: tc.category,
          original_message: tc.original_message,
          result: null,
          validatorPass: false,
          validatorNotes: [e.message],
          error: e.message,
          promptVersion: "unknown",
          promptSource: "unknown",
        };
      }

      // Store result in DB
      await (supabase.from as any)("ai_gold_suite_results").insert({
        run_id: runId,
        test_id: caseResult.test_id,
        category: caseResult.category,
        original_message: caseResult.original_message,
        primary_rewrite: caseResult.result?.primary_rewrite ?? null,
        shorter_version: caseResult.result?.shorter_version ?? null,
        firmer_version: caseResult.result?.firmer_version ?? null,
        tone_assessment: caseResult.result?.tone_assessment ?? null,
        risk_flags: caseResult.result?.risk_flags ?? [],
        why_this_is_safer: caseResult.result?.why_this_is_safer ?? null,
        original_score: caseResult.result?.original_score ?? null,
        original_score_notes: caseResult.result?.original_score_notes ?? null,
        rewrite_quality_score: caseResult.result?.rewrite_quality_score ?? null,
        rewrite_quality_notes: caseResult.result?.rewrite_quality_notes ?? null,
        prompt_version: caseResult.promptVersion,
        prompt_source: caseResult.promptSource,
        validator_pass: caseResult.validatorPass,
        validator_notes: caseResult.validatorNotes,
      });

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

  const passCount = latestResults.filter((r) => r.validatorPass).length;
  const failCount = latestResults.filter((r) => !r.validatorPass).length;
  const failedByCategory = latestResults
    .filter((r) => !r.validatorPass)
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
          </TabsList>

          <TabsContent value="results" className="space-y-3 mt-4">
            {latestResults.length === 0 && !running && (
              <p className="text-muted-foreground text-sm">
                Click "Run Suite" to execute the gold test cases from the database.
              </p>
            )}
            {latestResults.map((r) => (
              <Card key={r.test_id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    {r.validatorPass ? (
                      <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-destructive shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm font-medium">{r.test_id}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Category: {r.category} · Prompt: {r.promptVersion} · Source: {r.promptSource}
                      </p>
                    </div>
                    <Badge variant={r.validatorPass ? "default" : "destructive"}>
                      {r.validatorPass ? "PASS" : "FAIL"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-xs">
                    <span className="text-muted-foreground font-medium">Input: </span>
                    <span className="text-foreground">{r.original_message}</span>
                  </div>
                  {r.error && <p className="text-xs text-destructive">Error: {r.error}</p>}
                  {r.result && (
                    <div className="text-xs space-y-1">
                      <p>
                        <span className="text-muted-foreground font-medium">Rewrite: </span>
                        {r.result.primary_rewrite}
                      </p>
                      <p>
                        <span className="text-muted-foreground font-medium">Scores: </span>
                        original={r.result.original_score}, rewrite_quality={r.result.rewrite_quality_score}
                      </p>
                      <p>
                        <span className="text-muted-foreground font-medium">Risk flags: </span>
                        {r.result.risk_flags.join(", ") || "none"}
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
                          ) : (
                            <XCircle className="h-3 w-3 text-destructive" />
                          )}
                          {note.replace(/^[✓✗]\s*/, "")}
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
                          <span className="text-sm text-destructive font-medium">{run.fail_count} fail</span>
                          <Badge variant={run.fail_count === 0 ? "default" : "destructive"}>
                            {run.pass_count + run.fail_count > 0
                              ? `${Math.round((run.pass_count / (run.pass_count + run.fail_count)) * 100)}%`
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
                            <TableHead>Pass</TableHead>
                            <TableHead>Scores</TableHead>
                            <TableHead>Prompt</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedRunResults.map((r: any) => (
                            <TableRow key={r.id}>
                              <TableCell className="text-xs">{r.test_id}</TableCell>
                              <TableCell className="text-xs">{r.category}</TableCell>
                              <TableCell>
                                {r.validator_pass ? (
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-destructive" />
                                )}
                              </TableCell>
                              <TableCell className="text-xs">
                                {r.original_score ?? "—"}/{r.rewrite_quality_score ?? "—"}
                              </TableCell>
                              <TableCell className="text-xs">{r.prompt_version ?? "—"}</TableCell>
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
        </Tabs>
      </div>
    </AppLayout>
  );
}
