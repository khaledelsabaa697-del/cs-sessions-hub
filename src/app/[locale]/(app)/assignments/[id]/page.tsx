import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  Alert,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
  badgeClass,
} from "@/components/ui";
import { SubmissionForm } from "@/components/submission-form";
import { GradingStatusWatcher } from "@/components/grading-status-watcher";
import { requireProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber, stringList } from "@/lib/utils";
import { idSchema } from "@/lib/validation";
import type { SubmissionStatus } from "@/lib/types";

export const maxDuration = 60;

type AssignmentRow = {
  id: string;
  title: string;
  description: string;
  rubric: string;
  expected_output: string | null;
  deadline: string | null;
  max_score: number | string;
  allow_resubmit: boolean;
  allowed_submission_types: "file" | "text" | "both";
};

type AttemptRow = {
  id: string;
  file_path: string;
  code_text: string;
  ai_score: number | string | null;
  ai_feedback: string | null;
  ai_feedback_ar: string | null;
  ai_issues: unknown;
  ai_model: string | null;
  ai_rubric: unknown;
  ai_graded_at: string | null;
  final_score: number | string | null;
  status: SubmissionStatus;
  created_at: string;
};

export default async function StudentAssignmentPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: raw, id } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  const profile = await requireProfile(locale);
  if (profile.role === "admin") {
    notFound();
  }

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const t = await getTranslations("assignments");
  const ts = await getTranslations("submissionStatus");

  const supabase = await createClient();

  const { data: assignment, error: assignmentError } = await supabase
    .from("assignments")
    .select(
      "id, title, description, rubric, expected_output, deadline, max_score, allow_resubmit, allowed_submission_types",
    )
    .eq("id", parsedId.data)
    .maybeSingle()
    .returns<AssignmentRow | null>();

  if (assignmentError) {
    console.error("[student assignment] query error:", assignmentError);
    notFound();
  }
  if (!assignment) notFound();

  const { data: attemptsData, error: attemptsError } = await supabase
    .from("submissions")
    .select(
      "id, file_path, code_text, ai_score, ai_feedback, ai_feedback_ar, ai_issues, ai_model, ai_rubric, ai_graded_at, final_score, status, created_at",
    )
    .eq("assignment_id", assignment.id)
    .eq("student_id", profile.id)
    .order("created_at", { ascending: false })
    .returns<AttemptRow[]>();

  if (attemptsError) console.error("[student assignment] attempts error:", attemptsError);
  const attempts = attemptsData ?? [];
  const maxScore = Number(assignment.max_score) || 100;

  const paths = attempts.map((attempt) => attempt.file_path).filter(Boolean);
  const signedResult =
    paths.length > 0
      ? await supabase.storage.from("submissions").createSignedUrls(paths, 600)
      : { data: null, error: null };
  const signedByPath = new Map(
    (signedResult.data ?? []).map((row) => [row.path, row.signedUrl]),
  );

  let bestPercent: number | null = null;
  for (const attempt of attempts) {
    const score = Number(attempt.final_score ?? attempt.ai_score);
    if (!Number.isFinite(score)) continue;
    const percent = Math.min(100, Math.max(0, (score / maxScore) * 100));
    if (bestPercent === null || percent > bestPercent) bestPercent = percent;
  }

  const now = Date.now();
  const closed = Boolean(assignment.deadline && Date.parse(assignment.deadline) <= now);
  const canSubmit = !closed && (assignment.allow_resubmit || attempts.length === 0);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/assignments"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4 rtl:-scale-x-100"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          {t("back")}
        </Link>
      </div>

      <PageHeader
        title={assignment.title}
        description={
          assignment.deadline
            ? t("due", {
                date: formatDate(assignment.deadline, locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }),
              })
            : t("noDeadline")
        }
      />

      {attemptsError ? <Alert>{t("loadError")}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label={t("bestScore")}
          value={
            bestPercent === null
              ? "—"
              : `${formatNumber(bestPercent, locale, 1)}%`
          }
          hint={t("maxScore", { max: formatNumber(maxScore, locale) })}
        />
        <StatCard
          label={t("attemptsLabel")}
          value={formatNumber(attempts.length, locale)}
          hint={closed ? t("closed") : t("open")}
        />
        <StatCard
          label={t("deadline")}
          value={
            assignment.deadline
              ? formatDate(assignment.deadline, locale)
              : "—"
          }
          hint={assignment.allow_resubmit ? t("resubmitAllowed") : t("resubmitBlocked")}
        />
      </div>

      <Card>
        <CardHeader title={t("detailsTitle")} />
        <div className="space-y-5 p-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("task")}
            </h3>
            <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {assignment.description || t("noDescription")}
            </p>
          </div>

          {assignment.rubric ? (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("rubric")}
              </h3>
              <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {assignment.rubric}
              </p>
            </div>
          ) : null}

          {assignment.expected_output ? (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("expectedOutput")}
              </h3>
              <pre
                dir="ltr"
                className="mt-1.5 overflow-x-auto rounded-xl bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100"
              >
                {assignment.expected_output}
              </pre>
            </div>
          ) : null}
        </div>
      </Card>

      {canSubmit ? (
        <SubmissionForm
          locale={locale}
          assignmentId={assignment.id}
          hasAttempts={attempts.length > 0}
          allowedTypes={assignment.allowed_submission_types}
        />
      ) : (
        <Alert tone="info">
          {closed ? t("closedNotice") : t("resubmitNotice")}
        </Alert>
      )}

      <GradingStatusWatcher
        active={attempts.some((attempt) =>
          ["queued", "grading", "pending_retry"].includes(attempt.status),
        )}
      />

      <Card>
        <CardHeader
          title={t("yourWork")}
          action={
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {t("attempts", { count: attempts.length })}
            </span>
          }
        />
        {attempts.length === 0 ? (
          <div className="p-5">
            <EmptyState title={t("noAttempts")} description={t("noAttemptsHint")} />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {attempts.map((attempt, index) => {
              const attemptNumber = attempts.length - index;
              const score = attempt.final_score ?? attempt.ai_score;
              const feedback =
                locale === "ar"
                  ? (attempt.ai_feedback_ar ?? attempt.ai_feedback)
                  : attempt.ai_feedback;
              const issues = stringList(attempt.ai_issues);
              const signedUrl = signedByPath.get(attempt.file_path) ?? null;

              return (
                <li key={attempt.id} className="space-y-3 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        {t("attemptLabel", { count: attemptNumber })}
                      </span>
                      <span
                        className={
                          attempt.status === "graded"
                            ? "rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                            : attempt.status === "flagged"
                              ? "rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                              : attempt.status === "failed"
                                ? "rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                                : "rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"
                        }
                      >
                        {ts(attempt.status)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={badgeClass}>
                        {score === null
                          ? t("noScoreYet")
                          : `${formatNumber(Number(score), locale, 1)} / ${formatNumber(maxScore, locale)}`}
                      </span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {formatDate(attempt.created_at, locale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                  </div>

                  {feedback ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t("aiFeedback")}
                      </p>
                      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                        {feedback}
                      </p>
                    </div>
                  ) : null}

                  {issues.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t("issues")}
                      </p>
                      <ul className="mt-1 list-disc space-y-1 ps-5 text-sm text-slate-600 dark:text-slate-300">
                        {issues.map((issue, issueIndex) => (
                          <li key={issueIndex}>{issue}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {Array.isArray(attempt.ai_rubric) && attempt.ai_rubric.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t("rubricScores")}
                      </p>
                      <ul className="mt-1 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                        {(attempt.ai_rubric as Array<{
                          criterion: string;
                          score: number;
                          max?: number | null;
                          comment?: string | null;
                        }>).map((item, itemIndex) => (
                          <li key={itemIndex}>
                            <span className="font-medium text-slate-700 dark:text-slate-200">
                              {item.criterion}
                            </span>
                            {": "}
                            {item.score}
                            {item.max !== null && item.max !== undefined
                              ? ` / ${item.max}`
                              : ""}
                            {item.comment ? ` — ${item.comment}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <details className="rounded-xl border border-slate-200 dark:border-slate-800">
                    <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                      {t("showCode")}
                    </summary>
                    <div className="border-t border-slate-200 p-3 dark:border-slate-800">
                      <pre
                        dir="ltr"
                        className="max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100"
                      >
                        {attempt.code_text}
                      </pre>
                      {signedUrl ? (
                        <a
                          href={signedUrl}
                          className="mt-2 inline-block text-xs font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
                          download
                        >
                          {t("download")}
                        </a>
                      ) : null}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
