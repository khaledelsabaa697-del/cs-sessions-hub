"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { reviewSubmissionAction } from "@/actions/assignments";
import type { SubmissionReviewState, SubmissionStatus } from "@/lib/types";

import { Alert, Card, CardHeader, buttonSecondary, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initialState: SubmissionReviewState = { status: "idle" };

export function ReviewForm({
  locale,
  submissionId,
  maxScore,
  aiScore,
  finalScore,
  status,
}: {
  locale: string;
  submissionId: string;
  maxScore: number;
  aiScore: number | null;
  finalScore: number | null;
  status: SubmissionStatus;
}) {
  const t = useTranslations("admin.review");
  const [state, formAction] = useActionState(reviewSubmissionAction, initialState);
  const [score, setScore] = useState(
    finalScore !== null ? String(finalScore) : aiScore !== null ? String(aiScore) : "",
  );
  const [reviewStatus, setReviewStatus] = useState<"graded" | "flagged">(status === "flagged" ? "flagged" : "graded");

  return (
    <Card>
      <CardHeader title={t("finalTitle")} description={t("finalSubtitle")} />
      <form action={formAction} className="space-y-4 p-5">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="submission_id" value={submissionId} />

        <div>
          <label htmlFor="final-score" className={labelClass}>
            {t("scoreLabel", { max: maxScore })}
          </label>
          <div className="flex gap-2">
            <input
              id="final-score"
              name="final_score"
              type="number"
              min={0}
              max={maxScore}
              step="0.5"
              required
              value={score}
              onChange={(event) => setScore(event.target.value)}
              className={inputClass}
            />
            <button
              type="button"
              disabled={aiScore === null}
              onClick={() => {
                if (aiScore !== null) setScore(String(aiScore));
              }}
              className={`${buttonSecondary} shrink-0 px-3 text-xs`}
            >
              {t("useAiScore")}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="review-status" className={labelClass}>
            {t("statusLabel")}
          </label>
          <select
            id="review-status"
            name="status"
            value={reviewStatus}
            onChange={(event) => setReviewStatus(event.target.value as "graded" | "flagged")}
            className={inputClass}
          >
            <option value="graded">{t("statusGraded")}</option>
            <option value="flagged">{t("statusFlagged")}</option>
          </select>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">{t("statusHint")}</p>
        </div>

        {state.status === "error" ? <Alert>{state.error}</Alert> : null}
        {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}

        <SubmitButton idle={t("save")} pendingLabel={t("saving")} />
      </form>
    </Card>
  );
}
