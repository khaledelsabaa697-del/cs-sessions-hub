"use client";

import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { resetPasswordAction } from "@/actions/students";
import type { ResetPasswordState } from "@/lib/types";
import { Alert, buttonPrimary, buttonSecondary, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initialState: ResetPasswordState = { status: "idle" };

function randomPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function ResetPasswordDialog({
  studentId,
  studentName,
  locale,
}: {
  studentId: string;
  studentName: string;
  locale: string;
}) {
  const t = useTranslations("admin.students");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  function openDialog() {
    setOpen(true);
    dialogRef.current?.showModal();
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary-600 transition hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-500/10"
      >
        {t("resetPassword")}
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-0 text-[var(--ink)] shadow-2xl backdrop:bg-slate-950/60 "
        aria-labelledby={`reset-title-${studentId}`}
      >
        {open ? (
          <div className="p-6">
            <h2 id={`reset-title-${studentId}`} className="text-lg font-semibold text-[var(--ink)]">
              {t("resetTitle")}
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">{t("resetHint", { name: studentName })}</p>
            <ResetForm studentId={studentId} locale={locale} onClose={() => dialogRef.current?.close()} />
          </div>
        ) : null}
      </dialog>
    </>
  );
}

function ResetForm({ studentId, locale, onClose }: { studentId: string; locale: string; onClose: () => void }) {
  const t = useTranslations("admin.students");
  const tc = useTranslations("common");
  const [state, formAction] = useActionState(resetPasswordAction, initialState);
  const [password, setPassword] = useState("");

  return (
    <form action={formAction} className="mt-5 space-y-4">
      <input type="hidden" name="student_id" value={studentId} />
      <input type="hidden" name="locale" value={locale} />

      <div>
        <label htmlFor={`password-${studentId}`} className={labelClass}>
          {t("newPassword")}
        </label>
        <div className="flex gap-2">
          <input
            id={`password-${studentId}`}
            name="password"
            type="text"
            required
            dir="ltr"
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => setPassword(randomPassword())}
            className={`${buttonSecondary} shrink-0 px-3`}
          >
            {t("generatePassword")}
          </button>
        </div>
      </div>

      {state.status === "error" ? <Alert>{state.error}</Alert> : null}
      {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}

      {state.status === "success" ? (
        <div className="flex justify-end pt-1">
          <button type="button" onClick={onClose} className={buttonPrimary}>
            {tc("close")}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={buttonSecondary}>
            {tc("cancel")}
          </button>
          <SubmitButton idle={t("reset")} pendingLabel={t("resetting")} />
        </div>
      )}
    </form>
  );
}
