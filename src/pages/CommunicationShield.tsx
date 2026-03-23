import { useState, useRef } from "react";
import { ArrowUp, ArrowLeft, Copy, RefreshCw, Check, MessageSquarePlus, Info, X, ShieldAlert, ShieldCheck, ShieldOff, AlertTriangle, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { UpgradeModal } from "@/components/UpgradeModal";

type RecommendationType = "respond" | "do_not_respond" | "brief_boundary_response";
type SendabilityStatus = "safe" | "salvageable" | "redirect";

interface RespondTriageResult {
  recommendation_type: RecommendationType;
  should_show_intent_picker: boolean;
  contains_actionable_logistics: boolean;
  actionable_logistics_summary: string;
  recommendation_reason: string;
  allow_boundary_override: boolean;
  risk_flags: string[];
  original_score: number;
  original_score_notes: string[];
  session_id: string;
}

interface AIResult {
  recommendation_type?: RecommendationType;
  primary_response?: string;
  fallback_response?: string;
  primary_rewrite?: string;
  shorter_version?: string;
  firmer_version?: string;
  tone_assessment?: string;
  risk_flags?: string[];
  why_this_is_safer?: string;
  mode: "respond" | "rewrite";
  is_fallback?: boolean;
  // Staged rewrite fields
  sendability_status?: SendabilityStatus;
  output_path?: string;
  detected_intent?: string;
  detected_tone?: string;
  sendability_reason?: string;
  needs_goal_selection?: boolean;
  goal_options?: string[];
  selected_goal?: string | null;
  session_id?: string;
  _noMessageNeeded?: boolean;
  _doNotRespond?: boolean;
  free_regenerations_used?: number;
}

function getPrimaryText(result: AIResult): string {
  return result.mode === "rewrite"
    ? (result.primary_rewrite ?? "")
    : (result.primary_response ?? "");
}

type Step = "input" | "select-intent" | "goal-selection" | "respond-triage" | "result";

const FALLBACK_INTENTS = [
  "Set a boundary",
  "Ask for clarification",
  "Acknowledge without engaging",
  "General neutral response",
];

/** Small copy button with micro-feedback */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors text-xs shrink-0"
      title="Copy"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-primary" />
          <span className="text-primary">Copied ✓</span>
        </>
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

export default function CommunicationShield() {
  const { user } = useAuth();
  const { usage, limits, intendedPlan, rewritesExhausted, refetch: refetchProfile } = useProfile();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isMobile = useIsMobile();
  const [submittedMessage, setSubmittedMessage] = useState("");
  const [mode, setMode] = useState<"respond" | "rewrite">("respond");
  const [inputMessage, setInputMessage] = useState("");
  const [result, setResult] = useState<AIResult | null>(null);
  const [allResults, setAllResults] = useState<AIResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>("input");
  const [intentOptions, setIntentOptions] = useState<string[]>([]);
  const [loadingIntents, setLoadingIntents] = useState(false);
  const [communicationContext, setCommunicationContext] = useState("");
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [otherText, setOtherText] = useState("");
  const [showDirections, setShowDirections] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  // Staged rewrite state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [goalOptions, setGoalOptions] = useState<string[]>([]);
  const [triageData, setTriageData] = useState<Partial<AIResult> | null>(null);
  const [respondTriageData, setRespondTriageData] = useState<RespondTriageResult | null>(null);
  const [freeRegensUsed, setFreeRegensUsed] = useState(0);
  const FREE_REGEN_LIMIT = 2;
  const MAX_MESSAGE_LENGTH = 10000;
  const isOverLimit = inputMessage.length > MAX_MESSAGE_LENGTH;

  const handleModeChange = (newMode: "respond" | "rewrite") => {
    if (newMode === mode) return;
    setMode(newMode);
    setSubmittedMessage("");
    setResult(null);
    setAllResults([]);
    setStep("input");
    setIntentOptions([]);
    setLoadingIntents(false);
    setCommunicationContext("");
    setShowOtherInput(false);
    setOtherText("");
    setShowDirections(false);
    setSessionId(null);
    setGoalOptions([]);
    setTriageData(null);
    setRespondTriageData(null);
    setFreeRegensUsed(0);
    setLoading(false);
  };

  const handleSubmitMessage = async () => {
    const msg = inputMessage.trim();
    if (!msg || !user || isOverLimit) return;

    if (rewritesExhausted) {
      setShowUpgradeModal(true);
      return;
    }

    setSubmittedMessage(msg);
    setInputMessage("");
    setResult(null);
    setAllResults([]);
    setCommunicationContext("");
    setShowOtherInput(false);
    setOtherText("");
    setSessionId(null);
    setGoalOptions([]);
    setTriageData(null);
    setRespondTriageData(null);
    setFreeRegensUsed(0);

    if (mode === "rewrite") {
      // Staged rewrite: call triage first
      setStep("result");
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("communication-shield", {
          body: { message: msg, mode: "rewrite" },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        const aiData = data as AIResult;

        // Check if this is a no_message terminal result from triage
        if (aiData._noMessageNeeded || aiData.output_path === "no_message") {
          const noMsgResult = { ...aiData, _noMessageNeeded: true };
          setResult(noMsgResult);
          setAllResults(prev => [...prev, noMsgResult]);
          setSessionId(aiData.session_id ?? null);
          refetchProfile();
          return;
        }

        // Check if goal selection is needed (salvageable or redirect_choice)
        if (aiData.needs_goal_selection) {
          setSessionId(aiData.session_id ?? null);
          setGoalOptions(aiData.goal_options ?? ["Make it neutral and court-safe", "Keep it brief"]);
          setTriageData(aiData);
          setStep("goal-selection");
          setLoading(false);
          return;
        }

        // Final result (safe path — direct rewrite)
        setResult(aiData);
        setAllResults(prev => [...prev, aiData]);
        setSessionId(aiData.session_id ?? null);
        setFreeRegensUsed(aiData.free_regenerations_used ?? 0);
        refetchProfile();
      } catch (err: any) {
        toast({ title: "Error", description: err.message || "Failed to generate rewrite. Please try again.", variant: "destructive" });
        setStep("input");
      } finally {
        setLoading(false);
      }
      return;
    }

    // ── RESPOND MODE — 2-stage flow ──
    // Stage 1: Triage
    setStep("respond-triage");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("communication-shield", {
        body: { message: msg, mode: "respond" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const triage = data as RespondTriageResult;
      setRespondTriageData(triage);
      setSessionId(triage.session_id ?? null);

      if (triage.recommendation_type === "do_not_respond") {
        // Show do_not_respond card — no generation yet
        setStep("respond-triage");
        setLoading(false);
        return;
      }

      if (triage.recommendation_type === "brief_boundary_response") {
        // Auto-generate brief boundary response
        setStep("result");
        const { data: genData, error: genError } = await supabase.functions.invoke("communication-shield", {
          body: {
            message: msg,
            mode: "respond",
            respond_stage: "generate",
            session_id: triage.session_id,
            boundary_override: false,
          },
        });
        if (genError) throw genError;
        if (genData?.error) throw new Error(genData.error);
        const aiData = genData as AIResult;
        setResult(aiData);
        setAllResults(prev => [...prev, aiData]);
        setFreeRegensUsed(aiData.free_regenerations_used ?? 0);
        refetchProfile();
        setLoading(false);
        return;
      }

      // recommendation_type === "respond" — show intent picker
      setStep("select-intent");
      setLoading(false);

      // Fetch intent suggestions
      if (isMobile) {
        setIntentOptions(FALLBACK_INTENTS);
        try {
          const { data: intentData, error: intentError } = await supabase.functions.invoke("suggest-intents", {
            body: { message: msg, mode: "respond" },
          });
          if (!intentError) {
            const options = Array.isArray(intentData?.options) ? intentData.options.filter((o: unknown) => typeof o === "string" && (o as string).trim()) : [];
            if (options.length >= 2) setIntentOptions(options);
          }
        } catch {}
      } else {
        setLoadingIntents(true);
        try {
          const { data: intentData, error: intentError } = await supabase.functions.invoke("suggest-intents", {
            body: { message: msg, mode: "respond" },
          });
          if (intentError) throw intentError;
          const options = Array.isArray(intentData?.options) ? intentData.options.filter((o: unknown) => typeof o === "string" && (o as string).trim()) : [];
          setIntentOptions(options.length >= 2 ? options : FALLBACK_INTENTS);
        } catch {
          setIntentOptions(FALLBACK_INTENTS);
        } finally {
          setLoadingIntents(false);
        }
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to analyze message. Please try again.", variant: "destructive" });
      setStep("input");
      setLoading(false);
    }
  };

  const handleSelectGoal = async (goal: string) => {
    // "No message needed" — show confirmation result, update session status, persist result
    if (goal === "No message needed") {
      setCommunicationContext(goal);
      setStep("result");
      const noMsgResult = {
        mode: "rewrite",
        sendability_status: triageData?.sendability_status as SendabilityStatus,
        output_path: "no_message",
        primary_rewrite: "",
        why_this_is_safer: "Limiting unnecessary communication can help reduce conflict and protect your position.",
        _noMessageNeeded: true,
      } as any as AIResult;
      setResult(noMsgResult);
      setAllResults(prev => [...prev, noMsgResult]);
      // Update session and create result row in background
      if (sessionId) {
        supabase.functions.invoke("communication-shield", {
          body: {
            message: submittedMessage,
            mode: "rewrite",
            selected_goal: "No message needed",
            session_id: sessionId,
            _no_message_terminal: true,
            triage_risk_flags: triageData?.risk_flags ?? [],
            triage_sendability_reason: triageData?.sendability_reason ?? "",
          },
        }).then(() => {}).catch(() => {});
      }
      return;
    }

    setCommunicationContext(goal);
    setStep("result");
    setLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("communication-shield", {
        body: {
          message: submittedMessage,
          mode: "rewrite",
          selected_goal: goal,
          session_id: sessionId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data as AIResult);
      setAllResults(prev => [...prev, data as AIResult]);
      setFreeRegensUsed((data as AIResult).free_regenerations_used ?? 0);
      refetchProfile();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to generate rewrite", variant: "destructive" });
      setStep("goal-selection");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectIntent = async (option: string) => {
    setCommunicationContext(option);
    setShowOtherInput(false);
    setStep("result");
    setLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("communication-shield", {
        body: {
          message: submittedMessage,
          mode: "respond",
          respond_stage: "generate",
          session_id: sessionId,
          communication_context: option,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data as AIResult);
      setAllResults(prev => [...prev, data as AIResult]);
      setFreeRegensUsed((data as AIResult).free_regenerations_used ?? 0);
      refetchProfile();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to generate response", variant: "destructive" });
      setStep("select-intent");
    } finally {
      setLoading(false);
    }
  };

  const handleBoundaryOverride = async () => {
    if (!submittedMessage || !sessionId) return;
    setStep("result");
    setLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("communication-shield", {
        body: {
          message: submittedMessage,
          mode: "respond",
          respond_stage: "generate",
          session_id: sessionId,
          boundary_override: true,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data as AIResult);
      setAllResults(prev => [...prev, data as AIResult]);
      setFreeRegensUsed((data as AIResult).free_regenerations_used ?? 0);
      refetchProfile();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to generate response", variant: "destructive" });
      setStep("respond-triage");
    } finally {
      setLoading(false);
    }
  };

  const handleOtherSubmit = () => {
    const text = otherText.trim();
    if (text) {
      if (step === "goal-selection") {
        handleSelectGoal(text);
      } else {
        handleSelectIntent(text);
      }
    }
  };

  const handleRegenerate = () => {
    if (mode === "rewrite" && submittedMessage) {
      setLoading(true);
      const body: Record<string, unknown> = { message: submittedMessage, mode: "rewrite", is_regeneration: true };
      if (sessionId && communicationContext) {
        body.selected_goal = communicationContext;
        body.session_id = sessionId;
      } else if (sessionId) {
        body.session_id = sessionId;
      }
      supabase.functions.invoke("communication-shield", { body }).then(({ data, error }) => {
        if (error || data?.error) {
          if (data?.quota_exhausted) {
            setShowUpgradeModal(true);
          } else {
            toast({ title: "Error", description: data?.error || "Unable to generate rewrite. Please try again.", variant: "destructive" });
          }
        } else {
          const aiData = data as AIResult;
          if (aiData.needs_goal_selection) {
            setSessionId(aiData.session_id ?? null);
            setGoalOptions(aiData.goal_options ?? []);
            setTriageData(aiData);
            setStep("goal-selection");
          } else {
            setResult(aiData);
            setAllResults(prev => [...prev, aiData]);
            setFreeRegensUsed(aiData.free_regenerations_used ?? freeRegensUsed);
            refetchProfile();
          }
        }
      }).finally(() => setLoading(false));
    } else if (mode === "respond" && submittedMessage && sessionId) {
      // Respond mode regeneration
      setLoading(true);
      const body: Record<string, unknown> = {
        message: submittedMessage,
        mode: "respond",
        respond_stage: "generate",
        session_id: sessionId,
        is_regeneration: true,
        communication_context: communicationContext || undefined,
      };
      supabase.functions.invoke("communication-shield", { body }).then(({ data, error }) => {
        if (error || data?.error) {
          if (data?.quota_exhausted) {
            setShowUpgradeModal(true);
          } else {
            toast({ title: "Error", description: data?.error || "Unable to regenerate. Please try again.", variant: "destructive" });
          }
        } else {
          const aiData = data as AIResult;
          setResult(aiData);
          setAllResults(prev => [...prev, aiData]);
          setFreeRegensUsed(aiData.free_regenerations_used ?? freeRegensUsed);
          refetchProfile();
        }
      }).finally(() => setLoading(false));
    }
  };

  // Reset state is handled inline in handleSubmitMessage

  const handleBackToCompose = () => {
    if (step === "goal-selection") {
      setStep("input");
      setResult(null);
      setLoading(false);
    } else if (step === "respond-triage") {
      setStep("input");
      setResult(null);
      setRespondTriageData(null);
      setSessionId(null);
      setLoading(false);
    } else {
      setStep("select-intent");
      setResult(null);
      setLoading(false);
    }
  };

  const hasResult = allResults.length > 0;

  // ─── MOBILE ───
  if (isMobile) {
    const showResultScreen = step === "result" || step === "goal-selection";

    if (showResultScreen) {
      return (
        <div className="flex flex-col h-full overflow-hidden">
          {/* Fixed header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
            <button
              onClick={handleBackToCompose}
              className="h-9 w-9 rounded-full border border-border flex items-center justify-center text-primary"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-semibold text-foreground">
              {step === "goal-selection" ? "Choose Your Goal" : mode === "rewrite" ? "Rewritten Message" : "Court-Safe Response"}
            </h1>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-auto px-4 py-4 space-y-5">
            <div>
              <p className="text-muted-foreground text-sm font-medium mb-1">Original Message:</p>
              <p className="text-foreground text-sm whitespace-pre-wrap">{submittedMessage}</p>
            </div>

            {communicationContext && (
              <div>
                <p className="text-muted-foreground text-sm font-medium mb-1">
                  {mode === "rewrite" ? "Goal:" : "Response Intent:"}
                </p>
                <p className="text-foreground text-sm">{communicationContext}</p>
              </div>
            )}

            <div className="h-px bg-border" />

            {/* Goal selection step (handles both salvageable and redirect) */}
            {step === "goal-selection" && (
              <GoalSelectionPanel
                triageData={triageData}
                goalOptions={goalOptions}
                onSelectGoal={handleSelectGoal}
                showOtherInput={showOtherInput}
                setShowOtherInput={setShowOtherInput}
                otherText={otherText}
                setOtherText={setOtherText}
                onOtherSubmit={handleOtherSubmit}
              />
            )}

            {step === "result" && loading && allResults.length === 0 ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
                <RefreshCw className="h-4 w-4 animate-spin" />
                {mode === "rewrite" ? "Analyzing and rewriting message..." : "Generating response..."}
              </div>
            ) : step === "result" && allResults.length > 0 ? (
              <>
                {allResults.map((r, idx) => (
                  <SingleResultBlock key={idx} result={r} index={idx} total={allResults.length} />
                ))}
                {loading && (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm py-4 justify-center">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Generating new version...
                  </div>
                )}
              </>
            ) : null}
          </div>

          {/* Fixed bottom action bar */}
          {step === "result" && (
            <div className="border-t border-border px-4 py-3 bg-background shrink-0 space-y-1">
              <button
                onClick={handleRegenerate}
                disabled={!hasResult || loading || (mode === "rewrite" && rewritesExhausted && freeRegensUsed >= FREE_REGEN_LIMIT)}
                className="flex items-center gap-2 text-primary text-sm hover:text-primary/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RefreshCw className="h-4 w-4" />
                Generate again
              </button>
              {mode === "rewrite" && hasResult && (
                <RegenHelperText freeRegensUsed={freeRegensUsed} freeRegenLimit={FREE_REGEN_LIMIT} rewritesExhausted={rewritesExhausted} />
              )}
            </div>
          )}
        </div>
      );
    }

    // Mobile Screen 1: Compose
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Fixed mode bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">{mode === "respond" ? "Response Mode" : "Rewrite Mode"}</span>
          </div>
          <button
            onClick={() => setShowDirections((v) => !v)}
            className="h-7 w-7 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <Info className="h-4 w-4" />
          </button>
        </div>

        {showDirections && (
          <div className="mx-4 mt-2 p-3 rounded-md bg-card border border-border flex items-start gap-2 shrink-0">
            <div className="flex-1 text-xs text-muted-foreground space-y-0.5">
              <p className="font-medium text-foreground">Directions:</p>
              <p>Paste a message <span className="text-primary">→</span> Choose how to respond <span className="text-primary">→</span> Copy the court-safe reply</p>
            </div>
            <button onClick={() => setShowDirections(false)} className="text-muted-foreground hover:text-foreground shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-1">Original Message</h2>
            <div className="h-px bg-border mb-3" />

            {submittedMessage ? (
              <div className="space-y-3">
                <p className="text-foreground text-sm whitespace-pre-wrap">{submittedMessage}</p>
                {communicationContext && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">
                      {mode === "rewrite" ? "Goal" : "Response Intent"}
                    </p>
                    <p className="text-foreground text-sm">
                      {intentOptions.includes(communicationContext)
                        ? communicationContext
                        : `Custom: "${communicationContext}"`}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-muted-foreground text-sm space-y-1">
                {mode === "respond" ? (
                  <>
                    <p>Paste the message you received below.</p>
                    <p>DUF will generate a neutral, court-safe response.</p>
                  </>
                ) : (
                  <>
                    <p>Paste the message you plan to send below.</p>
                    <p>DUF will rewrite your message to be neutral, clear, and court-safe.</p>
                  </>
                )}
              </div>
            )}
          </div>

          {step === "select-intent" && mode === "respond" && (
            <div>
              <p className="text-sm font-medium text-foreground mb-2">How would you like to respond?</p>
              {loadingIntents ? (
                <div className="flex items-center gap-2 px-4 py-3 bg-card rounded-md text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin shrink-0" />
                  Generating suggested response options...
                </div>
              ) : (
                <div className="space-y-1">
                  {intentOptions.map((option) => (
                    <button
                      key={option}
                      onClick={() => handleSelectIntent(option)}
                      className="w-full text-left px-4 py-2.5 rounded-md text-sm transition-colors flex items-center gap-2 bg-card text-foreground hover:bg-secondary"
                    >
                      {option}
                    </button>
                  ))}

                  {!showOtherInput && (
                    <button
                      onClick={() => setShowOtherInput(true)}
                      className="w-full text-left px-4 py-2.5 rounded-md text-sm transition-colors flex items-center gap-2 bg-card text-foreground hover:bg-secondary"
                    >
                      <MessageSquarePlus className="h-4 w-4 shrink-0" />
                      Other…
                    </button>
                  )}

                  {showOtherInput && (
                    <div className="mt-2 space-y-2">
                      <label className="text-xs text-muted-foreground">What would you like to communicate?</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={otherText}
                          onChange={(e) => setOtherText(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleOtherSubmit()}
                          placeholder="e.g. Decline politely"
                          style={{ fontSize: "16px" }}
                          className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
                          autoFocus
                        />
                        <button
                          onClick={handleOtherSubmit}
                          disabled={!otherText.trim()}
                          className="px-3 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
                        >
                          Go
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Fixed bottom: Mode toggle + Input */}
        <div className="border-t border-border bg-background px-4 py-3 space-y-3 shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => handleModeChange("respond")} className="flex items-center gap-2">
              <div className={`h-4 w-4 rounded-full border-2 ${mode === "respond" ? "border-primary bg-primary" : "border-muted-foreground"}`} />
              <span className="text-sm text-foreground">Respond to message</span>
            </button>
            <button onClick={() => handleModeChange("rewrite")} className="flex items-center gap-2">
              <div className={`h-4 w-4 rounded-full border-2 ${mode === "rewrite" ? "border-primary bg-primary" : "border-muted-foreground"}`} />
              <span className="text-sm text-foreground">Rewrite my message</span>
            </button>
          </div>

          <div className="flex gap-2 items-end">
            <div className="flex-1 relative">
              <textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitMessage();
                  }
                }}
                ref={inputRef}
                rows={Math.min(Math.max(inputMessage.split("\n").length, 1), 5)}
                placeholder={mode === "respond" ? "Paste the message you received..." : "Paste your message here..."}
                disabled={step !== "input"}
                style={{ fontSize: "16px" }}
                className={`w-full bg-card border rounded-xl px-4 py-2.5 pr-20 text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 resize-none min-h-[42px] ${isOverLimit ? "border-destructive" : "border-border"}`}
              />
              {inputMessage.length > 0 && (
                <span className={`absolute top-2 right-3 text-[10px] pointer-events-none ${isOverLimit ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                  {inputMessage.length.toLocaleString()}/{MAX_MESSAGE_LENGTH.toLocaleString()}
                </span>
              )}
            </div>
            <button
              onClick={handleSubmitMessage}
              disabled={loading || !inputMessage.trim() || step !== "input" || isOverLimit}
              className="h-10 w-10 rounded-full bg-card border border-border flex items-center justify-center text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
            >
              <ArrowUp className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── DESKTOP ───
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Mode label + directions strip */}
      <div className="border-b border-border shrink-0">
        <div className="text-center py-2 text-muted-foreground text-sm">
          {mode === "respond" ? "Response Mode" : "Rewrite Mode"}
        </div>
        <div className="flex items-center justify-between px-6 py-2 text-xs text-muted-foreground border-t border-border/50">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">Directions:</span>
            <span>Paste a message</span>
            <span className="text-primary">→</span>
            <span>Choose how to respond</span>
            <span className="text-primary">→</span>
            <span>Copy the court-safe reply</span>
          </div>
        </div>
      </div>

      {/* Main content — two panels, each scrolls internally */}
      <div className="flex-1 flex flex-row gap-0 overflow-hidden min-h-0">
        {/* Left panel */}
        <div className="flex-1 p-6 flex flex-col border-r border-border overflow-hidden">
          <div className="bg-card rounded-lg border border-border flex-1 flex flex-col p-5 overflow-hidden">
            <h2 className="text-lg font-semibold text-foreground mb-1 shrink-0">Original Message</h2>
            <div className="h-px bg-border mb-3 shrink-0" />

            <div className="flex-1 overflow-auto min-h-0">
              {submittedMessage ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Message:</p>
                    <p className="text-foreground text-sm whitespace-pre-wrap">{submittedMessage}</p>
                  </div>
                  {communicationContext && (
                    <div>
                      <p className="text-muted-foreground text-xs mb-1">
                        {mode === "rewrite" ? "Goal" : "Response Intent"}
                      </p>
                      <p className="text-foreground text-sm">
                        {(intentOptions.includes(communicationContext) || goalOptions.includes(communicationContext))
                          ? communicationContext
                          : `Custom: "${communicationContext}"`}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-muted-foreground text-sm space-y-1">
                  {mode === "respond" ? (
                    <>
                      <p>Paste the message you received below.</p>
                      <p>DUF will generate a neutral, court-safe response.</p>
                    </>
                  ) : (
                    <>
                      <p>Paste the message you plan to send below.</p>
                      <p>DUF will rewrite your message to be neutral, clear, and court-safe.</p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Intent options below the card (respond mode) */}
          {step === "select-intent" && mode === "respond" && (
            <div className="mt-4 shrink-0">
              <p className="text-sm font-medium text-foreground mb-2">How would you like to respond?</p>
              {loadingIntents ? (
                <div className="flex items-center gap-2 px-4 py-3 bg-card rounded-md text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin shrink-0" />
                  Generating suggested response options...
                </div>
              ) : (
                <div className="space-y-1">
                  {intentOptions.map((option) => {
                    const isSelected = communicationContext === option;
                    return (
                      <button
                        key={option}
                        onClick={() => handleSelectIntent(option)}
                        className="w-full text-left px-4 py-2.5 rounded-md text-sm transition-colors flex items-center gap-2 bg-card text-foreground hover:bg-secondary"
                      >
                        {isSelected && <Check className="h-4 w-4 shrink-0" />}
                        {option}
                      </button>
                    );
                  })}

                  {step === "select-intent" && !showOtherInput && (
                    <button
                      onClick={() => setShowOtherInput(true)}
                      className="w-full text-left px-4 py-2.5 rounded-md text-sm transition-colors flex items-center gap-2 bg-card text-foreground hover:bg-secondary"
                    >
                      <MessageSquarePlus className="h-4 w-4 shrink-0" />
                      Other…
                    </button>
                  )}

                  {showOtherInput && step === "select-intent" && (
                    <div className="mt-2 space-y-2">
                      <label className="text-xs text-muted-foreground">What would you like to communicate?</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={otherText}
                          onChange={(e) => setOtherText(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleOtherSubmit()}
                          placeholder="e.g. Decline politely"
                          className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
                          autoFocus
                        />
                        <button
                          onClick={handleOtherSubmit}
                          disabled={!otherText.trim()}
                          className="px-3 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
                        >
                          Go
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Goal selection below the card (rewrite mode — both salvageable and redirect) */}
          {step === "goal-selection" && mode === "rewrite" && (
            <div className="mt-4 shrink-0">
              <GoalSelectionPanel
                triageData={triageData}
                goalOptions={goalOptions}
                onSelectGoal={handleSelectGoal}
                showOtherInput={showOtherInput}
                setShowOtherInput={setShowOtherInput}
                otherText={otherText}
                setOtherText={setOtherText}
                onOtherSubmit={handleOtherSubmit}
              />
            </div>
          )}
        </div>

        {/* Arrow separator */}
        <div className="flex items-center -mx-3 z-10 shrink-0">
          <div className="text-muted-foreground">→</div>
        </div>

        {/* Right panel — Court-Safe Response */}
        <div className="flex-1 p-6 flex flex-col overflow-hidden">
          <div className="bg-card rounded-lg border border-primary/30 flex-1 flex flex-col p-5 overflow-hidden">
            <h2 className="text-lg font-semibold text-primary mb-1 shrink-0">
              {mode === "rewrite" ? "Rewritten Message" : "Court-Safe Response"}
            </h2>
            <div className="h-px bg-border mb-3 shrink-0" />

            <div className="flex-1 overflow-auto min-h-0">
              {allResults.length > 0 ? (
                <div className="space-y-0 text-sm">
                  {allResults.map((r, idx) => (
                    <SingleResultBlock key={idx} result={r} index={idx} total={allResults.length} />
                  ))}
                  {loading && (
                    <div className="flex items-center gap-2 text-muted-foreground py-4 justify-center">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Generating new version...
                    </div>
                  )}
                </div>
              ) : loading ? (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-muted-foreground text-sm">{mode === "rewrite" ? "Analyzing and rewriting message..." : "Generating response..."}</p>
                </div>
              ) : step === "goal-selection" ? (
                <div className="flex-1 flex items-start text-muted-foreground text-sm px-6 pt-4 text-left">
                  <p>Select a goal on the left to generate your court-safe rewrite.</p>
                </div>
              ) : (
                <div className="flex-1 flex items-start text-muted-foreground text-sm px-6 pt-4 text-left">
                  <p>{mode === "rewrite" ? "We'll rewrite your message into a clearer, court-safe version." : "Generate a response to see a court-safe reply."}</p>
                </div>
              )}
            </div>

            {/* Generate Again — fixed at bottom of the result card */}
            {step === "result" && hasResult && !loading && (
              <div className="border-t border-border pt-3 mt-3 shrink-0 space-y-1">
                <button
                  onClick={handleRegenerate}
                  disabled={loading || rewritesExhausted}
                  className="flex items-center gap-2 text-primary text-sm hover:text-primary/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RefreshCw className="h-4 w-4" />
                  Generate again
                </button>
                {mode === "rewrite" && (
                  <RegenHelperText freeRegensUsed={freeRegensUsed} freeRegenLimit={FREE_REGEN_LIMIT} rewritesExhausted={rewritesExhausted} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fixed bottom bar: actions + input */}
      <div className="border-t border-border px-6 py-4 space-y-3 shrink-0 bg-background">

        <div className="flex items-center gap-4">
          <button onClick={() => handleModeChange("respond")} className="flex items-center gap-2">
            <div className={`h-4 w-4 rounded-full border-2 ${mode === "respond" ? "border-primary bg-primary" : "border-muted-foreground"}`} />
            <span className="text-sm text-foreground">Respond to message</span>
          </button>
          <button onClick={() => handleModeChange("rewrite")} className="flex items-center gap-2">
            <div className={`h-4 w-4 rounded-full border-2 ${mode === "rewrite" ? "border-primary bg-primary" : "border-muted-foreground"}`} />
            <span className="text-sm text-foreground">Rewrite my message</span>
          </button>
        </div>

        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmitMessage();
                }
              }}
              ref={inputRef}
              rows={Math.min(Math.max(inputMessage.split("\n").length, 1), 5)}
              placeholder={mode === "respond" ? "Paste the message you received..." : "Paste your message here..."}
              disabled={loading}
              className={`w-full bg-card border rounded-xl px-4 py-2.5 pr-20 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 resize-none min-h-[42px] ${isOverLimit ? "border-destructive" : "border-border"}`}
            />
            {inputMessage.length > 0 && (
              <span className={`absolute top-2 right-3 text-[10px] pointer-events-none ${isOverLimit ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                {inputMessage.length.toLocaleString()}/{MAX_MESSAGE_LENGTH.toLocaleString()}
              </span>
            )}
          </div>
          <button
            onClick={handleSubmitMessage}
            disabled={loading || !inputMessage.trim() || isOverLimit}
            className="h-10 w-10 rounded-full bg-card border border-border flex items-center justify-center text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        </div>
      </div>

      <UpgradeModal
        open={showUpgradeModal}
        onOpenChange={setShowUpgradeModal}
        lockedFeature="Communication Shield"
      />
    </div>
  );
}

// ═══════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════

function SingleResultBlock({ result, index, total }: { result: AIResult; index: number; total: number }) {
  const isEven = index % 2 === 0;
  const isLatest = index === total - 1;

  if ((result as any)._noMessageNeeded) {
    return (
      <div className={`rounded-lg p-4 ${isEven ? "bg-background" : "bg-muted/30"} ${!isLatest ? "border-b border-border" : ""}`}>
        {total > 1 && (
          <p className="text-xs text-muted-foreground mb-2 font-medium">
            {isLatest ? `Version ${index + 1} (Latest)` : `Version ${index + 1}`}
          </p>
        )}
        <NoMessageNeededLayout />
      </div>
    );
  }

  if (result.is_fallback) {
    return (
      <div className={`rounded-lg p-4 ${isEven ? "bg-background" : "bg-muted/30"} ${!isLatest ? "border-b border-border" : ""}`}>
        {total > 1 && (
          <p className="text-xs text-muted-foreground mb-2 font-medium">
            {isLatest ? `Version ${index + 1} (Latest)` : `Version ${index + 1}`}
          </p>
        )}
        <FallbackResultLayout result={result} />
      </div>
    );
  }

  return (
    <div className={`rounded-lg p-4 ${isEven ? "bg-background" : "bg-muted/30"} ${!isLatest ? "border-b border-border" : ""}`}>
      {total > 1 && (
        <p className="text-xs text-muted-foreground mb-2 font-medium">
          {isLatest ? `Version ${index + 1} (Latest)` : `Version ${index + 1}`}
        </p>
      )}
      <div className="space-y-4">
        {result.mode === "respond" && result.recommendation_type && (
          <RecommendationBanner type={result.recommendation_type} fallback={result.fallback_response} />
        )}
        {result.mode === "respond" && result.recommendation_type === "do_not_respond" ? (
          <DoNotRespondLayout result={result} />
        ) : (
          <>
            <ResponseSection label={result.mode === "rewrite" ? "Primary Rewrite" : "Primary Response"} content={getPrimaryText(result)} showCopy />
            <ResponseSection label="Shorter Version" content={result.shorter_version ?? ""} showCopy />
            <ResponseSection label="Firmer Version" content={result.firmer_version ?? ""} showCopy />
            {result.mode !== "rewrite" && (
              <>
                <ResponseSection label="Tone Assessment" content={result.tone_assessment ?? ""} />
                <div>
                  <p className="text-muted-foreground mb-1 text-sm font-medium">Risk Flags:</p>
                  <ul className="space-y-1">
                    {(result.risk_flags ?? []).map((flag, i) => (
                      <li key={i} className="text-foreground text-sm">• {flag}</li>
                    ))}
                  </ul>
                </div>
              </>
            )}
            <ResponseSection label="Why This Is Safer" content={result.why_this_is_safer ?? ""} />
          </>
        )}
      </div>
    </div>
  );
}

function SendabilityBadge({ status }: { status: SendabilityStatus }) {
  const config: Record<SendabilityStatus, { icon: typeof ShieldCheck; label: string; className: string }> = {
    safe: { icon: ShieldCheck, label: "Safe to Send", className: "bg-primary/10 border-primary/30 text-primary" },
    salvageable: { icon: AlertTriangle, label: "Needs Revision", className: "bg-accent/50 border-accent text-accent-foreground" },
    redirect: { icon: Ban, label: "Do Not Send", className: "bg-destructive/10 border-destructive/30 text-destructive" },
  };
  const c = config[status];
  const Icon = c.icon;
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium ${c.className}`}>
      <Icon className="h-3.5 w-3.5" />
      {c.label}
    </div>
  );
}

function GoalSelectionPanel({
  triageData,
  goalOptions,
  onSelectGoal,
  showOtherInput,
  setShowOtherInput,
  otherText,
  setOtherText,
  onOtherSubmit,
}: {
  triageData: Partial<AIResult> | null;
  goalOptions: string[];
  onSelectGoal: (goal: string) => void;
  showOtherInput: boolean;
  setShowOtherInput: (v: boolean) => void;
  otherText: string;
  setOtherText: (v: string) => void;
  onOtherSubmit: () => void;
}) {
  const isRedirect = triageData?.sendability_status === "redirect";

  return (
    <div className="space-y-4">
      {triageData && (
        <div className={`rounded-lg border px-4 py-3 space-y-2 ${
          isRedirect
            ? "border-destructive/30 bg-destructive/5"
            : "border-accent bg-accent/20"
        }`}>
          <div className="flex items-center gap-2">
            {isRedirect ? (
              <Ban className="h-4 w-4 text-destructive shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-accent-foreground shrink-0" />
            )}
            <p className="text-sm font-medium text-foreground">
              {isRedirect ? "This message should not be sent as written" : "This message needs revision"}
            </p>
          </div>
          {triageData.sendability_reason && (
            <p className="text-xs text-muted-foreground">{triageData.sendability_reason}</p>
          )}
          {triageData.detected_intent && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Detected intent:</span> {triageData.detected_intent}
            </p>
          )}
          {triageData.risk_flags && triageData.risk_flags.length > 0 && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Risk flags:</span>{" "}
              {triageData.risk_flags.join(", ")}
            </div>
          )}
        </div>
      )}

      <div>
        <p className="text-sm font-medium text-foreground mb-2">
          {isRedirect ? "What would you like to do instead?" : "What's your goal for this message?"}
        </p>
        <div className="space-y-1">
          {goalOptions.map((option) => (
            <button
              key={option}
              onClick={() => onSelectGoal(option)}
              className="w-full text-left px-4 py-2.5 rounded-md text-sm transition-colors flex items-center gap-2 bg-card text-foreground hover:bg-secondary"
            >
              {option}
            </button>
          ))}

          {!showOtherInput && (
            <button
              onClick={() => setShowOtherInput(true)}
              className="w-full text-left px-4 py-2.5 rounded-md text-sm transition-colors flex items-center gap-2 bg-card text-foreground hover:bg-secondary"
            >
              <MessageSquarePlus className="h-4 w-4 shrink-0" />
              Other…
            </button>
          )}

          {showOtherInput && (
            <div className="mt-2 space-y-2">
              <label className="text-xs text-muted-foreground">What would you like to achieve?</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onOtherSubmit()}
                  placeholder="e.g. Set a clear boundary"
                  className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
                  autoFocus
                />
                <button
                  onClick={onOtherSubmit}
                  disabled={!otherText.trim()}
                  className="px-3 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
                >
                  Go
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResponseSection({ label, content, showCopy }: { label: string; content: string; showCopy?: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-muted-foreground">{label}</p>
        {showCopy && content && <CopyButton text={content} />}
      </div>
      <div className="h-px bg-border mb-2" />
      <p className="text-foreground whitespace-pre-wrap">{content}</p>
    </div>
  );
}

function FallbackResultLayout({ result }: { result: AIResult }) {
  const text = getPrimaryText(result);
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-muted bg-muted/30 px-4 py-3 flex items-start gap-2">
        <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          Using backup safe {result.mode === "rewrite" ? "rewrite" : "response"} template. You can regenerate for a full AI result.
        </p>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="font-semibold text-foreground">
            {result.mode === "rewrite" ? "Safe Rewrite:" : "Safe Response:"}
          </p>
          {text && <CopyButton text={text} />}
        </div>
        <p className="text-foreground text-sm whitespace-pre-wrap">{text}</p>
      </div>
    </div>
  );
}

function DoNotRespondLayout({ result }: { result: AIResult }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="font-semibold text-foreground mb-1">Why You Shouldn't Respond</p>
        <p className="text-foreground text-sm whitespace-pre-wrap">{result.why_this_is_safer}</p>
      </div>
    </div>
  );
}

function NoMessageNeededLayout() {
  return (
    <div className="space-y-5 py-4">
      <div className="rounded-lg border border-primary/30 bg-primary/5 px-5 py-4 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
          <h3 className="text-base font-semibold text-foreground">No message recommended</h3>
        </div>
        <p className="text-sm text-foreground">
          Based on your input, it may be best not to respond at this time.
        </p>
        <p className="text-xs text-muted-foreground">
          Limiting unnecessary communication can help reduce conflict.
        </p>
      </div>
    </div>
  );
}

const RECOMMENDATION_CONFIG: Record<RecommendationType, { icon: typeof ShieldCheck; label: string; className: string; description: string }> = {
  respond: {
    icon: ShieldCheck,
    label: "Respond",
    className: "bg-primary/10 border-primary/30 text-primary",
    description: "A response is appropriate. Use the court-safe version below.",
  },
  do_not_respond: {
    icon: ShieldOff,
    label: "Do Not Respond",
    className: "bg-destructive/10 border-destructive/30 text-destructive",
    description: "The safest action is to not respond. See the explanation below.",
  },
  brief_boundary_response: {
    icon: ShieldAlert,
    label: "Brief Boundary Response",
    className: "bg-accent/50 border-accent text-accent-foreground",
    description: "A minimal boundary-setting response is recommended.",
  },
};

function RecommendationBanner({ type, fallback }: { type: RecommendationType; fallback?: string }) {
  const config = RECOMMENDATION_CONFIG[type];
  const Icon = config.icon;
  return (
    <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${config.className}`}>
      <Icon className="h-5 w-5 shrink-0 mt-0.5" />
      <div>
        <p className="font-medium text-sm">{config.label}</p>
        <p className="text-xs mt-0.5 opacity-80">{config.description}</p>
      </div>
    </div>
  );
}

function RegenHelperText({
  freeRegensUsed,
  freeRegenLimit,
  rewritesExhausted,
}: {
  freeRegensUsed: number;
  freeRegenLimit: number;
  rewritesExhausted: boolean;
}) {
  const remaining = Math.max(0, freeRegenLimit - freeRegensUsed);

  let text: string;
  if (rewritesExhausted && remaining <= 0) {
    text = "No credits remaining. Upgrade to continue.";
  } else if (remaining <= 0) {
    text = "Additional regenerations will use another credit.";
  } else if (remaining === 1) {
    text = "1 free regeneration remaining for this message.";
  } else {
    text = `Includes up to ${freeRegenLimit} free regenerations for this message.`;
  }

  return (
    <p className="text-xs text-muted-foreground">{text}</p>
  );
}
