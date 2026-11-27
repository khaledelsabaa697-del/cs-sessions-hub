"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updateSessionAction } from "@/actions/sessions";
import type { SessionFormState } from "@/lib/types";
import { Alert, Card, CardHeader, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initialState: SessionFormState = { status: "idle" };

export function EditSessionForm({
  locale,
  sessionId,
  title,
  date,
}: {
  locale: string;
  sessionId: string;
  title: string;
  date: string;
}) {
  const t = useTranslations("admin.session");
  const [state, formAction] = useActionState(updateSessionAction, initialState);

  return (
    <Card>
      <CardHeader title={t("detailsTitle")} description={t("detailsSubtitle")} />
      <form action={formAction} className="space-y-4 p-5">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="session_id" value={sessionId} />

        <div>
          <label htmlFor="edit_session_title" className={labelClass}>
            {t("titleLabel")}
          </label>
          <input
            id="edit_session_title"
            name="title"
            type="text"
            required
            maxLength={120}
            defaultValue={title}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="edit_session_date" className={labelClass}>
            {t("dateLabel")}
          </label>
          <input
            id="edit_session_date"
            name="session_date"
            type="date"
            required
            dir="ltr"
            defaultValue={date}
            className={inputClass}
          />
        </div>

        {state.status === "error" ? <Alert>{state.error}</Alert> : null}
        {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}

        <SubmitButton idle={t("saveDetails")} pendingLabel={t("savingDetails")} />
      </form>
    </Card>
  );
}
