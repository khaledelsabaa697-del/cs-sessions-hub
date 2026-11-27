"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { gradeSubmissionAction } from "@/actions/grading";
import type { GradeState } from "@/lib/types";
import { Alert, buttonSecondary } from "@/components/ui";

const initialState: GradeState = { status: "idle" };

export function GradeSubmissionButton({
  locale,
  submissionId,
  label,
  idle,
}: {
  locale: string;
  submissionId: string;
  label?: string;
  idle?: string;
}) {
  const t = useTranslations("admin.review");
  const [state, formAction, pending] = useActionState(gradeSubmissionAction, initialState);

  return (
    <div className="space-y-3">
      <form action={formAction}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="submission_id" value={submissionId} />
        <input type="hidden" name="force" value="1" />
        <button type="submit" disabled={pending} aria-busy={pending} className={buttonSecondary}>
          {pending ? t("regrading") : (idle ?? label ?? t("regrade"))}
        </button>
      </form>
      {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}
      {state.status === "error" ? <Alert>{state.error}</Alert> : null}
    </div>
  );
}
