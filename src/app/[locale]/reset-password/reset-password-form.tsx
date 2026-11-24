"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Alert, inputClass, labelClass } from "@/components/ui";

export function ResetPasswordForm({
  locale,
  code,
}: {
  locale: string;
  code: string;
}) {
  const t = useTranslations("auth");
  const router = useRouter();
  const supabase = createClient();

  const [ready, setReady] = useState(false);
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function exchange() {
      if (!code) {
        setExchangeError(t("errors.invalidResetLink"));
        return;
      }
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (cancelled) return;
      if (error) {
        setExchangeError(t("errors.invalidOrExpiredCode"));
        return;
      }
      setReady(true);
    }
    exchange();
    return () => {
      cancelled = true;
    };
  }, [code, supabase, t]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t("errors.password"));
      return;
    }
    if (password !== confirm) {
      setError(t("errors.passwordMismatch"));
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      setError(error.message || t("errors.resetFailed"));
      return;
    }
    setSuccess(true);
    // Sign out so the user signs in fresh with the new password.
    await supabase.auth.signOut();
    setTimeout(() => {
      router.push(`/${locale}/login?reset=1`);
    }, 1500);
  }

  if (exchangeError) {
    return (
      <Alert tone="error">
        {exchangeError}
        <div className="mt-3">
          <a
            href={`/${locale}/login`}
            className="text-sm font-medium text-primary-600 underline-offset-2 hover:underline dark:text-primary-400"
          >
            {t("backToLogin")}
          </a>
        </div>
      </Alert>
    );
  }

  if (!ready) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {t("verifying")}…
      </p>
    );
  }

  if (success) {
    return <Alert tone="success">{t("passwordUpdated")}</Alert>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="new_password" className={labelClass}>
          {t("newPassword")}
        </label>
        <input
          id="new_password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="confirm_new_password" className={labelClass}>
          {t("confirmNewPassword")}
        </label>
        <input
          id="confirm_new_password"
          type="password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputClass}
        />
      </div>

      {error ? <Alert>{error}</Alert> : null}

      <button
        type="submit"
        disabled={submitting}
        aria-busy={submitting}
        className="w-full rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-500 disabled:opacity-60"
      >
        {submitting ? t("resetting") : t("resetPassword")}
      </button>
    </form>
  );
}
