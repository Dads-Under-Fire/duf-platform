import { useState, useRef } from "react";
import { ArrowUp, ArrowLeft, Copy, RefreshCw, Check, MessageSquarePlus, Info, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

interface AIResult {
  primary_response: string;
  shorter_response: string;
  firmer_response: string;
  tone_assessment: string;
  risk_flags: string[];
  why_this_is_safer: string;
}

type Step = "input" | "select-intent" | "result";

const FALLBACK_INTENTS = [
  "Set a boundary",
  "Ask for clarification",
  "Acknowledge without engaging",
  "General neutral response",
];

export default function CommunicationShield() {
  const { user } = useAuth();
  const { profile, refetch: refetchProfile } = useProfile();
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

  const handleSubmitMessage = async () => {
    const msg = inputMessage.trim();
    if (!msg || !user) return;

    if ((profile?.message_rewrites_used ?? 0) >= (profile?.message_rewrites_limit ?? 250)) {
      toast({ title: "Limit reached", description: "You've used all your message rewrites.", variant: "destructive" });
      return;
    }

    setSubmittedMessage(msg);
    setInputMessage("");
    setStep("select-intent");
    setResult(null);
    setCommunicationContext("");
    setShowOtherInput(false);
    setOtherText("");

    // On mobile, show fallback intents immediately; replace if dynamic ones arrive within 3s
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
      } catch {
        // Keep fallback intents already shown
      }
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

  const handleSelectIntent = async (option: string) => {
    setCommunicationContext(option);
    setShowOtherInput(false);
    setStep("result");
    setLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("rewrite-message", {
        body: {
          message: submittedMessage,
          mode,
          original_context: mode === "respond" ? submittedMessage : undefined,
          communication_context: option,
        },
      });
      if (error) throw error;

      const aiResult: AIResult = data;
      setResult(aiResult);

      await supabase.from("message_rewrites").insert({
        user_id: user!.id,
        original_message: submittedMessage,
        rewritten_message: aiResult.primary_response,
        tone_assessment: aiResult.tone_assessment,
        risk_flags: aiResult.risk_flags,
        mode,
      });

      await supabase
        .from("profiles")
        .update({ message_rewrites_used: (profile?.message_rewrites_used ?? 0) + 1 })
        .eq("user_id", user!.id);

      refetchProfile();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to generate response", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleOtherSubmit = () => {
    const text = otherText.trim();
    if (text) handleSelectIntent(text);
  };

  const handleRegenerate = () => {
    if (communicationContext && submittedMessage) {
      handleSelectIntent(communicationContext);
    }
  };

  const copyResult = () => {
    if (result?.primary_response) {
      navigator.clipboard.writeText(result.primary_response);
      toast({ title: "Copied", description: "Primary response copied to clipboard." });
    }
  };

  const handleStartOver = () => {
    setStep("input");
    setSubmittedMessage("");
    setResult(null);
    setCommunicationContext("");
    setIntentOptions([]);
    setShowOtherInput(false);
    setOtherText("");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleBackToCompose = () => {
    setStep("select-intent");
    setResult(null);
    setLoading(false);
  };

  const hasResult = !!result;

  // ─── MOBILE: Two-screen sequential flow ───
  if (isMobile) {
    const showResultScreen = step === "result";

    if (showResultScreen) {
      // ── Mobile Screen 2: Court-Safe Response ──
      return (
        <div className="flex flex-col h-full">
          {/* Fixed header with back button */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
            <button
              onClick={handleBackToCompose}
              className="h-9 w-9 rounded-full border border-border flex items-center justify-center text-primary"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-semibold text-foreground">Court-Safe Response</h1>
          </div>

          {/* Scrollable content area */}
          <div className="flex-1 overflow-auto px-4 py-4 space-y-5">
            {/* Original message + intent */}
            <div>
              <p className="text-muted-foreground text-sm font-medium mb-1">Original Message:</p>
              <p className="text-foreground text-sm whitespace-pre-wrap">{submittedMessage}</p>
            </div>

            {communicationContext && (
              <div>
                <p className="text-muted-foreground text-sm font-medium mb-1">Response Intent:</p>
                <p className="text-foreground text-sm">{communicationContext}</p>
              </div>
            )}

            <div className="h-px bg-border" />

            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Generating response...
              </div>
            ) : result ? (
              <>
                <div>
                  <p className="font-semibold text-foreground mb-1">Court-Safe Response:</p>
                  <p className="text-foreground text-sm whitespace-pre-wrap">{result.primary_response}</p>
                </div>

                <div className="h-px bg-border" />

                <div>
                  <p className="text-muted-foreground text-sm font-medium mb-1">Shorter Version:</p>
                  <p className="text-foreground text-sm whitespace-pre-wrap">{result.shorter_response}</p>
                </div>

                <div className="h-px bg-border" />

                <div>
                  <p className="text-muted-foreground text-sm font-medium mb-1">Firmer Version:</p>
                  <p className="text-foreground text-sm whitespace-pre-wrap">{result.firmer_response}</p>
                </div>

                <div className="h-px bg-border" />

                <div>
                  <p className="text-muted-foreground text-sm font-medium mb-1">Tone Assessment:</p>
                  <p className="text-foreground text-sm">{result.tone_assessment}</p>
                </div>

                <div>
                  <p className="text-muted-foreground text-sm font-medium mb-1">Risk Flags:</p>
                  <ul className="space-y-1">
                    {result.risk_flags.map((flag, i) => (
                      <li key={i} className="text-foreground text-sm">• {flag}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="text-muted-foreground text-sm font-medium mb-1">Why This Is Safer:</p>
                  <p className="text-foreground text-sm whitespace-pre-wrap">{result.why_this_is_safer}</p>
                </div>
              </>
            ) : null}
          </div>

          {/* Fixed bottom action bar */}
          <div className="border-t border-border px-4 py-3 flex items-center justify-between bg-background shrink-0">
            <button
              onClick={handleRegenerate}
              disabled={!hasResult || loading}
              className="flex items-center gap-2 text-primary text-sm hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw className="h-4 w-4" />
              Generate again
            </button>
            <button
              onClick={copyResult}
              disabled={!hasResult}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-full text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Copy className="h-4 w-4" />
              Copy Response
            </button>
          </div>
        </div>
      );
    }

    // ── Mobile Screen 1: Compose ──
    return (
      <div className="flex flex-col h-full overflow-hidden">

        {/* Fixed: Response Mode bar with help icon */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">{mode === "respond" ? "Response Mode" : "Rewrite Mode"}</span>
            {step !== "input" && (
              <button
                onClick={handleStartOver}
                className="flex items-center gap-1 text-primary text-xs hover:underline ml-2"
              >
                <RefreshCw className="h-3 w-3" />
                Start Over
              </button>
            )}
          </div>
          <button
            onClick={() => setShowDirections((v) => !v)}
            className="h-7 w-7 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <Info className="h-4 w-4" />
          </button>
        </div>

        {/* Directions popup */}
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

        {/* Scrollable: Original Message + intent options */}
        <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
          {/* Original Message panel */}
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-1">Original Message</h2>
            <div className="h-px bg-border mb-3" />

            {submittedMessage ? (
              <div className="space-y-3">
                <p className="text-foreground text-sm whitespace-pre-wrap">{submittedMessage}</p>
                {communicationContext && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Response Intent</p>
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
                    <p>DUF will rewrite it to avoid conflict and reduce escalation.</p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Intent options - after message submitted */}
          {step === "select-intent" && (
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

        {/* Fixed bottom: Mode toggle + Input + Submit */}
        <div className="border-t border-border bg-background px-4 py-3 space-y-3 shrink-0">
          {/* Mode toggle */}
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

          {/* Input bar */}
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

  // ─── DESKTOP: Side-by-side layout (unchanged) ───
  return (
    <div className="flex flex-col h-full">
      {/* Mode label + directions strip */}
      <div className="border-b border-border">
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
          {step !== "input" && (
            <button
              onClick={handleStartOver}
              className="flex items-center gap-1.5 text-primary hover:underline text-xs"
            >
              <RefreshCw className="h-3 w-3" />
              Start Over
            </button>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-row gap-0 overflow-auto">
        {/* Left panel */}
        <div className="flex-1 p-6 flex flex-col border-r border-border gap-4">
          {/* Original Message */}
          <div className="bg-card rounded-lg border border-border flex-1 flex flex-col p-5">
            <h2 className="text-lg font-semibold text-foreground mb-1">Original Message</h2>
            <div className="h-px bg-border mb-3" />

            {submittedMessage ? (
              <div className="flex-1 space-y-4">
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Message:</p>
                  <p className="text-foreground text-sm whitespace-pre-wrap">{submittedMessage}</p>
                </div>
                {communicationContext && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Response Intent</p>
                    <p className="text-foreground text-sm">
                      {intentOptions.includes(communicationContext)
                        ? communicationContext
                        : `Custom: "${communicationContext}"`}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 text-muted-foreground text-sm space-y-1">
                {mode === "respond" ? (
                  <>
                    <p>Paste the message you received below.</p>
                    <p>DUF will generate a neutral, court-safe response.</p>
                  </>
                ) : (
                  <>
                    <p>Paste the message you plan to send below.</p>
                    <p>DUF will rewrite it to avoid conflict and reduce escalation.</p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Communication Context - only after message submitted */}
          {step !== "input" && (
            <div>
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
        </div>

        {/* Arrow separator */}
        <div className="flex items-center -mx-3 z-10">
          <div className="text-muted-foreground">→</div>
        </div>

        {/* Right panel - Court-Safe Response */}
        <div className="flex-1 p-6 flex flex-col">
          <div className="bg-card rounded-lg border border-primary/30 flex-1 flex flex-col p-5">
            <h2 className="text-lg font-semibold text-primary mb-1">Court-Safe Response</h2>
            <div className="h-px bg-border mb-3" />

            {result ? (
              <div className="flex-1 space-y-4 text-sm overflow-auto">
                <ResponseSection label="Primary Response" content={result.primary_response} />
                <ResponseSection label="Shorter Version" content={result.shorter_response} />
                <ResponseSection label="Firmer Version" content={result.firmer_response} />
                <ResponseSection label="Tone Assessment" content={result.tone_assessment} />
                <div>
                  <p className="text-muted-foreground mb-1">Risk Flags</p>
                  <div className="h-px bg-border mb-2" />
                  <ul className="space-y-1">
                    {result.risk_flags.map((flag, i) => (
                      <li key={i} className="text-foreground">• {flag}</li>
                    ))}
                  </ul>
                </div>
                <ResponseSection label="Why This Is Safer" content={result.why_this_is_safer} />
              </div>
            ) : loading ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-muted-foreground text-sm">Generating response...</p>
              </div>
            ) : (
              <div className="flex-1 text-muted-foreground text-sm space-y-4">
                <PlaceholderSection label="Primary Response" placeholder="[ primary response ]" />
                <PlaceholderSection label="Shorter Version" placeholder="[ shorter version ]" />
                <PlaceholderSection label="Firmer Version" placeholder="[ firmer version ]" />
                <PlaceholderSection label="Tone Assessment" placeholder="Neutral / De-escalated" />
                <div>
                  <p>Risk Flags</p>
                  <div className="h-px bg-border my-1" />
                  <p>• Removed accusatory language</p>
                  <p>• Avoided escalation triggers</p>
                </div>
                <PlaceholderSection label="Why This Is Safer" placeholder="[ explanation ]" />
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
              <button
                onClick={handleRegenerate}
                disabled={!hasResult || loading}
                className="flex items-center gap-2 text-primary text-sm hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
              >
                <RefreshCw className="h-4 w-4" />
                Generate again
              </button>
              <button
                onClick={copyResult}
                disabled={!hasResult}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Copy className="h-4 w-4" />
                Copy Response
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="border-t border-border px-6 py-4 space-y-3">
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
            className="flex-1 bg-card border border-border rounded-full px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
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

function ResponseSection({ label, content }: { label: string; content: string }) {
  return (
    <div>
      <p className="text-muted-foreground mb-1">{label}</p>
      <div className="h-px bg-border mb-2" />
      <p className="text-foreground whitespace-pre-wrap">{content}</p>
    </div>
  );
}

function PlaceholderSection({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <div>
      <p>{label}</p>
      <div className="h-px bg-border my-1" />
      <p>{placeholder}</p>
    </div>
  );
}
