"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Alert, inputClass, labelClass } from "@/components/ui";

type Step = "idle" | "codeSent";

export function PasswordChangeForm({ locale }: { locale: string }) {
  const t = useTranslations("profile");
  const ta = useTranslations("auth");
  const supabase = createClient();

  const [step, setStep] = useState<Step>("idle");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function startCooldown(seconds: number) {
    setCooldown(seconds);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function mapError(err: { message?: string } | null): string {
    const msg = (err?.message ?? "").toLowerCase();
    if (!msg) return t("errors.reauthFailed");
    if (msg.includes("rate") || msg.includes("too many")) return t("errors.rateLimited");
    if (msg.includes("expired")) return t("errors.expiredCode");
    if (msg.includes("invalid") || msg.includes("otp") || msg.includes("token")) return t("errors.invalidCode");
    if (msg.includes("password") && (msg.includes("weak") || msg.includes("short") || msg.includes("least")))
      return t("errors.weakPassword");
    if (msg.includes("password")) return t("errors.weakPassword");
    return t("errors.reauthFailed");
  }

  async function handleSendCode() {
    setError(null);
    setSending(true);
    const { error: err } = await supabase.auth.reauthenticate();
    setSending(false);
    if (err) {
      setError(mapError(err));
      return;
    }
    setStep("codeSent");
    setCode("");
    setNewPassword("");
    setConfirmPassword("");
    startCooldown(60);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (code.trim().length !== 8) {
      setError(t("errors.invalidCode"));
      return;
    }
    if (newPassword.length < 8) {
      setError(t("errors.weakPassword"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(ta("errors.passwordMismatch"));
      return;
    }

    setUpdating(true);
    const { error: err } = await supabase.auth.updateUser({
      password: newPassword,
      nonce: code.trim(),
    });
    setUpdating(false);

    if (err) {
      setError(mapError(err));
      return;
    }

    setSuccess(true);
    setStep("idle");
    setCode("");
    setNewPassword("");
    setConfirmPassword("");
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setCooldown(0);
  }

  const codeComplete = code.trim().length === 8;

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--ink-soft)]">{t("changePasswordHint")}</p>

      {success ? <Alert tone="success">{t("passwordChanged")}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}

      {step === "idle" ? (
        <button
          type="button"
          onClick={handleSendCode}
          disabled={sending}
          aria-busy={sending}
          className="rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-500 disabled:opacity-60"
        >
          {sending ? t("sendingCode") : t("sendVerificationCode")}
        </button>
      ) : (
        <form onSubmit={handleUpdate} className="space-y-4">
          <div>
            <label htmlFor="verification_code" className={labelClass}>
              {t("verificationCode")}
            </label>
            <input
              id="verification_code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{8}"
              maxLength={8}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="00000000"
              className={`${inputClass} text-center font-mono text-lg tracking-[0.4em]`}
            />
            <p className="mt-1.5 text-xs text-[var(--ink-muted)]">{t("codeHint")}</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSendCode}
              disabled={sending || cooldown > 0}
              className="text-sm font-medium text-primary-600 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-primary-400"
            >
              {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : sending ? t("sendingCode") : t("resendCode")}
            </button>
          </div>

          {codeComplete ? (
            <>
              <div>
                <label htmlFor="new_password" className={labelClass}>
                  {ta("newPassword")}
                </label>
                <input
                  id="new_password"
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="confirm_new_password" className={labelClass}>
                  {ta("confirmNewPassword")}
                </label>
                <input
                  id="confirm_new_password"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClass}
                />
              </div>

              <button
                type="submit"
                disabled={updating}
                aria-busy={updating}
                className="rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-500 disabled:opacity-60"
              >
                {updating ? t("updatingPassword") : t("updatePassword")}
              </button>
            </>
          ) : null}
        </form>
      )}
    </div>
  );
}
