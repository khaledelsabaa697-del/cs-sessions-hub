"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { turnstileSiteKey } from "@/lib/env-client";

const SCRIPT_ID = "turnstile-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const LOAD_TIMEOUT_MS = 10_000;

interface TurnstileWindow extends Window {
  turnstile?: {
    render: (
      container: HTMLElement,
      options: {
        sitekey: string;
        theme?: string;
        language?: string;
        callback?: (token: string) => void;
        "expired-callback"?: () => void;
        "error-callback"?: (error: unknown) => void;
      },
    ) => number;
    remove: (widgetId: number) => void;
    reset: (widgetId: number) => void;
  };
}

interface TurnstileWidgetProps {
  onVerify: (token: string | null) => void;
  theme?: "light" | "dark" | "auto";
  language?: string;
  resetKey?: number;
}

type ScriptStatus = "loading" | "ready" | "error";

function getTurnstileWindow(): TurnstileWindow | undefined {
  if (typeof window === "undefined") return undefined;
  return window as TurnstileWindow;
}

export function TurnstileWidget({ onVerify, theme = "auto", language, resetKey = 0 }: TurnstileWidgetProps) {
  const t = useTranslations("auth");
  const siteKey = turnstileSiteKey();
  const loadErrorMessage = t("turnstileLoadError");
  const [status, setStatus] = useState<ScriptStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<number | null>(null);
  const mountedRef = useRef(false);
  const firstResetRef = useRef(true);

  const getThemeValue = useCallback(() => {
    if (theme !== "auto") return theme;
    if (typeof document === "undefined") return "light";
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  }, [theme]);

  const getLanguageValue = useCallback(() => {
    if (language) return language;
    if (typeof document === "undefined") return "en";
    return document.documentElement.lang === "ar" ? "ar" : "en";
  }, [language]);

  // Load the Turnstile script only when a site key exists.
  useEffect(() => {
    if (!siteKey || typeof window === "undefined") return;

    const existingApi = getTurnstileWindow()?.turnstile;
    if (existingApi) {
      setStatus("ready");
      return;
    }

    setStatus("loading");

    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    const stopWaiting = () => {
      if (poll) clearInterval(poll);
      if (timeout) clearTimeout(timeout);
    };

    const markReady = () => {
      if (cancelled) return;
      stopWaiting();
      setStatus("ready");
    };

    const markError = () => {
      if (cancelled) return;
      stopWaiting();
      setStatus("error");
    };

    const checkLoaded = () => {
      if (getTurnstileWindow()?.turnstile) markReady();
    };

    script.addEventListener("load", checkLoaded);
    script.addEventListener("error", markError);
    checkLoaded();

    poll = setInterval(checkLoaded, 100);
    timeout = setTimeout(() => {
      if (!getTurnstileWindow()?.turnstile) markError();
    }, LOAD_TIMEOUT_MS);

    return () => {
      cancelled = true;
      stopWaiting();
      script?.removeEventListener("load", checkLoaded);
      script?.removeEventListener("error", markError);
    };
  }, [siteKey, retryNonce]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Render (and re-render on theme/language/retry changes).
  useEffect(() => {
    if (!siteKey || status !== "ready") return;

    const win = getTurnstileWindow();
    const container = containerRef.current;
    if (!win?.turnstile || !container) return;

    if (widgetIdRef.current !== null) {
      try {
        win.turnstile.remove(widgetIdRef.current);
      } catch {
        // ignore
      }
      widgetIdRef.current = null;
    }

    try {
      widgetIdRef.current = win.turnstile.render(container, {
        sitekey: siteKey,
        theme: getThemeValue(),
        language: getLanguageValue(),
        callback: (token: string) => {
          if (!mountedRef.current) return;
          setError(null);
          onVerify(token);
        },
        "expired-callback": () => {
          if (mountedRef.current) onVerify(null);
        },
        "error-callback": (err: unknown) => {
          if (!mountedRef.current) return;
          console.error("[Turnstile] Challenge error:", err);
          setError(loadErrorMessage);
          onVerify(null);
        },
      });
      setError(null);
    } catch (err) {
      console.error("[Turnstile] Render error:", err);
      setError(loadErrorMessage);
      onVerify(null);
    }

    return () => {
      if (widgetIdRef.current !== null) {
        try {
          win.turnstile?.remove(widgetIdRef.current);
        } catch {
          // ignore
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, status, theme, language, retryNonce, onVerify, getThemeValue, getLanguageValue, loadErrorMessage]);

  // Reset the challenge after a failed submit so the user can try again.
  useEffect(() => {
    if (!siteKey) return;
    if (firstResetRef.current) {
      firstResetRef.current = false;
      return;
    }

    const win = getTurnstileWindow();
    if (widgetIdRef.current !== null && win?.turnstile) {
      try {
        win.turnstile.reset(widgetIdRef.current);
      } catch (err) {
        console.error("[Turnstile] Reset error:", err);
      }
    }
    setError(null);
    onVerify(null);
  }, [resetKey, siteKey, onVerify]);

  useEffect(() => {
    if (status === "error") onVerify(null);
  }, [status, onVerify]);

  const handleRetry = useCallback(() => {
    setError(null);
    setStatus("loading");
    onVerify(null);
    if (status === "error") {
      document.getElementById(SCRIPT_ID)?.remove();
    }
    setRetryNonce((value) => value + 1);
  }, [onVerify, status]);

  // No site key: render nothing, require no token and show no error.
  if (!siteKey) {
    return (
      <div
        ref={containerRef}
        className="hidden"
        aria-hidden="true"
        style={{ width: 0, height: 0, overflow: "hidden" }}
      />
    );
  }

  const visibleError = status === "error" ? (error ?? loadErrorMessage) : error;

  return (
    <div>
      <div ref={containerRef} className="cf-turnstile" />
      {visibleError && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2" role="alert">
          <p className="text-xs text-rose-600 dark:text-rose-400">{visibleError}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="text-xs font-semibold text-primary-600 underline underline-offset-2 hover:text-primary-500 dark:text-primary-400"
          >
            {t("retryCaptcha")}
          </button>
        </div>
      )}
    </div>
  );
}
