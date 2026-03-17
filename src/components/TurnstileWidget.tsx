import { useEffect, useRef, useCallback, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
}

let scriptLoaded = false;
let scriptLoading = false;
const loadCallbacks: (() => void)[] = [];

function loadTurnstileScript(): Promise<void> {
  if (scriptLoaded) return Promise.resolve();
  return new Promise((resolve) => {
    loadCallbacks.push(resolve);
    if (scriptLoading) return;
    scriptLoading = true;
    window.onTurnstileLoad = () => {
      scriptLoaded = true;
      loadCallbacks.forEach((cb) => cb());
      loadCallbacks.length = 0;
    };
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit";
    script.async = true;
    document.head.appendChild(script);
  });
}

export default function TurnstileWidget({ onVerify, onExpire, onError }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [ready, setReady] = useState(scriptLoaded);

  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile || !siteKey) return;
    if (widgetIdRef.current !== null) {
      window.turnstile.remove(widgetIdRef.current);
    }
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: onVerify,
      "expired-callback": onExpire,
      "error-callback": onError,
      theme: "dark",
    });
  }, [siteKey, onVerify, onExpire, onError]);

  useEffect(() => {
    loadTurnstileScript().then(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) renderWidget();
    return () => {
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [ready, renderWidget]);

  if (!siteKey) {
    return <p className="text-xs text-destructive">Turnstile site key not configured.</p>;
  }

  return <div ref={containerRef} className="flex justify-center" />;
}
