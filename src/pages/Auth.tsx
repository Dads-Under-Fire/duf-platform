import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import dufLogo from "@/assets/dufplatform.png";
import TurnstileWidget from "@/components/TurnstileWidget";

const TURNSTILE_ENABLED = import.meta.env.VITE_ENABLE_TURNSTILE === "true";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken(null);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (TURNSTILE_ENABLED) {
        if (!turnstileToken) {
          toast({ title: "Please complete the CAPTCHA", variant: "destructive" });
          setLoading(false);
          return;
        }

        const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
          "verify-turnstile",
          { body: { token: turnstileToken } }
        );

        if (verifyError || !verifyData?.success) {
          toast({
            title: "CAPTCHA verification failed",
            description: verifyData?.error || "Please try again.",
            variant: "destructive",
          });
          setTurnstileToken(null);
          setLoading(false);
          return;
        }
      }

      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast({ title: "Check your email", description: "We sent you a confirmation link." });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const submitDisabled = loading || (TURNSTILE_ENABLED && !turnstileToken);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-2">
          <img src={dufLogo} alt="DUF Platform" className="h-10" />
          <p className="text-muted-foreground text-sm text-center">
            Documentation and communication assistance for custody disputes.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-card border-border"
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="bg-card border-border"
          />

          {TURNSTILE_ENABLED && (
            <TurnstileWidget
              onVerify={handleTurnstileVerify}
              onExpire={handleTurnstileExpire}
              onError={handleTurnstileExpire}
            />
          )}

          <Button type="submit" className="w-full" disabled={submitDisabled}>
            {loading ? "Loading..." : isLogin ? "Sign In" : "Sign Up"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            onClick={() => { setIsLogin(!isLogin); setTurnstileToken(null); }}
            className="text-primary hover:underline"
          >
            {isLogin ? "Sign Up" : "Sign In"}
          </button>
        </p>

        <p className="text-xs text-muted-foreground text-center border-t border-border pt-4">
          The DUF Platform provides documentation and communication assistance.
          It does not provide legal advice and does not replace an attorney.
        </p>
      </div>
    </div>
  );
}
