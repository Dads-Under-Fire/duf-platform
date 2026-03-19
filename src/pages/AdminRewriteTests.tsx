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

// ── Types ──

interface GoldCase {
  id: string;
  test_id: string;
  category: string;
  original_message: string;
  expected_behavior: string | null;
  must_not_do: string | null;
  validator_rules: ValidatorRules | null;
}

interface ValidatorRules {
  must_include_any?: string[];
  must_not_include_any?: string[];
  must_preserve_question?: boolean;
  must_preserve_confirmation_language?: boolean;
  must_preserve_pov?: boolean;
  must_not_shift_to_response_mode?: boolean;
  must_preserve_specific_terms?: string[];
  must_not_introduce_we_language?: boolean;
  must_not_introduce_i_will?: boolean;
  max_word_count?: number;
  must_flag_any?: string[];
  must_not_flag_any?: string[];
  // New validators
  must_not_preserve_past_fact_validation?: boolean;
  must_not_preserve_leverage_language?: boolean;
  must_not_deepen_nonessential_content?: boolean;
  should_not_expand_unnecessarily?: boolean;
  must_not_preserve_financial_assumptions?: boolean;
}

type CheckSeverity = "pass" | "warn" | "fail";

interface ValidatorCheck {
  severity: CheckSeverity;
  reason: string;
}

interface ValidatorResult {
  status: "pass" | "warn" | "fail";
  notes: string[];
  checks: ValidatorCheck[];
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
  prompt_version?: string;
  prompt_source?: string;
}

