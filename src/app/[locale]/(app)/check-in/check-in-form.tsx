"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { checkInAction } from "@/actions/attendance";
import { Alert, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { CheckInState } from "@/lib/types";

const initialState: CheckInState = { status: "idle" };

export function CheckInForm({
  locale,
  defaultCode,
}: {
  locale: string;
  defaultCode?: string;
}) {
  const t = useTranslations("checkIn");
  const ts = useTranslations("attendanceStatus");
  const [state, formAction] = useActionState(checkInAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />

      <div>
        <label htmlFor="code" className={labelClass}>
          {t("codeLabel")}
        </label>
        <input
          id="code"
          name="code"
          type="text"
          required
          defaultValue={defaultCode ?? ""}
          autoComplete="one-time-code"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          dir="ltr"
          maxLength={12}
          placeholder={t("placeholder")}
          className={`${inputClass} text-center font-mono text-lg uppercase tracking-[0.35em]`}
        />
      </div>

      {state.status === "error" ? <Alert>{state.error}</Alert> : null}

      {state.status === "success" ? (
        <Alert tone="success">
          <span className="font-semibold">{t("checkedIn")}</span>{" "}
          {t("successBody", {
            session: state.sessionTitle,
            status: ts(state.attendanceStatus),
          })}
        </Alert>
      ) : null}

      <SubmitButton
        idle={t("submit")}
        pendingLabel={t("submitting")}
        className="w-full"
      />

      <p className="text-center">
        <Link
          href="/attendance"
          className="text-sm font-medium text-primary-600 underline-offset-2 hover:underline dark:text-primary-400"
        >
          {t("viewHistory")}
        </Link>
      </p>
    </form>
  );
}
