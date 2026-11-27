"use client";

import { useTranslations } from "next-intl";
import { deleteAssignmentAction } from "@/actions/assignments";

export function DeleteAssignmentForm({ locale, assignmentId }: { locale: string; assignmentId: string }) {
  const t = useTranslations("admin.assignment");

  return (
    <form
      action={deleteAssignmentAction}
      onSubmit={(event) => {
        if (!window.confirm(t("deleteConfirm"))) event.preventDefault();
      }}
      className="rounded-xl border border-rose-200 p-4 dark:border-rose-500/30"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="assignment_id" value={assignmentId} />
      <h3 className="text-sm font-semibold text-rose-700 dark:text-rose-300">{t("dangerTitle")}</h3>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">{t("dangerBody")}</p>
      <button
        type="submit"
        className="mt-3 inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-500"
      >
        {t("delete")}
      </button>
    </form>
  );
}