interface CaseRunResult {
  test_id: string;
  category: string;
  original_message: string;
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

// ── Normalization helpers ──

function normalizeText(s: string): string {
  // lowercase, collapse whitespace, normalize time formats, strip trailing punctuation differences
  let t = s.toLowerCase().replace(/\s+/g, " ").trim();
  // Normalize time: "3pm", "3 pm", "3:00pm", "3:00 PM" → "3:00 pm"
  t = t.replace(/\b(\d{1,2})\s*:\s*(\d{2})\s*(am|pm)\b/gi, (_, h, m, ap) => `${h}:${m} ${ap.toLowerCase()}`);
  t = t.replace(/\b(\d{1,2})\s*(am|pm)\b/gi, (_, h, ap) => `${h}:00 ${ap.toLowerCase()}`);
  return t;
}

// Response-mode indicators
const RESPONSE_MODE_PHRASES = [
  /\bkeep communication focused\b/i,
  /\bI understand\b/i,
  /\bthank you for sharing\b/i,
  /\bI appreciate you\b/i,
  /\blet'?s focus on\b/i,
];

const PAST_FACT_VALIDATION_PATTERNS = [
  /\b(please |can you |could you |I would like you to )?(confirm|acknowledge|clarify|validate|admit)\b/i,
];

const LEVERAGE_PHRASES = [
  /\brecurring (pattern|issue)\b/i,
  /\bpattern\b/i,
  /\baddress this matter\b/i,
  /\bresolve this matter\b/i,
  /\bmay require attention\b/i,
  /\bnecessary steps\b/i,
  /\bprepared to take action\b/i,
  /\bescalate\b/i,
  /\bif necessary\b/i,
  /\bdocumenting everything\b/i,
];

const EMOTIONAL_DEEPENING_PATTERNS = [
  /\bhow (do |did )?(you |we )feel/i,
  /\btell me (more )?about your feelings\b/i,
  /\bremember when we\b/i,
  /\bI miss\b/i,
  /\bour (relationship|family|love)\b/i,
  /\byour dreams\b/i,
  /\byour personality\b/i,
];

const FINANCIAL_ASSUMPTION_PATTERNS = [
  /\b(making more money|income (has )?changed|earning more|afford|financial(ly)? (stable|secure|better|worse))\b/i,
  /\b(take on|cover(ing)?) (a )?(larger|bigger|more) share\b/i,
  /\b(you can|you should|you need to) (pay|contribute|cover)\b/i,
];

const WE_LANGUAGE_PATTERNS = [
  /\bwe\b/i, /\bus\b/i, /\blet'?s\b/i, /\bwe will\b/i, /\bwe need to\b/i,
  /\bwe can\b/i, /\bwe should\b/i, /\bwe both\b/i, /\bwe all\b/i,
];

function runValidator(
  rules: ValidatorRules | null,
  result: RewriteResult,
  originalMessage?: string,
): ValidatorResult {
  if (!rules || Object.keys(rules).length === 0) {
    return { status: "fail", notes: ["⚠ No validator_rules defined — cannot validate"], checks: [] };
  }

  const checks: ValidatorCheck[] = [];
  const text = result.primary_rewrite;
  const textNorm = normalizeText(text);
  const flags = (result.risk_flags ?? []).map((f) => f.toLowerCase());
  const origNorm = originalMessage ? normalizeText(originalMessage) : "";
  const origWordCount = originalMessage ? originalMessage.split(/\s+/).filter(Boolean).length : 0;
  const rewriteWordCount = text.split(/\s+/).filter(Boolean).length;

  // Helper: add a check. "hard" = true safety issues → fail; false → warn
  const add = (passed: boolean, reason: string, hard: boolean) => {
    if (passed) {
      checks.push({ severity: "pass", reason });
    } else {
      checks.push({ severity: hard ? "fail" : "warn", reason });
    }
  };

  // ── HARD FAIL checks ──

  // must_preserve_pov (POV shift = hard fail)
  if (rules.must_preserve_pov) {
    const hasResponseFlip = /\byou (should|need to|could|might want)\b/i.test(text) && !/\b(I|my|me)\b/i.test(text);
    add(!hasResponseFlip, "Must preserve original POV (not flip to response)", true);
  }

  // must_not_shift_to_response_mode (message type shift = hard fail)
  if (rules.must_not_shift_to_response_mode) {
    const shifted = RESPONSE_MODE_PHRASES.some((p) => p.test(text));
    add(!shifted, "Must not shift to response-mode phrasing", true);
  }

  // must_preserve_question (confirmation→directive = hard fail)
  if (rules.must_preserve_question) {
    add(text.includes("?"), "Must preserve question mark", true);
  }

  // must_preserve_confirmation_language (hard fail)
  if (rules.must_preserve_confirmation_language) {
    const hasConfirm = /confirm|let me know|please (verify|acknowledge)/i.test(text);
    add(hasConfirm, "Must preserve confirmation language", true);
  }

  // must_not_preserve_past_fact_validation (hard fail - safety)
  if (rules.must_not_preserve_past_fact_validation) {
    // Stricter: check for any structure seeking validation of past conduct
    const pastFactPatterns = [
      ...PAST_FACT_VALIDATION_PATTERNS,
      /\b(confirm|clarify|acknowledge) (whether|that|if) .*(you |he |she )?(did|were|was|had|didn't|wasn't|weren't)\b/i,
      /\bprovide details .*(about|regarding|on) .*(what happened|the incident|last|previous)\b/i,
    ];
    const hasValidation = pastFactPatterns.some((p) => p.test(text));
    add(!hasValidation, "Must not preserve past-fact validation language", true);
  }

  // must_not_preserve_leverage_language (hard fail - safety)
  if (rules.must_not_preserve_leverage_language) {
    const leveragePatterns = [
      ...LEVERAGE_PHRASES,
      /\brequires attention\b/i,
      /\btake action\b/i,
    ];
    const hasLeverage = leveragePatterns.some((p) => p.test(text));
    add(!hasLeverage, "Must not preserve leverage/escalation framing", true);
  }

  // must_not_introduce_we_language (shared responsibility = hard fail)
  if (rules.must_not_introduce_we_language) {
    const origHasWe = WE_LANGUAGE_PATTERNS.some((p) => p.test(origNorm));
    if (!origHasWe) {
      const rewriteHasWe = WE_LANGUAGE_PATTERNS.some((p) => p.test(text));
      add(!rewriteHasWe, "Must not introduce 'we/us/let's' language not in original", true);
    }
  }

  // must_not_preserve_financial_assumptions (hard fail - safety)
  if (rules.must_not_preserve_financial_assumptions) {
    const hasFinancial = FINANCIAL_ASSUMPTION_PATTERNS.some((p) => p.test(text));
    add(!hasFinancial, "Must not preserve financial assumptions (income changes, ability to pay)", true);
  }

  // must_not_introduce_i_will (hard fail)
  if (rules.must_not_introduce_i_will) {
    const hasIWill = /\bI will\b/i.test(text);
    add(!hasIWill, "Must not introduce 'I will'", true);
  }

  // must_not_deepen_nonessential_content (hard fail for deepening, warn for mild expansion)
  if (rules.must_not_deepen_nonessential_content) {
    const hasDeepening = EMOTIONAL_DEEPENING_PATTERNS.some((p) => p.test(text));
    add(!hasDeepening, "Must not deepen emotional/nonessential content", true);
    if (origWordCount > 0 && rewriteWordCount > origWordCount * 1.3) {
      add(false, `Nonessential content expanded (${origWordCount}→${rewriteWordCount} words)`, true);
    }
  }

  // must_not_include_any (hard fail for blocked phrases)
  if (rules.must_not_include_any) {
    for (const phrase of rules.must_not_include_any) {
      const found = textNorm.includes(normalizeText(phrase));
      add(!found, `Must not include: "${phrase}"`, true);
    }
  }

  // must_flag_any (hard fail)
  if (rules.must_flag_any) {
    const found = rules.must_flag_any.some((f) => flags.some((rf) => rf.includes(f.toLowerCase())));
    add(found, `Risk flags must include one of: ${rules.must_flag_any.join(", ")}`, true);
  }

  // must_not_flag_any (hard fail)
  if (rules.must_not_flag_any) {
    for (const f of rules.must_not_flag_any) {
      const found = flags.some((rf) => rf.includes(f.toLowerCase()));
      add(!found, `Risk flags must not include: "${f}"`, true);
    }
  }

  // max_word_count (hard fail)
  if (rules.max_word_count) {
    add(rewriteWordCount <= rules.max_word_count, `Must be ≤${rules.max_word_count} words (got ${rewriteWordCount})`, true);
  }

  // ── WARN checks (wording quality, not safety) ──

  // must_include_any — downgrade to warn: wording drift that doesn't change safety
  if (rules.must_include_any) {
    const found = rules.must_include_any.some((t) => textNorm.includes(normalizeText(t)));
    add(found, `Should include one of: ${rules.must_include_any.join(", ")}`, false);
  }

  // must_preserve_specific_terms — warn for minor wording drift
  if (rules.must_preserve_specific_terms) {
    for (const term of rules.must_preserve_specific_terms) {
      const found = textNorm.includes(normalizeText(term));
      add(found, `Should preserve term: "${term}"`, false);
    }
  }

  // should_not_expand_unnecessarily (warn)
  if (rules.should_not_expand_unnecessarily) {
    if (origWordCount > 0 && rewriteWordCount > origWordCount * 1.5) {
      add(false, `Rewrite expanded significantly (${origWordCount}→${rewriteWordCount} words, >150%)`, false);
    } else {
      add(true, `Rewrite length acceptable (${origWordCount}→${rewriteWordCount} words)`, false);
    }
  }

  // Determine overall status
  const hasFail = checks.some((c) => c.severity === "fail");
  const hasWarn = checks.some((c) => c.severity === "warn");
  const status: "pass" | "warn" | "fail" = hasFail ? "fail" : hasWarn ? "warn" : "pass";

  const notes = checks.map((c) => {
    const icon = c.severity === "pass" ? "✓" : c.severity === "warn" ? "⚠" : "✗";
    return `${icon} ${c.reason}`;
  });

  return { status, notes, checks };
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
        .select("id, test_id, category, original_message, expected_behavior, must_not_do, validator_rules")
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
      setCurrentCase(tc.test_id);
      let caseResult: CaseRunResult;

      try {
        const { data, error } = await supabase.functions.invoke("communication-shield", {
          body: { message: tc.original_message, mode: "rewrite", skip_quota: true },
        });

        if (error || !data) {
          caseResult = {
            test_id: tc.test_id,
            category: tc.category,
            original_message: tc.original_message,
            result: null,
            validatorStatus: "fail",
            validatorNotes: [error?.message ?? "No data returned"],
            error: error?.message ?? "No data returned",
            promptVersion: "unknown",
            promptSource: "unknown",
          };
        } else {
          const result: RewriteResult = data;
          const pv = (data as any).prompt_version ?? "unknown";
          const ps = (data as any).prompt_source ?? "unknown";
          if (firstPromptVersion === "unknown" && pv !== "unknown") {
            firstPromptVersion = pv;
            firstPromptSource = ps;
          }
          const validation = runValidator(tc.validator_rules, result, tc.original_message);
          caseResult = {
            test_id: tc.test_id,
            category: tc.category,
            original_message: tc.original_message,
            result,
            validatorStatus: validation.status,
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
          validatorStatus: "fail",
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
    const testId = `ADHOC-${Date.now()}`;
    const { error } = await (supabase.from as any)("ai_gold_suite_cases").insert({
      feature_key: "communication_shield",
      mode: "rewrite",
      test_id: testId,
      category: adHocCategory.trim() || "ad_hoc",
      original_message: adHocMessage.trim(),
      expected_behavior: null,
      must_not_do: null,
      notes: adHocNotes.trim() || "Saved from ad hoc test",
      is_active: false,
    });
    setAdHocSaving(false);
    if (error) {
      toast.error("Failed to save: " + error.message);
    } else {
      toast.success(`Saved as gold-suite candidate: ${testId}`);
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
            <TabsTrigger value="adhoc">Ad Hoc Test</TabsTrigger>
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
                  {/* Scores */}
                  <div className="flex gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-foreground">{adHocResult.original_score}</p>
                      <p className="text-xs text-muted-foreground">Original Score</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-foreground">{adHocResult.rewrite_quality_score}</p>
                      <p className="text-xs text-muted-foreground">Rewrite Score</p>
                    </div>
                  </div>

                  <Separator />

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

                  {/* Analysis */}
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-muted-foreground font-medium">Tone Assessment: </span>
                      <span className="text-foreground">{adHocResult.tone_assessment}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-medium">Risk Flags: </span>
                      <span className="text-foreground">
                        {adHocResult.risk_flags.length > 0 ? adHocResult.risk_flags.join(", ") : "none"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-medium">Why This is Safer: </span>
                      <span className="text-foreground">{adHocResult.why_this_is_safer}</span>
                    </div>
                  </div>

                  <Separator />

                  {/* Score Notes */}
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <p className="text-muted-foreground font-medium mb-1">Original Score Notes</p>
                      <ul className="space-y-0.5 text-foreground">
                        {(adHocResult.original_score_notes ?? []).map((n, i) => (
                          <li key={i}>• {n}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-muted-foreground font-medium mb-1">Rewrite Quality Notes</p>
                      <ul className="space-y-0.5 text-foreground">
                        {(adHocResult.rewrite_quality_notes ?? []).map((n, i) => (
                          <li key={i}>• {n}</li>
                        ))}
                      </ul>
                    </div>
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
