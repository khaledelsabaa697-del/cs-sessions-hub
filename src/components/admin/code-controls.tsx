"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { endCodeAction, rotateCodeAction } from "@/actions/sessions";
import type { CodeState } from "@/lib/types";
import { Alert, buttonSecondary, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initialState: CodeState = { status: "idle" };

export function RotateCodeForm({ locale, sessionId }: { locale: string; sessionId: string }) {
  const t = useTranslations("admin.session");
  const [state, formAction] = useActionState(rotateCodeAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="session_id" value={sessionId} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-36">
          <label htmlFor="code_minutes" className={labelClass}>
            {t("minutes")}
          </label>
          <select id="code_minutes" name="minutes" defaultValue="15" className={inputClass}>
            {[5, 10, 15, 30, 60].map((minutes) => (
              <option key={minutes} value={minutes}>
                {t("minutesOption", { count: minutes })}
              </option>
            ))}
          </select>
        </div>
        <SubmitButton idle={t("generate")} pendingLabel={t("generating")} />
      </div>

      {state.status === "error" ? <Alert>{state.error}</Alert> : null}
      {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}
    </form>
  );
}

export function EndCodeForm({ locale, sessionId }: { locale: string; sessionId: string }) {
  const t = useTranslations("admin.session");
  const [state, formAction] = useActionState(endCodeAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="session_id" value={sessionId} />
      <button type="submit" className={`${buttonSecondary} px-3 py-2 text-xs`}>
        {t("endCode")}
      </button>
      {state.status === "error" ? <Alert>{state.error}</Alert> : null}
      {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}
    </form>
  );
}
