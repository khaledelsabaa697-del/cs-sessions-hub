"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createStudentAction } from "@/actions/students";
import type { CreateStudentState } from "@/lib/types";
import { Alert, Card, CardHeader, inputClass, labelClass, buttonSecondary } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { CopyButton } from "@/components/copy-button";

const initialState: CreateStudentState = { status: "idle" };

function randomPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function CreateStudentForm({ locale }: { locale: string }) {
  const t = useTranslations("admin.students");
  const [state, formAction] = useActionState(createStudentAction, initialState);
  const [password, setPassword] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <Card>
      <CardHeader title={t("addTitle")} description={t("addSubtitle")} />
      <form ref={formRef} action={formAction} className="space-y-4 p-5" onReset={() => setPassword("")}>
        <input type="hidden" name="locale" value={locale} />

        <div>
          <label htmlFor="full_name" className={labelClass}>
            {t("fullName")}
          </label>
          <input
            id="full_name"
            name="full_name"
            type="text"
            required
            maxLength={80}
            autoComplete="off"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="new_username" className={labelClass}>
            {t("username")}
          </label>
          <input
            id="new_username"
            name="username"
            type="text"
            required
            dir="ltr"
            maxLength={20}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            pattern="[a-z0-9_]{3,20}"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="new_password" className={labelClass}>
            {t("password")}
          </label>
          <div className="flex gap-2">
            <input
              id="new_password"
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
          <p className="mt-1.5 text-xs text-[var(--ink-muted)]">{t("passwordHint")}</p>
        </div>

        {state.status === "error" ? <Alert>{state.error}</Alert> : null}
        {state.status === "success" ? (
          <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">{state.message}</p>
            <p className="text-xs text-emerald-700 dark:text-emerald-300">{t("credentialsHint")}</p>
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-emerald-700 dark:text-emerald-300">{t("username")}</dt>
                <dd className="flex items-center gap-2 font-mono text-emerald-900 dark:text-emerald-100">
                  {state.student.username}
                  <CopyButton value={state.student.username} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-emerald-700 dark:text-emerald-300">{t("studentCode")}</dt>
                <dd className="flex items-center gap-2 font-mono text-emerald-900 dark:text-emerald-100">
                  {state.student.student_code}
                  <CopyButton value={state.student.student_code} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-emerald-700 dark:text-emerald-300">{t("password")}</dt>
                <dd className="flex items-center gap-2 font-mono text-emerald-900 dark:text-emerald-100">
                  {state.password}
                  <CopyButton value={state.password} />
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        <SubmitButton idle={t("create")} pendingLabel={t("creating")} className="w-full" />
      </form>
    </Card>
  );
}
