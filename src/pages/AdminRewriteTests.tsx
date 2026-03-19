import { useState, useCallback } from "react";
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
import { Play, CheckCircle, XCircle, Loader2, Trash2 } from "lucide-react";

// ── Gold-suite test cases ──
interface GoldCase {
  id: string;
  label: string;
  category: string;
  input: string;
  assertions: (result: RewriteResult) => { pass: boolean; reason: string }[];
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
}

interface RunResult {
  caseId: string;
  label: string;
  category: string;
  input: string;
  result: RewriteResult | null;
  assertions: { pass: boolean; reason: string }[];
  passed: boolean;
  error?: string;
  promptVersion: string;
  promptSource: string;
}

interface RunHistory {
  id: string;
  timestamp: string;
  results: RunResult[];
  passCount: number;
  failCount: number;
  promptVersion: string;
}

const BANNED_SOFT = [
  /\bi would like to\b/i,
  /\bi was hoping\b/i,
  /\bif possible\b/i,
  /\bi would appreciate\b/i,
  /\bi was wondering\b/i,
  /\bperhaps we could\b/i,
];

const GOLD_SUITE: GoldCase[] = [
  {
    id: "financial-neutralize",
    label: "Financial assumption → neutral inquiry",
    category: "Financial Language",
    input:
      "You're making way more money now so you should be paying more for the kids' activities.",
    assertions: (r) => [
      {
        pass: !/you should (be )?pay/i.test(r.primary_rewrite),
        reason: "Must not contain 'you should pay'",
      },
      {
        pass: !/adjust your contributions/i.test(r.primary_rewrite),
        reason: "Must not contain 'adjust your contributions'",
      },
      {
        pass: !/making (way )?more money/i.test(r.primary_rewrite),
        reason: "Must not assert income change",
      },
      {
        pass: r.risk_flags.some((f) =>
          /financial/i.test(f)
        ),
        reason: "Risk flags should mention financial assumption",
      },
    ],
  },
  {
    id: "confirmation-preserve",
    label: "Confirmation request preserved",
    category: "Confirmation Preservation",
    input:
      "Can you confirm you will pick up Jake from soccer practice at 4pm Thursday at Lincoln Park?",
    assertions: (r) => [
      {
        pass: /confirm/i.test(r.primary_rewrite),
        reason: "Must preserve confirmation language",
      },
      {
        pass: /4\s?pm/i.test(r.primary_rewrite) || /4:00/i.test(r.primary_rewrite),
        reason: "Must preserve time '4pm'",
      },
      {
        pass: /thursday/i.test(r.primary_rewrite),
        reason: "Must preserve 'Thursday'",
      },
      {
        pass: /lincoln park/i.test(r.primary_rewrite),
        reason: "Must preserve 'Lincoln Park'",
      },
    ],
  },
  {
    id: "emotional-suppress",
    label: "Emotional message → minimized/redirected",
    category: "Emotional Suppression",
    input:
      "I miss when we were a real family. The kids were happier then.",
    assertions: (r) => [
      {
        pass: !/i miss/i.test(r.primary_rewrite),
        reason: "Must not preserve 'I miss' language",
      },
      {
        pass: r.primary_rewrite.split(/\s+/).length <= 30,
        reason: "Should be brief (≤30 words)",
      },
      {
        pass: r.risk_flags.some(
          (f) => /emotional/i.test(f) || /irrelevant/i.test(f) || /non-child/i.test(f)
        ),
        reason: "Risk flags should mention emotional/irrelevant content",
      },
    ],
  },
  {
    id: "over-softening",
    label: "No over-softened phrasing",
    category: "Over-softening",
    input:
      "You need to stop being late to pick up the kids. This is the third time.",
    assertions: (r) =>
      BANNED_SOFT.map((p) => ({
        pass: !p.test(r.primary_rewrite),
        reason: `Must not contain '${p.source}'`,
      })),
  },
  {
    id: "clean-passthrough",
    label: "Already clean message preserved",
    category: "Preservation",
    input: "Drop-off is at 5pm Friday at Lincoln Elementary.",
    assertions: (r) => [
      {
        pass: r.original_score >= 9,
        reason: "original_score should be ≥9 for clean message",
      },
      {
        pass: r.rewrite_quality_score >= 9,
        reason: "rewrite_quality_score should be ≥9 for clean message",
      },
      {
        pass: /5\s?pm/i.test(r.primary_rewrite),
        reason: "Must preserve '5pm'",
      },
      {
        pass: /friday/i.test(r.primary_rewrite),
        reason: "Must preserve 'Friday'",
      },
      {
        pass: /lincoln elementary/i.test(r.primary_rewrite),
        reason: "Must preserve 'Lincoln Elementary'",
      },
    ],
  },
  {
    id: "strategic-intent",
    label: "Specific intent not generalized",
    category: "Strategic Intent",
    input:
      "I need you to return the car seat, winter jacket, and school backpack by Wednesday at drop-off.",
    assertions: (r) => [
      {
        pass: /car seat/i.test(r.primary_rewrite),
        reason: "Must preserve 'car seat'",
      },
      {
        pass: /winter jacket/i.test(r.primary_rewrite),
        reason: "Must preserve 'winter jacket'",
      },
      {
        pass: /backpack/i.test(r.primary_rewrite),
        reason: "Must preserve 'backpack'",
      },
      {
        pass: /wednesday/i.test(r.primary_rewrite),
        reason: "Must preserve 'Wednesday'",
      },
    ],
  },
];

