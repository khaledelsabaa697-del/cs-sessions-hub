"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { gradePendingAction } from "@/actions/grading";
import type { GradeState } from "@/lib/types";
import { Alert, buttonPrimary } from "@/components/ui";

const initialState: GradeState = { status: "idle" };

export function GradePendingButton({
  locale,
  assignmentId,
  pendingCount,
  className,
}: {
  locale: string;
  assignmentId: string;
  pendingCount: number;
  className?: string;
}) {
  const t = useTranslations("admin.assignment");
  const [state, formAction, pending] = useActionState(gradePendingAction, initialState);

  return (
    <div className={className}>
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="assignment_id" value={assignmentId} />
        <button type="submit" disabled={pending || pendingCount === 0} aria-busy={pending} className={buttonPrimary}>
          {pending ? t("gradingPending") : t("gradePending", { count: pendingCount })}
        </button>
        {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}
        {state.status === "error" ? <Alert>{state.error}</Alert> : null}
      </form>
    </div>
  );
}
