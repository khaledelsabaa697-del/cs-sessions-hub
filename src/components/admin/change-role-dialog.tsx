"use client";

import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { changeUserRoleAction } from "@/actions/students";
import type { ResetPasswordState } from "@/lib/types";
import { Alert, buttonPrimary, buttonSecondary, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initialState: ResetPasswordState = { status: "idle" };

export function ChangeRoleDialog({
  studentId,
  studentName,
  currentRole,
  locale,
}: {
  studentId: string;
  studentName: string;
  currentRole: string;
  locale: string;
}) {
  const t = useTranslations("admin.students");
  const tc = useTranslations("common");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState(currentRole);

  function openDialog() {
    setRole(currentRole);
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
        {t("changeRole")}
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-0 text-[var(--ink)] shadow-2xl backdrop:bg-slate-950/60 "
        aria-labelledby={`role-title-${studentId}`}
      >
        {open ? (
          <div className="p-6">
            <h2 id={`role-title-${studentId}`} className="text-lg font-semibold text-[var(--ink)]">
              {t("changeRoleTitle")}
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">{t("changeRoleHint", { name: studentName })}</p>
            <RoleForm
              studentId={studentId}
              locale={locale}
              role={role}
              setRole={setRole}
              onClose={() => dialogRef.current?.close()}
            />
          </div>
        ) : null}
      </dialog>
    </>
  );
}

function RoleForm({
  studentId,
  locale,
  role,
  setRole,
  onClose,
}: {
  studentId: string;
  locale: string;
  role: string;
  setRole: (value: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("admin.students");
  const tc = useTranslations("common");
  const [state, formAction] = useActionState(changeUserRoleAction, initialState);

  return (
    <form action={formAction} className="mt-5 space-y-4">
      <input type="hidden" name="student_id" value={studentId} />
      <input type="hidden" name="locale" value={locale} />

      <div>
        <label htmlFor={`role-${studentId}`} className={labelClass}>
          {t("changeRole")}
        </label>
        <select
          id={`role-${studentId}`}
          name="new_role"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          className={inputClass}
        >
          <option value="student">{t("roleStudent")}</option>
          <option value="teacher">{t("roleTeacher")}</option>
          <option value="hr">{t("roleHr")}</option>
          <option value="admin">{t("roleAdmin")}</option>
        </select>
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
          <SubmitButton idle={t("updateRole")} pendingLabel={t("updatingRole")} />
        </div>
      )}
    </form>
  );
}
