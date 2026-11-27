"use client";

import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { deleteStudentAccountAction } from "@/actions/students";
import type { ResetPasswordState } from "@/lib/types";
import { Alert, buttonSecondary } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initialState: ResetPasswordState = { status: "idle" };

export function DeleteAccountDialog({
  studentId,
  studentName,
  locale,
}: {
  studentId: string;
  studentName: string;
  locale: string;
}) {
  const t = useTranslations("admin.students");
  const tc = useTranslations("common");
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
        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
      >
        {t("deleteAccount")}
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-0 text-[var(--ink)] shadow-2xl backdrop:bg-slate-950/60 "
        aria-labelledby={`delete-title-${studentId}`}
      >
        {open ? (
          <div className="p-6">
            <h2 id={`delete-title-${studentId}`} className="text-lg font-semibold text-[var(--ink)]">
              {t("deleteAccountTitle")}
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">{t("deleteConfirm", { name: studentName })}</p>
            <DeleteForm studentId={studentId} locale={locale} onClose={() => dialogRef.current?.close()} />
          </div>
        ) : null}
      </dialog>
    </>
  );
}

function DeleteForm({ studentId, locale, onClose }: { studentId: string; locale: string; onClose: () => void }) {
  const t = useTranslations("admin.students");
  const tc = useTranslations("common");
  const [state, formAction] = useActionState(deleteStudentAccountAction, initialState);

  return (
    <form action={formAction} className="mt-5 space-y-4">
      <input type="hidden" name="student_id" value={studentId} />
      <input type="hidden" name="locale" value={locale} />

      {state.status === "error" ? <Alert>{state.error}</Alert> : null}
      {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}

      {state.status === "success" ? (
        <div className="flex justify-end pt-1">
          <button type="button" onClick={onClose} className={buttonSecondary}>
            {tc("close")}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={buttonSecondary}>
            {tc("cancel")}
          </button>
          <SubmitButton idle={t("deleteAccount")} pendingLabel={t("deleting")} />
        </div>
      )}
    </form>
  );
}
