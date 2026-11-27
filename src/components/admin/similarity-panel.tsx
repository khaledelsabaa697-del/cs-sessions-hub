"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { flagSimilarPairAction, markSimilarityReviewedAction, runSimilarityCheckAction } from "@/actions/similarity";
import type { SimilarityActionResult, SimilarityPair, SimilarityRunState } from "@/lib/types";
import {
  Alert,
  Card,
  CardHeader,
  EmptyState,
  buttonPrimary,
  buttonSecondary,
  inputClass,
  labelClass,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatNumber } from "@/lib/utils";

const initialRunState: SimilarityRunState = { status: "idle" };

export function SimilarityPanel({
  locale,
  assignmentId,
  pairs,
  checkedAtLabel,
  defaultThreshold = 70,
}: {
  locale: string;
  assignmentId: string;
  pairs: SimilarityPair[];
  checkedAtLabel: string | null;
  defaultThreshold?: number;
}) {
  const t = useTranslations("admin.similarity");
  const ts = useTranslations("submissionStatus");

  const router = useRouter();
  const [runState, runAction] = useActionState(runSimilarityCheckAction, initialRunState);
  const [rowError, setRowError] = useState<string | null>(null);
  const [rowPending, startRowTransition] = useTransition();

  function runRow(operation: () => Promise<SimilarityActionResult>) {
    setRowError(null);
    startRowTransition(async () => {
      const result = await operation();
      if (!result.ok) {
        setRowError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const flaggedPairs = pairs.filter(
    (pair) => pair.student_a_status === "flagged" || pair.student_b_status === "flagged",
  ).length;

  return (
    <Card>
      <CardHeader
        title={t("title")}
        description={t("subtitle")}
        action={
          <span className="text-xs text-[var(--ink-muted)]">
            {checkedAtLabel ? t("lastChecked", { date: checkedAtLabel }) : t("neverChecked")}
          </span>
        }
      />
      <div className="space-y-5 p-5">
        <Alert tone="info">{t("info")}</Alert>

        <form action={runAction} className="flex flex-wrap items-start gap-4">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="assignment_id" value={assignmentId} />
          <div>
            <label htmlFor={`similarity-threshold-${assignmentId}`} className={labelClass}>
              {t("threshold")}
            </label>
            <input
              id={`similarity-threshold-${assignmentId}`}
              name="threshold"
              type="number"
              min={30}
              max={100}
              step="1"
              defaultValue={defaultThreshold}
              className={`${inputClass} w-24`}
              dir="ltr"
            />
            <p className="mt-1 text-xs text-[var(--ink-muted)]">{t("thresholdHint")}</p>
          </div>
          <div className="pt-6">
            <SubmitButton idle={t("run")} pendingLabel={t("running")} />
          </div>
        </form>

        {runState.status === "error" ? <Alert>{runState.error}</Alert> : null}
        {runState.status === "success" ? (
          <Alert tone="success">
            {t("summary", {
              scanned: formatNumber(runState.scanned, locale),
              pairs: formatNumber(runState.pairs, locale),
              threshold: formatNumber(runState.threshold, locale),
            })}
            {runState.flagged > 0 ? ` ${t("flaggedCount", { count: runState.flagged })}` : ""}
          </Alert>
        ) : null}
        {rowError ? <Alert>{rowError}</Alert> : null}

        {pairs.length === 0 ? (
          <EmptyState title={t("empty")} description={t("emptyHint")} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-sm">
                <thead className="bg-[var(--glass-inset)] text-xs uppercase tracking-wide text-[var(--ink-muted)] ">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-start font-medium">
                      {t("colStudents")}
                    </th>
                    <th scope="col" className="px-4 py-3 text-start font-medium">
                      {t("colSimilarity")}
                    </th>
                    <th scope="col" className="px-4 py-3 text-start font-medium">
                      {t("colReviewed")}
                    </th>
                    <th scope="col" className="px-4 py-3 text-end font-medium">
                      {t("colActions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {pairs.map((pair) => {
                    const similarity = Number(pair.similarity);
                    const bothFlagged = pair.student_a_status === "flagged" && pair.student_b_status === "flagged";

                    return (
                      <tr key={pair.pair_id}>
                        <td className="px-4 py-3.5">
                          <div className="space-y-1">
                            <div>
                              <span className="font-medium text-[var(--ink)]">{pair.student_a_name}</span>
                              <span className="ms-2 font-mono text-xs text-[var(--ink-muted)]">
                                {pair.student_a_code}
                              </span>
                            </div>
                            <div>
                              <span className="font-medium text-[var(--ink)]">{pair.student_b_name}</span>
                              <span className="ms-2 font-mono text-xs text-[var(--ink-muted)]">
                                {pair.student_b_code}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={
                              similarity >= 90
                                ? "font-semibold text-rose-600 dark:text-rose-400"
                                : similarity >= 75
                                  ? "font-semibold text-amber-600 dark:text-amber-400"
                                  : "font-semibold text-[var(--ink-soft)]"
                            }
                          >
                            {formatNumber(similarity, locale, 1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap gap-1.5">
                            <span
                              className={
                                pair.reviewed
                                  ? "rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                                  : "rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                              }
                            >
                              {pair.reviewed ? t("reviewed") : t("pendingReview")}
                            </span>
                            {bothFlagged ? (
                              <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                                {ts("flagged")}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap justify-end gap-2">
                            {!pair.reviewed ? (
                              <button
                                type="button"
                                disabled={rowPending}
                                onClick={() => runRow(() => markSimilarityReviewedAction(pair.pair_id, locale))}
                                className={`${buttonSecondary} px-3 py-1.5 text-xs`}
                              >
                                {t("markReviewed")}
                              </button>
                            ) : null}
                            {!bothFlagged ? (
                              <button
                                type="button"
                                disabled={rowPending}
                                onClick={() => {
                                  if (!window.confirm(t("flagConfirm"))) return;
                                  runRow(() => flagSimilarPairAction(pair.pair_id, locale));
                                }}
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-300"
                              >
                                {t("flagBoth")}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {flaggedPairs > 0 ? <Alert tone="info">{t("flaggedNote")}</Alert> : null}
          </>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-[var(--ink-muted)]">{t("reviewedNote")}</span>
          <button
            type="button"
            disabled={rowPending || pairs.every((pair) => pair.reviewed)}
            onClick={() => {
              const unreviewed = pairs.filter((pair) => !pair.reviewed);
              if (unreviewed.length === 0) return;
              runRow(async () => {
                for (const pair of unreviewed) {
                  const result = await markSimilarityReviewedAction(pair.pair_id, locale);
                  if (!result.ok) return result;
                }
                return { ok: true };
              });
            }}
            className={`${buttonPrimary} px-3 py-1.5 text-xs`}
          >
            {t("markAll")}
          </button>
        </div>
      </div>
    </Card>
  );
}
