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
}

function getPrimaryText(result: AIResult): string {
  return result.mode === "rewrite"
    ? (result.primary_rewrite ?? "")
    : (result.primary_response ?? "");
}

type Step = "input" | "select-intent" | "goal-selection" | "result";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const [submittedMessage, setSubmittedMessage] = useState("");
  const [mode, setMode] = useState<"respond" | "rewrite">("respond");
  const [inputMessage, setInputMessage] = useState("");
  const [result, setResult] = useState<AIResult | null>(null);
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

  const handleSubmitMessage = async () => {
    const msg = inputMessage.trim();
    if (!msg || !user) return;

    if (rewritesExhausted) {
      setShowUpgradeModal(true);
      return;
    }

    setSubmittedMessage(msg);
    setInputMessage("");
    setResult(null);
    setCommunicationContext("");
    setShowOtherInput(false);
    setOtherText("");
    setSessionId(null);
    setGoalOptions([]);
    setTriageData(null);

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
          setResult({
            ...aiData,
            _noMessageNeeded: true,
          });
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
        setSessionId(aiData.session_id ?? null);
        refetchProfile();
      } catch (err: any) {
        toast({ title: "Error", description: err.message || "Failed to generate rewrite. Please try again.", variant: "destructive" });
        setStep("input");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Respond mode — intent selection
    setStep("select-intent");

    if (isMobile) {
      setIntentOptions(FALLBACK_INTENTS);
      setLoadingIntents(false);
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const { data, error } = await supabase.functions.invoke("suggest-intents", {
          body: { message: msg, mode },
        });
        clearTimeout(timeout);
        if (!error) {
          const options = Array.isArray(data?.options) ? data.options.filter((o: unknown) => typeof o === "string" && (o as string).trim()) : [];
          if (options.length >= 2) setIntentOptions(options);
        }
      } catch {}
    } else {
      setLoadingIntents(true);
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const { data, error } = await supabase.functions.invoke("suggest-intents", {
          body: { message: msg, mode },
        });
        clearTimeout(timeout);
        if (error) throw error;
        const options = Array.isArray(data?.options) ? data.options.filter((o: unknown) => typeof o === "string" && (o as string).trim()) : [];
        setIntentOptions(options.length >= 2 ? options : FALLBACK_INTENTS);
      } catch {
        setIntentOptions(FALLBACK_INTENTS);
      } finally {
        setLoadingIntents(false);
      }
    }
  };

  const handleSelectGoal = async (goal: string) => {
    // "No message needed" — show confirmation result, update session status
    if (goal === "No message needed") {
      setCommunicationContext(goal);
      setStep("result");
      setResult({
        mode: "rewrite",
        sendability_status: triageData?.sendability_status as SendabilityStatus,
        primary_rewrite: "",
        why_this_is_safer: "Limiting unnecessary communication can help reduce conflict and protect your position.",
        _noMessageNeeded: true,
      } as any);
      // Update session status in background
      if (sessionId) {
        supabase.from("communication_shield_sessions").update({
          session_status: "no_message_needed",
          selected_goal: "No message needed",
        }).eq("id", sessionId).then(() => {});
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
          mode,
          original_context: mode === "respond" ? submittedMessage : undefined,
          communication_context: option,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data as AIResult);
      refetchProfile();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to generate response", variant: "destructive" });
      setStep("select-intent");
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
      setResult(null);
      setLoading(true);
      const body: Record<string, unknown> = { message: submittedMessage, mode: "rewrite" };
      if (sessionId && communicationContext) {
        body.selected_goal = communicationContext;
        body.session_id = sessionId;
      }
      supabase.functions.invoke("communication-shield", { body }).then(({ data, error }) => {
        if (error || data?.error) {
          toast({ title: "Error", description: data?.error || "Unable to generate rewrite. Please try again.", variant: "destructive" });
        } else {
          const aiData = data as AIResult;
          if (aiData.needs_goal_selection) {
            setSessionId(aiData.session_id ?? null);
            setGoalOptions(aiData.goal_options ?? []);
            setTriageData(aiData);
            setStep("goal-selection");
          } else {
            setResult(aiData);
            refetchProfile();
          }
        }
      }).finally(() => setLoading(false));
    } else if (communicationContext && submittedMessage) {
      handleSelectIntent(communicationContext);
    }
  };

  // Reset state is handled inline in handleSubmitMessage

  const handleBackToCompose = () => {
    if (step === "goal-selection") {
      setStep("input");
      setResult(null);
      setLoading(false);
    } else {
      setStep("select-intent");
      setResult(null);
      setLoading(false);
    }
  };

  const hasResult = !!result;

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

            {step === "result" && loading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
                <RefreshCw className="h-4 w-4 animate-spin" />
                {mode === "rewrite" ? "Analyzing and rewriting message..." : "Generating response..."}
              </div>
            ) : step === "result" && result ? (
              <>
                {(result as any)._noMessageNeeded ? (
                  <NoMessageNeededLayout />
                ) : result.is_fallback ? (
                  <FallbackResultLayout result={result} />
                ) : (
                  <>
                    {result.mode === "respond" && result.recommendation_type && (
                      <RecommendationBanner type={result.recommendation_type} fallback={result.fallback_response} />
                    )}

                    {result.mode === "respond" && result.recommendation_type === "do_not_respond" ? (
                      <DoNotRespondLayout result={result} />
                    ) : (
                      <>
                        <ResponseSection label={result.mode === "rewrite" ? "Primary Rewrite" : "Primary Response"} content={getPrimaryText(result)} showCopy />
                        <div className="h-px bg-border" />
                        <ResponseSection label="Shorter Version" content={result.shorter_version ?? ""} showCopy />
                        <div className="h-px bg-border" />
                        <ResponseSection label="Firmer Version" content={result.firmer_version ?? ""} showCopy />
                        {result.mode !== "rewrite" && (
                          <>
                            <div className="h-px bg-border" />
                            <ResponseSection label="Tone Assessment" content={result.tone_assessment ?? ""} />
                            <div>
                              <p className="text-muted-foreground text-sm font-medium mb-1">Risk Flags:</p>
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
                  </>
                )}
              </>
            ) : null}
          </div>

          {/* Fixed bottom action bar */}
          {step === "result" && (
            <div className="border-t border-border px-4 py-3 flex items-center justify-end bg-background shrink-0">
              <button
                onClick={handleRegenerate}
                disabled={!hasResult || loading}
                className="flex items-center gap-2 text-primary text-sm hover:text-primary/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RefreshCw className="h-4 w-4" />
                Generate again
              </button>
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
            <button onClick={() => setMode("respond")} className="flex items-center gap-2">
              <div className={`h-4 w-4 rounded-full border-2 ${mode === "respond" ? "border-primary bg-primary" : "border-muted-foreground"}`} />
              <span className="text-sm text-foreground">Respond to message</span>
            </button>
            <button onClick={() => setMode("rewrite")} className="flex items-center gap-2">
              <div className={`h-4 w-4 rounded-full border-2 ${mode === "rewrite" ? "border-primary bg-primary" : "border-muted-foreground"}`} />
              <span className="text-sm text-foreground">Rewrite my message</span>
            </button>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmitMessage()}
              ref={inputRef}
              placeholder={mode === "respond" ? "Paste the message you received..." : "Paste your message here..."}
              disabled={step !== "input"}
              style={{ fontSize: "16px" }}
              className="flex-1 bg-card border border-border rounded-full px-4 py-2.5 text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
            <button
              onClick={handleSubmitMessage}
              disabled={loading || !inputMessage.trim() || step !== "input"}
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
          {step !== "input" && mode === "respond" && (
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
                        onClick={() => {
                          if (step === "select-intent") handleSelectIntent(option);
                        }}
                        disabled={step === "result"}
                        className={`w-full text-left px-4 py-2.5 rounded-md text-sm transition-colors flex items-center gap-2 ${
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : step === "result"
                            ? "bg-card text-muted-foreground cursor-default"
                            : "bg-card text-foreground hover:bg-secondary"
                        }`}
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
              {result ? (
                <div className="space-y-4 text-sm">
                  {(result as any)._noMessageNeeded ? (
                    <NoMessageNeededLayout />
                  ) : result.is_fallback ? (
                    <FallbackResultLayout result={result} />
                  ) : (
                    <>
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
                                <p className="text-muted-foreground mb-1">Risk Flags</p>
                                <div className="h-px bg-border mb-2" />
                                <ul className="space-y-1">
                                  {(result.risk_flags ?? []).map((flag, i) => (
                                    <li key={i} className="text-foreground">• {flag}</li>
                                  ))}
                                </ul>
                              </div>
                            </>
                          )}
                          <ResponseSection label="Why This Is Safer" content={result.why_this_is_safer ?? ""} />
                        </>
                      )}
                    </>
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
          </div>
        </div>
      </div>

      {/* Fixed bottom bar: actions + input */}
      <div className="border-t border-border px-6 py-4 space-y-3 shrink-0 bg-background">
        {/* Action buttons — always visible */}
        {step === "result" && (
          <div className="flex items-center gap-4">
            <button
              onClick={handleRegenerate}
              disabled={!hasResult || loading}
              className="flex items-center gap-2 text-primary text-sm hover:text-primary/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw className="h-4 w-4" />
              Generate again
            </button>
          </div>
        )}

        <div className="flex items-center gap-4">
          <button onClick={() => setMode("respond")} className="flex items-center gap-2">
            <div className={`h-4 w-4 rounded-full border-2 ${mode === "respond" ? "border-primary bg-primary" : "border-muted-foreground"}`} />
            <span className="text-sm text-foreground">Respond to message</span>
          </button>
          <button onClick={() => setMode("rewrite")} className="flex items-center gap-2">
            <div className={`h-4 w-4 rounded-full border-2 ${mode === "rewrite" ? "border-primary bg-primary" : "border-muted-foreground"}`} />
            <span className="text-sm text-foreground">Rewrite my message</span>
          </button>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmitMessage()}
            ref={inputRef}
            placeholder={mode === "respond" ? "Paste the message you received..." : "Paste your message here..."}
            disabled={loading}
            className="flex-1 bg-card border border-border rounded-full px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          />
          <button
            onClick={handleSubmitMessage}
            disabled={loading || !inputMessage.trim()}
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
