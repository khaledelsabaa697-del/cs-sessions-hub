"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { deleteAnnouncementAction } from "@/actions/announcements";
import type { AnnouncementFormState } from "@/lib/types";
import { Alert } from "@/components/ui";

const initialState: AnnouncementFormState = { status: "idle" };

export function DeleteAnnouncementForm({ locale, announcementId }: { locale: string; announcementId: string }) {
  const t = useTranslations("admin.announcements");
  const [state, formAction, pending] = useActionState(deleteAnnouncementAction, initialState);

  return (
    <div className="space-y-3">
      <form
        action={formAction}
        onSubmit={(event) => {
          if (!window.confirm(t("deleteConfirm"))) event.preventDefault();
        }}
      >
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="id" value={announcementId} />
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-300"
        >
          {pending ? t("deleting") : t("delete")}
        </button>
      </form>
      {state.status === "error" ? <Alert>{state.error}</Alert> : null}
    </div>
  );
}
