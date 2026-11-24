"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { requestPasswordChangeAction } from "./actions";
import type { ProfileState } from "./types";
import { Alert, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initialState: ProfileState = { status: "idle" };

export function PasswordChangeForm({ locale }: { locale: string }) {
  const t = useTranslations("profile");
  const [state, formAction] = useActionState(requestPasswordChangeAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {t("changePasswordHint")}
      </p>

      {state.status === "error" ? <Alert>{state.error}</Alert> : null}
      {state.status === "success" ? (
        <Alert tone="success">{state.message}</Alert>
      ) : null}

      <SubmitButton
        idle={t("changePasswordButton")}
        pendingLabel={t("saving")}
      />
    </form>
  );
}
