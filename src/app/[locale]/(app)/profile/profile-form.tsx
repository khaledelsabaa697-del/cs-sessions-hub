"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updateProfileAction } from "./actions";
import type { ProfileState } from "./types";
import { Alert, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initialState: ProfileState = { status: "idle" };

export function ProfileForm({
  locale,
  fullName,
  displayName,
  optedOut,
}: {
  locale: string;
  fullName: string;
  displayName: string;
  optedOut: boolean;
}) {
  const t = useTranslations("profile");
  const [state, formAction] = useActionState(updateProfileAction, initialState);

  return (
    <form action={formAction} className="space-y-5 p-5">
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
          minLength={2}
          maxLength={80}
          defaultValue={fullName}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="display_name" className={labelClass}>
          {t("displayName")}
        </label>
        <input
          id="display_name"
          name="display_name"
          type="text"
          required
          minLength={2}
          maxLength={40}
          defaultValue={displayName}
          className={inputClass}
        />
        <p className="mt-1.5 text-xs text-[var(--ink-muted)]">{t("displayNameHint")}</p>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--line)] p-4 transition hover:bg-[var(--glass-inset)] ">
        <input
          type="checkbox"
          name="opted_out_of_leaderboard"
          defaultChecked={optedOut}
          className="mt-0.5 size-4 rounded border-[var(--line-strong)] text-primary-600 focus:ring-primary-500 "
        />
        <span>
          <span className="block text-sm font-medium text-[var(--ink)]">{t("optOut")}</span>
          <span className="mt-0.5 block text-xs text-[var(--ink-muted)]">{t("optOutHint")}</span>
        </span>
      </label>

      {state.status === "error" ? <Alert>{state.error}</Alert> : null}
      {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}

      <SubmitButton idle={t("save")} pendingLabel={t("saving")} />
    </form>
  );
}
