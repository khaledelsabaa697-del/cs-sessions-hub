"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createAnnouncementAction, updateAnnouncementAction } from "@/actions/announcements";
import type { Announcement, AnnouncementFormState } from "@/lib/types";
import { Alert, Card, CardHeader, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initialState: AnnouncementFormState = { status: "idle" };

export function AnnouncementForm({
  locale,
  mode,
  announcement,
}: {
  locale: string;
  mode: "create" | "edit";
  announcement?: Pick<Announcement, "id" | "title" | "body" | "pinned">;
}) {
  const t = useTranslations("admin.announcements");
  const action = mode === "edit" ? updateAnnouncementAction : createAnnouncementAction;
  const [state, formAction] = useActionState(action, initialState);

  return (
    <Card>
      <CardHeader
        title={mode === "edit" ? t("editTitle") : t("createTitle")}
        description={mode === "edit" ? t("editSubtitle") : t("createSubtitle")}
      />
      <form action={formAction} className="space-y-4 p-5">
        <input type="hidden" name="locale" value={locale} />
        {announcement ? <input type="hidden" name="id" value={announcement.id} /> : null}

        <div>
          <label htmlFor="announcement-title" className={labelClass}>
            {t("titleLabel")}
          </label>
          <input
            id="announcement-title"
            name="title"
            type="text"
            required
            minLength={1}
            maxLength={160}
            defaultValue={announcement?.title ?? ""}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="announcement-body" className={labelClass}>
            {t("bodyLabel")}
          </label>
          <textarea
            id="announcement-body"
            name="body"
            rows={7}
            maxLength={5000}
            defaultValue={announcement?.body ?? ""}
            placeholder={t("bodyPlaceholder")}
            className={inputClass}
          />
          <p className="mt-1.5 text-xs text-[var(--ink-muted)]">{t("bodyHint")}</p>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--line)] p-3 transition hover:bg-[var(--glass-inset)] ">
          <input
            type="checkbox"
            name="pinned"
            defaultChecked={announcement?.pinned ?? false}
            className="mt-0.5 size-4 rounded border-[var(--line-strong)] text-primary-600 focus:ring-primary-500 "
          />
          <span>
            <span className="block text-sm font-medium text-[var(--ink)]">{t("pinned")}</span>
            <span className="mt-0.5 block text-xs text-[var(--ink-muted)]">{t("pinnedHint")}</span>
          </span>
        </label>

        {state.status === "error" ? <Alert>{state.error}</Alert> : null}

        <SubmitButton
          idle={mode === "edit" ? t("save") : t("create")}
          pendingLabel={mode === "edit" ? t("saving") : t("creating")}
        />
      </form>
    </Card>
  );
}