export default function AdminRewriteTests() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, isLoading: roleLoading } = useAdminRole();
  const [running, setRunning] = useState(false);
  const [currentCase, setCurrentCase] = useState<string | null>(null);
  const [latestResults, setLatestResults] = useState<RunResult[]>([]);
  const [history, setHistory] = useState<RunHistory[]>([]);

  const runSingleCase = useCallback(
    async (tc: GoldCase): Promise<RunResult> => {
      setCurrentCase(tc.id);
      try {
        const { data, error } = await supabase.functions.invoke(
          "communication-shield",
          {
            body: { message: tc.input, mode: "rewrite" },
          }
        );
        if (error || !data) {
          return {
            caseId: tc.id,
            label: tc.label,
            category: tc.category,
            input: tc.input,
            result: null,
            assertions: [],
            passed: false,
            error: error?.message ?? "No data returned",
            promptVersion: "unknown",
            promptSource: "edge-function",
          };
        }
        const result: RewriteResult = data;
        const assertions = tc.assertions(result);
        return {
          caseId: tc.id,
          label: tc.label,
          category: tc.category,
          input: tc.input,
          result,
          assertions,
          passed: assertions.every((a) => a.pass),
          promptVersion: (data as any)._prompt_version ?? "unknown",
          promptSource: (data as any)._prompt_source ?? "db/edge-function",
        };
      } catch (e: any) {
        return {
          caseId: tc.id,
          label: tc.label,
          category: tc.category,
          input: tc.input,
          result: null,
          assertions: [],
          passed: false,
          error: e.message,
          promptVersion: "unknown",
          promptSource: "edge-function",
        };
      }
    },
    []
  );

  const runFullSuite = useCallback(async () => {
    setRunning(true);
    setLatestResults([]);
    const results: RunResult[] = [];
    for (const tc of GOLD_SUITE) {
      const r = await runSingleCase(tc);
      results.push(r);
      setLatestResults([...results]);
    }
    setCurrentCase(null);
    setRunning(false);

    const promptVersion =
      results.find((r) => r.promptVersion !== "unknown")?.promptVersion ??
      "unknown";
    const run: RunHistory = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      results,
      passCount: results.filter((r) => r.passed).length,
      failCount: results.filter((r) => !r.passed).length,
      promptVersion,
    };
    setHistory((prev) => [run, ...prev]);
  }, [runSingleCase]);

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

  const passCount = latestResults.filter((r) => r.passed).length;
  const failCount = latestResults.filter((r) => !r.passed).length;
  const failedByCategory = latestResults
    .filter((r) => !r.passed)
    .reduce<Record<string, number>>((acc, r) => {
      acc[r.category] = (acc[r.category] ?? 0) + 1;
      return acc;
    }, {});

  return (
    <AppLayout>
      <div className="h-full overflow-y-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Rewrite QA — Gold Suite
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Internal admin tool · {GOLD_SUITE.length} test cases
            </p>
          </div>
          <Button onClick={runFullSuite} disabled={running} className="gap-2">
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {running ? `Running (${latestResults.length}/${GOLD_SUITE.length})` : "Run Suite"}
          </Button>
        </div>

        {/* Summary cards */}
        {latestResults.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-3xl font-bold text-foreground">
                  {latestResults.length}
                </p>
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
                <p className="text-3xl font-bold text-destructive">
                  {failCount}
                </p>
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
              Failures by Category
              {failCount > 0 && (
                <Badge variant="destructive" className="ml-2 text-xs">
                  {failCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history">
              Run History
              {history.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {history.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="results" className="space-y-3 mt-4">
            {latestResults.length === 0 && !running && (
              <p className="text-muted-foreground text-sm">
                Click "Run Suite" to execute the gold test cases.
              </p>
            )}
            {latestResults.map((r) => (
              <Card key={r.caseId}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    {r.passed ? (
                      <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-destructive shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm font-medium">
                        {r.label}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Category: {r.category} · Prompt: {r.promptVersion} ·
                        Source: {r.promptSource}
                      </p>
                    </div>
                    <Badge variant={r.passed ? "default" : "destructive"}>
                      {r.passed ? "PASS" : "FAIL"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-xs">
                    <span className="text-muted-foreground font-medium">
                      Input:{" "}
                    </span>
                    <span className="text-foreground">{r.input}</span>
                  </div>
                  {r.error && (
                    <p className="text-xs text-destructive">Error: {r.error}</p>
                  )}
                  {r.result && (
                    <div className="text-xs space-y-1">
                      <p>
                        <span className="text-muted-foreground font-medium">
                          Rewrite:{" "}
                        </span>
                        {r.result.primary_rewrite}
                      </p>
                      <p>
                        <span className="text-muted-foreground font-medium">
                          Scores:{" "}
                        </span>
                        original={r.result.original_score},
                        rewrite_quality={r.result.rewrite_quality_score}
                      </p>
                      <p>
                        <span className="text-muted-foreground font-medium">
                          Risk flags:{" "}
                        </span>
                        {r.result.risk_flags.join(", ")}
                      </p>
                    </div>
                  )}
                  {r.assertions.length > 0 && (
                    <div className="text-xs space-y-0.5">
                      <p className="text-muted-foreground font-medium">
                        Assertions:
                      </p>
                      {r.assertions.map((a, i) => (
                        <p key={i} className="flex items-center gap-1.5">
                          {a.pass ? (
                            <CheckCircle className="h-3 w-3 text-green-500" />
                          ) : (
                            <XCircle className="h-3 w-3 text-destructive" />
                          )}
                          {a.reason}
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
                {latestResults.length === 0
                  ? "No results yet."
                  : "All tests passed!"}
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
            {history.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No runs yet.
              </p>
            ) : (
              <div className="space-y-3">
                {history.map((run) => (
                  <Card key={run.id}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {new Date(run.timestamp).toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Prompt: {run.promptVersion}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-green-500 font-medium">
                            {run.passCount} pass
                          </span>
                          <span className="text-sm text-destructive font-medium">
                            {run.failCount} fail
                          </span>
                          <Badge variant={run.failCount === 0 ? "default" : "destructive"}>
                            {Math.round(
                              (run.passCount /
                                (run.passCount + run.failCount)) *
                                100
                            )}
                            %
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
