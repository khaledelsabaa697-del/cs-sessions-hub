import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Alert, Card, CardHeader, EmptyState, PageHeader, badgeClass } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber, cn } from "@/lib/utils";
import type { SubmissionStatus } from "@/lib/types";

type AssignmentRow = {
  id: string;
  title: string;
  description: string;
  deadline: string | null;
  max_score: number | string;
  allow_resubmit: boolean;
  created_at: string;
};

type MySubmissionRow = {
  assignment_id: string;
  final_score: number | string | null;
  ai_score: number | string | null;
  status: SubmissionStatus;
};

export default async function StudentAssignmentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  const profile = await requireProfile(locale);
  if (profile.role === "admin") redirect(`/${locale}/admin/assignments`);

  const t = await getTranslations("assignments");
  const supabase = await createClient();

  const [assignmentsResult, submissionsResult] = await Promise.all([
    supabase
      .from("assignments")
      .select("id, title, description, deadline, max_score, allow_resubmit, created_at")
      .order("deadline", { ascending: true, nullsFirst: false })
      .returns<AssignmentRow[]>(),
    supabase
      .from("submissions")
      .select("assignment_id, final_score, ai_score, status")
      .eq("student_id", profile.id)
      .returns<MySubmissionRow[]>(),
  ]);

  if (assignmentsResult.error) console.error("[student assignments] assignments error:", assignmentsResult.error);
  if (submissionsResult.error) console.error("[student assignments] submissions error:", submissionsResult.error);

  const loadError = Boolean(assignmentsResult.error || submissionsResult.error);
  const assignments = assignmentsResult.data ?? [];
  const submissions = submissionsResult.data ?? [];

  const byAssignment = new Map<string, MySubmissionRow[]>();
  for (const row of submissions) {
    const list = byAssignment.get(row.assignment_id) ?? [];
    list.push(row);
    byAssignment.set(row.assignment_id, list);
  }

  const now = Date.now();

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />

      {loadError ? <Alert>{t("loadError")}</Alert> : null}

      <Card>
        <CardHeader title={t("listTitle")} />
        {assignments.length === 0 ? (
          <div className="p-5">
            <EmptyState title={t("empty")} />
          </div>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {assignments.map((assignment) => {
              const attempts = byAssignment.get(assignment.id) ?? [];
              const max = Number(assignment.max_score) || 100;
              const open = !assignment.deadline || Date.parse(assignment.deadline) > now;
              const pending = attempts.some((row) =>
                ["pending", "queued", "grading", "pending_retry", "failed"].includes(row.status),
              );

              let bestPercent: number | null = null;
              for (const row of attempts) {
                const score = Number(row.final_score ?? row.ai_score);
                if (!Number.isFinite(score)) continue;
                const percent = Math.min(100, Math.max(0, (score / max) * 100));
                if (bestPercent === null || percent > bestPercent) bestPercent = percent;
              }

              return (
                <li key={assignment.id}>
                  <Link
                    href={`/assignments/${assignment.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition hover:bg-[var(--glass-inset)] "
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium text-[var(--ink)]">{assignment.title}</p>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                            open
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                              : "bg-[var(--glass-inset)] text-[var(--ink-soft)] ",
                          )}
                        >
                          {open ? t("open") : t("closed")}
                        </span>
                        {pending ? (
                          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                            {t(
                              attempts.some(
                                (row) =>
                                  row.status === "queued" || row.status === "grading" || row.status === "pending_retry",
                              )
                                ? "statusGrading"
                                : attempts.some((row) => row.status === "failed")
                                  ? "statusFailed"
                                  : "statusPending",
                            )}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-[var(--ink-muted)]">
                        {assignment.deadline
                          ? t("due", {
                              date: formatDate(assignment.deadline, locale, {
                                dateStyle: "medium",
                                timeStyle: "short",
                              }),
                            })
                          : t("noDeadline")}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {bestPercent !== null ? (
                        <span className={badgeClass}>
                          {t("best", {
                            percent: formatNumber(bestPercent, locale, 1),
                          })}
                        </span>
                      ) : null}
                      <span className="text-xs text-[var(--ink-muted)]">
                        {t("attempts", { count: attempts.length })}
                      </span>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="size-4 text-[var(--ink-muted)] rtl:-scale-x-100"
                        aria-hidden="true"
                      >
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
