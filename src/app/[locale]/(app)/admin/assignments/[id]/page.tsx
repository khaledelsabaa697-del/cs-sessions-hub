import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AssignmentForm } from "@/components/admin/assignment-form";
import { CsvDownloadButton } from "@/components/admin/csv-download-button";
import { DeleteAssignmentForm } from "@/components/admin/delete-assignment-form";
import { GradePendingButton } from "@/components/admin/grade-pending-button";
import { SimilarityPanel } from "@/components/admin/similarity-panel";
import { Alert, Card, CardHeader, EmptyState, PageHeader, StatCard, buttonSecondary } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { gradingStatus } from "@/lib/grading/service";
import { formatDate, formatNumber, initials } from "@/lib/utils";
import { idSchema } from "@/lib/validation";
import type { AssignmentOverview, SimilarityPair, SubmissionStatus } from "@/lib/types";

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
  similarity_checked_at: string | null;
  allowed_submission_types: "file" | "text" | "both";
};

type SubmissionRow = {
  id: string;
  student_id: string;
  created_at: string;
  ai_score: number | string | null;
  final_score: number | string | null;
  status: SubmissionStatus;
  ai_graded_at: string | null;
  profiles: {
    full_name: string;
    username: string;
    student_code: string;
  } | null;
};

export default async function AdminAssignmentPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  await requireStaff(locale);

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const t = await getTranslations("admin.assignment");
  const ta = await getTranslations("admin.assignments");
  const ts = await getTranslations("submissionStatus");

  const supabase = await createClient();

  const [assignmentResult, submissionsResult, overviewResult, similarityResult] = await Promise.all([
    supabase
      .from("assignments")
      .select(
        "id, title, description, rubric, expected_output, deadline, max_score, allow_resubmit, similarity_checked_at, allowed_submission_types",
      )
      .eq("id", parsedId.data)
      .maybeSingle()
      .returns<AssignmentRow | null>(),
    supabase
      .from("submissions")
      .select(
        "id, student_id, created_at, ai_score, final_score, status, ai_graded_at, profiles(full_name, username, student_code)",
      )
      .eq("assignment_id", parsedId.data)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(100)
      .returns<SubmissionRow[]>(),
    supabase.rpc("admin_assignment_overview"),
    supabase.rpc("admin_similarity_pairs", { p_assignment: parsedId.data }),
  ]);

  const assignment = assignmentResult.data;
  if (assignmentResult.error || !assignment) notFound();

  const submissions = submissionsResult.data ?? [];
  const overview = ((overviewResult.data ?? []) as AssignmentOverview[]).find(
    (row) => row.assignment_id === assignment.id,
  );
  const similarityPairs = (similarityResult.data ?? []) as SimilarityPair[];
  const grading = gradingStatus();

  if (process.env.NODE_ENV !== "production") {
    if (similarityResult.error) console.error("[Similarity] RPC error:", similarityResult.error);
    if (overviewResult.error) console.error("[Overview] RPC error:", overviewResult.error);
    if (submissionsResult.error) console.error("[Submissions] query error:", submissionsResult.error);
  }
  const maxScore = Number(assignment.max_score) || 100;

  // Attempt numbers per student (1 = first upload).
  const byStudent = new Map<string, SubmissionRow[]>();
  for (const row of submissions) {
    const list = byStudent.get(row.student_id) ?? [];
    list.push(row);
    byStudent.set(row.student_id, list);
  }
  const attemptNumber = new Map<string, number>();
  for (const list of byStudent.values()) {
    [...list]
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
      .forEach((row, index) => attemptNumber.set(row.id, index + 1));
  }

  // Pick each student's LATEST attempt in the data layer (server side).
  const deadlineMs = assignment.deadline ? Date.parse(assignment.deadline) : null;
  const latestByStudent = new Map<string, SubmissionRow>();
  for (const [studentId, list] of byStudent.entries()) {
    const sorted = [...list].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    latestByStudent.set(studentId, sorted[sorted.length - 1]);
  }
  const latestSubmissions = [...latestByStudent.values()];

  const isLate = (row: SubmissionRow) => deadlineMs !== null && Date.parse(row.created_at) > deadlineMs;

  const lateByMinutes = (row: SubmissionRow) => {
    if (deadlineMs === null) return 0;
    const diff = Date.parse(row.created_at) - deadlineMs;
    return diff > 0 ? Math.round(diff / 60000) : 0;
  };

  const formatLateBy = (row: SubmissionRow) => {
    const mins = lateByMinutes(row);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0) return t("lateByHoursMinutes", { hours: h, minutes: m });
    return t("lateByMinutes", { minutes: m });
  };

  const gradedOnTime = latestSubmissions
    .filter((r) => r.status === "graded" && !isLate(r))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const gradedLate = latestSubmissions
    .filter((r) => r.status === "graded" && isLate(r))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const pendingList = latestSubmissions
    .filter((r) => r.status !== "graded")
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/assignments"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ink-soft)] transition hover:text-[var(--ink)] dark:hover:text-white"
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
            ? ta("due", {
                date: formatDate(assignment.deadline, locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }),
              })
            : ta("noDeadline")
        }
        action={
          <span className="text-xs font-medium text-[var(--ink-muted)]">
            {ta("scoreOutOf", { max: formatNumber(maxScore, locale) })}
          </span>
        }
      />

      {submissionsResult.error ? (
        <Alert>
          {t("loadError")}
          {process.env.NODE_ENV !== "production" && (
            <pre className="mt-2 text-xs bg-[var(--glass-inset)] p-2 rounded overflow-auto max-h-24">
              {submissionsResult.error.message}
            </pre>
          )}
        </Alert>
      ) : null}
      {overviewResult.error ? (
        <Alert>
          {ta("overviewError")}
          {process.env.NODE_ENV !== "production" && (
            <pre className="mt-2 text-xs bg-[var(--glass-inset)] p-2 rounded overflow-auto max-h-24">
              {overviewResult.error.message}
            </pre>
          )}
        </Alert>
      ) : null}
      {similarityResult.error ? (
        <Alert>
          {t("similarityLoadError")}
          {process.env.NODE_ENV !== "production" && (
            <pre className="mt-2 text-xs bg-[var(--glass-inset)] p-2 rounded overflow-auto max-h-24">
              {similarityResult.error.message}
            </pre>
          )}
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("statsStudents")}
          value={t("studentsSubmittedShort", {
            submitted: formatNumber(overview?.student_count ?? 0, locale),
            total: formatNumber(overview?.class_size ?? 0, locale),
          })}
        />
        <StatCard label={t("statsPending")} value={formatNumber(overview?.pending_count ?? 0, locale)} />
        <StatCard label={t("statsGraded")} value={formatNumber(overview?.graded_count ?? 0, locale)} />
        <StatCard
          label={t("statsAverage")}
          value={
            overview?.average_percent === null || overview?.average_percent === undefined
              ? "—"
              : `${formatNumber(overview.average_percent, locale, 1)}%`
          }
          hint={
            overview?.average_percent === null || overview?.average_percent === undefined ? t("noAverage") : undefined
          }
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <AssignmentForm
          locale={locale}
          mode="edit"
          assignment={{
            id: assignment.id,
            title: assignment.title,
            description: assignment.description,
            rubric: assignment.rubric,
            expected_output: assignment.expected_output,
            max_score: assignment.max_score,
            deadline: assignment.deadline,
            allow_resubmit: assignment.allow_resubmit,
          }}
        />

        <div className="space-y-6">
          <Card>
            <CardHeader title={t("gradingTitle")} description={t("gradingSubtitle")} />
            <div className="space-y-4 p-5">
              {grading.mock ? (
                <Alert tone="info">{t("gradingMock")}</Alert>
              ) : grading.configured ? (
                <Alert tone="success">{t("gradingReady", { model: grading.model })}</Alert>
              ) : (
                <Alert tone="info">{t("gradingMissing")}</Alert>
              )}

              <GradePendingButton
                locale={locale}
                assignmentId={assignment.id}
                pendingCount={overview?.pending_count ?? 0}
              />

              <Link
                href="/admin/grading"
                className="text-xs font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
              >
                {t("gradingSettingsLink")}
              </Link>

              {(overview?.pending_count ?? 0) === 0 ? (
                <p className="text-sm text-[var(--ink-muted)]">{t("nothingPending")}</p>
              ) : null}
            </div>
          </Card>

          <DeleteAssignmentForm locale={locale} assignmentId={assignment.id} />
        </div>
      </div>

      <SimilarityPanel
        locale={locale}
        assignmentId={assignment.id}
        pairs={similarityPairs}
        checkedAtLabel={
          assignment.similarity_checked_at
            ? formatDate(assignment.similarity_checked_at, locale, {
                dateStyle: "medium",
                timeStyle: "short",
              })
            : null
        }
      />

      <Card>
        <CardHeader
          title={t("submissionsTitle")}
          action={
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-[var(--ink-muted)]">
                {t("submissionsCount", {
                  count: formatNumber(latestSubmissions.length, locale),
                })}
              </span>
              <CsvDownloadButton locale={locale} kind="assignment" id={assignment.id} label={ta("exportGrades")} />
            </div>
          }
        />

        {latestSubmissions.length === 0 ? (
          <div className="p-5">
            <EmptyState title={t("noSubmissions")} description={t("noSubmissionsHint")} />
          </div>
        ) : (
          <div className="space-y-6 p-5">
            {(() => {
              const renderRow = (row: SubmissionRow, showLateBadge: boolean) => {
                const student = row.profiles;
                const ai = row.ai_score === null ? null : Number(row.ai_score);
                const final = row.final_score === null ? null : Number(row.final_score);
                const late = isLate(row);
                return (
                  <tr key={row.id}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">
                          {initials(student?.full_name ?? "?")}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[var(--ink)]">{student?.full_name ?? "—"}</p>
                          <p className="truncate text-xs text-[var(--ink-muted)]">
                            {student ? `@${student.username}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-[var(--ink-soft)]">
                      {t("attemptOf", {
                        current: attemptNumber.get(row.id) ?? 1,
                        total: byStudent.get(row.student_id)?.length ?? 1,
                      })}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-xs text-[var(--ink-muted)]">
                      <div className="flex flex-col gap-0.5">
                        <span>
                          {formatDate(row.created_at, locale, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                        {late ? (
                          <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                            {formatLateBy(row)}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      {ai === null ? (
                        <span className="text-[var(--ink-muted)]">—</span>
                      ) : (
                        <span className="text-[var(--ink-soft)]">{formatNumber(ai, locale, 1)}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      {final === null ? (
                        <span className="text-[var(--ink-muted)]">—</span>
                      ) : (
                        <span className="font-medium text-[var(--ink)]">{formatNumber(final, locale, 1)}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={
                            row.status === "graded"
                              ? "rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                              : row.status === "flagged"
                                ? "rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                                : "rounded-full bg-[var(--glass-inset)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--ink-soft)] "
                          }
                        >
                          {ts(row.status)}
                        </span>
                        {showLateBadge ? (
                          <span
                            className={
                              late
                                ? "rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                                : "rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                            }
                          >
                            {late ? t("lateBadge") : t("onTimeBadge")}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-end">
                      <Link
                        href={`/admin/assignments/${assignment.id}/submissions/${row.id}`}
                        className={`${buttonSecondary} px-3 py-1.5 text-xs`}
                      >
                        {t("review")}
                      </Link>
                    </td>
                  </tr>
                );
              };

              const tableHead = (
                <thead className="bg-[var(--glass-inset)] text-xs uppercase tracking-wide text-[var(--ink-muted)] ">
                  <tr>
                    <th scope="col" className="px-5 py-3 text-start font-medium">
                      {t("colStudent")}
                    </th>
                    <th scope="col" className="px-5 py-3 text-start font-medium">
                      {t("colAttempt")}
                    </th>
                    <th scope="col" className="px-5 py-3 text-start font-medium">
                      {t("colSubmitted")}
                    </th>
                    <th scope="col" className="px-5 py-3 text-start font-medium">
                      {t("colAi")}
                    </th>
                    <th scope="col" className="px-5 py-3 text-start font-medium">
                      {t("colFinal")}
                    </th>
                    <th scope="col" className="px-5 py-3 text-start font-medium">
                      {t("colStatus")}
                    </th>
                    <th scope="col" className="px-5 py-3 text-end font-medium">
                      {t("colActions")}
                    </th>
                  </tr>
                </thead>
              );

              const renderTable = (title: string, rows: SubmissionRow[], showLateBadge: boolean) => (
                <section className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-[var(--ink)]">{title}</h3>
                    <span className="rounded-full bg-[var(--glass-inset)] px-2 py-0.5 text-xs font-medium text-[var(--ink-soft)] ">
                      {formatNumber(rows.length, locale)}
                    </span>
                  </div>
                  {rows.length === 0 ? (
                    <EmptyState title={t("noSubmissions")} description={t("noSubmissionsHint")} />
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
                      <table className="w-full min-w-[56rem] text-sm">
                        {tableHead}
                        <tbody className="divide-y divide-[var(--line)]">
                          {rows.map((row) => renderRow(row, showLateBadge))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              );

              return (
                <>
                  {renderTable(t("gradedOnTimeTitle"), gradedOnTime, false)}
                  {deadlineMs !== null ? renderTable(t("gradedLateTitle"), gradedLate, false) : null}
                  {renderTable(t("pendingTitle"), pendingList, true)}
                </>
              );
            })()}
          </div>
        )}
      </Card>
    </div>
  );
}
