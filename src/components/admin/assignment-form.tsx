"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createAssignmentAction, updateAssignmentAction } from "@/actions/assignments";
import type { AssignmentFormState } from "@/lib/types";
import { Alert, Card, CardHeader, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initialState: AssignmentFormState = { status: "idle" };

export type AssignmentFormValues = {
  id?: string;
  title?: string;
  description?: string;
  rubric?: string;
  expected_output?: string | null;
  max_score?: number | string;
  deadline?: string | null;
  allow_resubmit?: boolean;
  allowed_submission_types?: "file" | "text" | "both";
};

/** ISO → the `datetime-local` shape in Egypt time (Africa/Cairo). */
function toDeadlineInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("sv-SE", { timeZone: "Africa/Cairo" }).slice(0, 16).replace(" ", "T");
}

export function AssignmentForm({
  locale,
  mode,
  assignment,
}: {
  locale: string;
  mode: "create" | "edit";
  assignment?: AssignmentFormValues;
}) {
  const t = useTranslations("admin.assignments");
  const te = useTranslations("admin.assignment");

  const action = mode === "create" ? createAssignmentAction : updateAssignmentAction;
  const [state, formAction] = useActionState(action, initialState);

  const idPrefix = mode === "create" ? "new" : `edit-${assignment?.id ?? ""}`;

  return (
    <Card>
      <CardHeader
        title={mode === "create" ? t("createTitle") : te("detailsTitle")}
        description={mode === "create" ? t("createSubtitle") : te("detailsSubtitle")}
      />
      <form action={formAction} className="space-y-4 p-5">
        <input type="hidden" name="locale" value={locale} />
        {assignment?.id ? <input type="hidden" name="assignment_id" value={assignment.id} /> : null}

        <div>
          <label htmlFor={`${idPrefix}-title`} className={labelClass}>
            {t("titleLabel")}
          </label>
          <input
            id={`${idPrefix}-title`}
            name="title"
            type="text"
            required
            minLength={3}
            maxLength={160}
            defaultValue={assignment?.title ?? ""}
            placeholder={t("titlePlaceholder")}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor={`${idPrefix}-description`} className={labelClass}>
            {t("descriptionLabel")}
          </label>
          <textarea
            id={`${idPrefix}-description`}
            name="description"
            rows={4}
            maxLength={4000}
            defaultValue={assignment?.description ?? ""}
            placeholder={t("descriptionPlaceholder")}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor={`${idPrefix}-rubric`} className={labelClass}>
            {t("rubricLabel")}
          </label>
          <textarea
            id={`${idPrefix}-rubric`}
            name="rubric"
            rows={3}
            maxLength={4000}
            defaultValue={assignment?.rubric ?? ""}
            placeholder={t("rubricPlaceholder")}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor={`${idPrefix}-expected`} className={labelClass}>
            {t("expectedOutputLabel")}
          </label>
          <textarea
            id={`${idPrefix}-expected`}
            name="expected_output"
            rows={2}
            maxLength={2000}
            dir="ltr"
            defaultValue={assignment?.expected_output ?? ""}
            placeholder={t("expectedOutputPlaceholder")}
            className={`${inputClass} font-mono text-xs`}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${idPrefix}-score`} className={labelClass}>
              {t("maxScoreLabel")}
            </label>
            <input
              id={`${idPrefix}-score`}
              name="max_score"
              type="number"
              required
              min={1}
              max={1000}
              step={1}
              defaultValue={assignment?.max_score ?? 100}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-deadline`} className={labelClass}>
              {t("deadlineLabel")}
            </label>
            <input
              id={`${idPrefix}-deadline`}
              name="deadline"
              type="datetime-local"
              dir="ltr"
              defaultValue={toDeadlineInput(assignment?.deadline)}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-[var(--ink-muted)]">{t("deadlineHint")}</p>
          </div>
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-[var(--line)] p-3 text-sm ">
          <input
            type="checkbox"
            name="allow_resubmit"
            defaultChecked={assignment?.allow_resubmit ?? true}
            className="mt-0.5 size-4 rounded border-[var(--line-strong)] text-primary-600 focus:ring-primary-500 "
          />
          <span>
            <span className="block font-medium text-[var(--ink)] ">{t("allowResubmit")}</span>
            <span className="block text-xs text-[var(--ink-muted)]">{t("allowResubmitHint")}</span>
          </span>
        </label>

        <div>
          <label className={labelClass}>{t("allowedTypesLabel")}</label>
          <div className="mt-2 flex flex-wrap gap-4">
            {(["file", "text", "both"] as const).map((type) => (
              <label
                key={type}
                className="flex items-center gap-2 cursor-pointer rounded-xl border border-[var(--line)] p-3 transition hover:bg-[var(--glass-inset)] "
              >
                <input
                  type="radio"
                  name="allowed_submission_types"
                  value={type}
                  defaultChecked={
                    assignment?.allowed_submission_types === type ||
                    (assignment?.allowed_submission_types == null && type === "both")
                  }
                  className="mt-0.5 size-4 rounded border-[var(--line-strong)] text-primary-600 focus:ring-primary-500 "
                />
                <span className="text-sm font-medium text-[var(--ink)] ">{t(`allowedType.${type}`)}</span>
                <span className="text-xs text-[var(--ink-muted)]">{t(`allowedTypeHint.${type}`)}</span>
              </label>
            ))}
          </div>
        </div>

        {state.status === "error" ? <Alert>{state.error}</Alert> : null}
        {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}

        <SubmitButton
          idle={mode === "create" ? t("create") : te("save")}
          pendingLabel={mode === "create" ? t("creating") : te("saving")}
        />
      </form>
    </Card>
  );
}
