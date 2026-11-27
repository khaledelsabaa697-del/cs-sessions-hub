"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createWarningAction } from "@/actions/hr";
import type { WarningFormState } from "@/lib/types";
import { Alert, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

type StudentOption = {
  id: string;
  full_name: string;
  student_code: string;
};

const initialState: WarningFormState = { status: "idle" };

export function WarningForm({
  locale,
  students,
  defaultStudentId,
}: {
  locale: string;
  students: StudentOption[];
  defaultStudentId?: string;
}) {
  const t = useTranslations("hr");
  const [state, formAction] = useActionState(createWarningAction, initialState);

  return (
    <form action={formAction} className="space-y-4 p-5">
      <input type="hidden" name="locale" value={locale} />

      <div>
        <label htmlFor="w-student" className={labelClass}>
          {t("colStudent")}
        </label>
        <select id="w-student" name="student_id" defaultValue={defaultStudentId ?? ""} className={inputClass} required>
          <option value="">—</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name} ({s.student_code})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="w-reason" className={labelClass}>
          {t("warningReason")}
        </label>
        <input id="w-reason" name="reason" type="text" required className={inputClass} />
      </div>

      <div>
        <label htmlFor="w-note" className={labelClass}>
          {t("warningNote")}
        </label>
        <textarea id="w-note" name="note" rows={3} className={inputClass} />
      </div>

      {state.status === "error" ? <Alert>{state.error}</Alert> : null}
      {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}

      <SubmitButton idle={t("createWarning")} pendingLabel={t("createWarning")} />
    </form>
  );
}
