"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createSessionAction } from "@/actions/sessions";
import type { SessionFormState } from "@/lib/types";
import { Alert, Card, CardHeader, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initialState: SessionFormState = { status: "idle" };

export function CreateSessionForm({ locale, today }: { locale: string; today: string }) {
  const t = useTranslations("admin.sessions");
  const [state, formAction] = useActionState(createSessionAction, initialState);

  return (
    <Card>
      <CardHeader title={t("createTitle")} description={t("createSubtitle")} />
      <form action={formAction} className="space-y-4 p-5">
        <input type="hidden" name="locale" value={locale} />

        <div>
          <label htmlFor="session_title" className={labelClass}>
            {t("titleLabel")}
          </label>
          <input
            id="session_title"
            name="title"
            type="text"
            required
            maxLength={120}
            placeholder="Session 05 · Arrays"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="session_date" className={labelClass}>
            {t("dateLabel")}
          </label>
          <input
            id="session_date"
            name="session_date"
            type="date"
            required
            dir="ltr"
            defaultValue={today}
            className={inputClass}
          />
        </div>

        {state.status === "error" ? <Alert>{state.error}</Alert> : null}

        <SubmitButton idle={t("create")} pendingLabel={t("creating")} className="w-full" />
      </form>
    </Card>
  );
}
