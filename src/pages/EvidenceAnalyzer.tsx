import { useState } from "react";
import { FileSearch, RefreshCw, AlertTriangle, CheckCircle, Info, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "@/hooks/use-toast";
import { UpgradeModal } from "@/components/UpgradeModal";

interface Finding {
  finding: string;
  severity: "low" | "medium" | "high" | "critical";
}

interface AnalysisResult {
  summary: string;
  tone_analysis: string;
  key_findings: Finding[];
  red_flags: string[];
  recommended_actions: string[];
  legal_relevance: string;
  word_count: number;
}

const ANALYSIS_TYPES = [
  { value: "general", label: "General Analysis" },
  { value: "tone", label: "Tone Analysis" },
  { value: "timeline", label: "Timeline Extraction" },
  { value: "contradiction", label: "Contradiction Check" },
  { value: "legal", label: "Legal Relevance" },
];

const severityColors: Record<string, string> = {
  low: "text-muted-foreground",
  medium: "text-yellow-600",
  high: "text-orange-600",
  critical: "text-destructive",
};

const severityBg: Record<string, string> = {
  low: "bg-muted",
  medium: "bg-yellow-500/10",
  high: "bg-orange-500/10",
  critical: "bg-destructive/10",
};

export default function EvidenceAnalyzer() {
  const { user } = useAuth();
  const { evidenceExhausted, refetch: refetchProfile } = useProfile();
  const [content, setContent] = useState("");
  const [analysisType, setAnalysisType] = useState("general");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const handleAnalyze = async () => {
    const text = content.trim();
    if (!text || !user) return;

    if (evidenceExhausted) {
      setShowUpgradeModal(true);
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("evidence-analyzer", {
        body: { content: text, analysis_type: analysisType },
      });

      if (error) throw error;

      if (data?.error) {
        toast({ title: "Error", description: data.error, variant: "destructive" });
        if (data.error.includes("limit") || data.error.includes("used all")) {
          setShowUpgradeModal(true);
        }
        return;
      }

      setResult(data as AnalysisResult);
      refetchProfile();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to analyze evidence", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <FileSearch className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Evidence Analyzer</h1>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Paste text evidence for AI-powered analysis — tone, contradictions, legal relevance, and more.
        </p>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-auto">
        {/* Left: Input */}
        <div className="flex-1 p-6 flex flex-col gap-4 border-r border-border">
          {/* Analysis type selector */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Analysis Type</label>
            <div className="flex flex-wrap gap-2">
              {ANALYSIS_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setAnalysisType(t.value)}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                    analysisType === t.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border text-foreground hover:bg-secondary"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Text input */}
          <div className="flex-1 flex flex-col">
            <label className="text-sm font-medium text-foreground mb-2">Evidence Text</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste the text message, email, or document content you want to analyze..."
              className="flex-1 min-h-[200px] bg-card border border-border rounded-lg p-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary resize-none"
            />
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-muted-foreground">
                {content.trim().split(/\s+/).filter(Boolean).length} words
              </span>
              <button
                onClick={handleAnalyze}
                disabled={loading || !content.trim()}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <FileSearch className="h-4 w-4" />
                    Analyze Evidence
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right: Results */}
        <div className="flex-1 p-6 flex flex-col overflow-auto">
          {result ? (
            <div className="space-y-5">
              {/* Summary */}
              <Section title="Summary" icon={<Info className="h-4 w-4" />}>
                <p className="text-sm text-foreground">{result.summary}</p>
              </Section>

              {/* Tone */}
              <Section title="Tone Analysis" icon={<Shield className="h-4 w-4" />}>
                <p className="text-sm text-foreground font-medium">{result.tone_analysis}</p>
              </Section>

              {/* Key Findings */}
              <Section title="Key Findings" icon={<CheckCircle className="h-4 w-4" />}>
                <div className="space-y-2">
                  {result.key_findings.map((f, i) => (
                    <div key={i} className={`flex items-start gap-3 p-2.5 rounded-md ${severityBg[f.severity]}`}>
                      <span className={`text-xs font-semibold uppercase shrink-0 mt-0.5 ${severityColors[f.severity]}`}>
                        {f.severity}
                      </span>
                      <p className="text-sm text-foreground">{f.finding}</p>
                    </div>
                  ))}
                </div>
              </Section>

              {/* Red Flags */}
              {result.red_flags.length > 0 && (
                <Section title="Red Flags" icon={<AlertTriangle className="h-4 w-4 text-destructive" />}>
                  <ul className="space-y-1.5">
                    {result.red_flags.map((flag, i) => (
                      <li key={i} className="text-sm text-foreground flex items-start gap-2">
                        <span className="text-destructive mt-0.5">•</span>
                        {flag}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {/* Recommended Actions */}
              <Section title="Recommended Actions" icon={<CheckCircle className="h-4 w-4 text-primary" />}>
                <ul className="space-y-1.5">
                  {result.recommended_actions.map((action, i) => (
                    <li key={i} className="text-sm text-foreground flex items-start gap-2">
                      <span className="text-primary mt-0.5">→</span>
                      {action}
                    </li>
                  ))}
                </ul>
              </Section>

              {/* Legal Relevance */}
              <Section title="Legal Relevance" icon={<Shield className="h-4 w-4" />}>
                <p className="text-sm text-foreground">{result.legal_relevance}</p>
              </Section>

              <p className="text-xs text-muted-foreground text-right">{result.word_count} words analyzed</p>
            </div>
          ) : loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Analyzing evidence...
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm text-center">
              <div className="space-y-2">
                <FileSearch className="h-8 w-8 mx-auto opacity-40" />
                <p>Paste your evidence text and click "Analyze Evidence" to get started.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <UpgradeModal
        open={showUpgradeModal}
        onOpenChange={setShowUpgradeModal}
        lockedFeature="Evidence Analyzer"
      />
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="h-px bg-border mb-2" />
      {children}
    </div>
  );
}
