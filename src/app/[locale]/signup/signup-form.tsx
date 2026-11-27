"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { signupAction } from "./actions";
import type { SignupState } from "@/lib/types";
import { Alert, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { TurnstileWidget } from "@/components/turnstile-widget";
import Link from "next/link";
import { turnstileSiteKey } from "@/lib/env-client";

const initialState: SignupState = { status: "idle" };

export function SignupForm({ locale }: { locale: string }) {
  const t = useTranslations("auth");
  const [state, formAction] = useActionState(signupAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const siteKey = turnstileSiteKey();
  const captchaRequired = Boolean(siteKey);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  const handleTurnstileVerify = useCallback((token: string | null) => {
    setTurnstileToken(token);
  }, []);

  useEffect(() => {
    if (state.status === "error") {
      setTurnstileToken(null);
      setTurnstileResetKey((key) => key + 1);
    }
  }, [state]);

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="turnstile_token" value={turnstileToken ?? ""} />

      {/* Honeypot field - hidden from humans, filled by bots */}
      <div style={{ display: "none" }} aria-hidden="true">
        <label htmlFor="website" className={labelClass}>
          Website
        </label>
        <input type="text" id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <label htmlFor="full_name" className={labelClass}>
          {t("fullName")}
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          autoComplete="name"
          maxLength={80}
          placeholder={t("fullNamePlaceholder")}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="username" className={labelClass}>
          {t("username")}
        </label>
        <input
          id="username"
          name="username"
          type="text"
          required
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          dir="ltr"
          maxLength={20}
          pattern="[a-z0-9_]{3,20}"
          placeholder={t("usernamePlaceholder")}
          className={inputClass}
        />
        <p className="mt-1.5 text-xs text-[var(--ink-muted)]">{t("usernameHint")}</p>
      </div>

      <div>
        <label htmlFor="email" className={labelClass}>
          {t("email")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          dir="ltr"
          maxLength={254}
          placeholder={t("emailPlaceholder")}
          className={inputClass}
        />
        <p className="mt-1.5 text-xs text-[var(--ink-muted)]">{t("emailHint")}</p>
      </div>

      <div>
        <label htmlFor="password" className={labelClass}>
          {t("password")}
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="new-password"
            dir="ltr"
            maxLength={72}
            placeholder={t("passwordPlaceholder")}
            className={`${inputClass} pr-10`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute inset-y-0 end-3 flex items-center text-[var(--ink-muted)] hover:text-[var(--ink-soft)]"
            aria-label={showPassword ? t("hidePassword") : t("showPassword")}
          >
            {showPassword ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5"
                aria-hidden="true"
              >
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5"
                aria-hidden="true"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-[var(--ink-muted)]">{t("passwordHint")}</p>
      </div>

      <div>
        <label htmlFor="confirm_password" className={labelClass}>
          {t("confirmPassword")}
        </label>
        <input
          id="confirm_password"
          name="confirm_password"
          type={showPassword ? "text" : "password"}
          required
          autoComplete="new-password"
          dir="ltr"
          maxLength={72}
          placeholder={t("confirmPasswordPlaceholder")}
          className={inputClass}
        />
      </div>

      {/* Cloudflare Turnstile CAPTCHA: renders nothing when no site key is configured. */}
      <TurnstileWidget onVerify={handleTurnstileVerify} resetKey={turnstileResetKey} />

      {state.status === "error" ? <Alert>{state.error}</Alert> : null}

      <SubmitButton
        idle={t("signUp")}
        pendingLabel={t("signingUp")}
        className="w-full"
        disabled={captchaRequired && !turnstileToken}
      />

      <p className="mt-6 text-center text-sm text-[var(--ink-soft)] ">
        {t("alreadyHaveAccount")}
        <Link href={`/${locale}/login`} className="ml-1 font-semibold underline underline-offset-2 hover:no-underline">
          {t("signIn")}
        </Link>
      </p>
    </form>
  );
}
