import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Alert, Card, CardHeader, EmptyState, PageHeader, StatCard, buttonSecondary } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate, formatNumber, initials } from "@/lib/utils";
import type { AdminAnalytics, AnalyticsGradeBucket } from "@/lib/types";

const bucketKeys = ["below50", "from50", "from60", "from70", "from80", "from90"] as const;
const bucketColors = ["bg-rose-500", "bg-orange-400", "bg-amber-400", "bg-sky-400", "bg-primary-500", "bg-emerald-500"];

function formatPercent(value: number | null | undefined, locale: string): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  return `${formatNumber(Number(value), locale, 1)}%`;
}

export default async function AdminAnalyticsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  await requireStaff(locale);
  const t = await getTranslations("admin.analytics");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_analytics");
  const analytics = (data ?? null) as AdminAnalytics | null;

  if (error || !analytics) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("subtitle")} />
        <Alert>{t("loadError")}</Alert>
      </div>
    );
  }

  const { totals } = analytics;
  const weeks = analytics.weeks ?? [];
  const grades = analytics.grades ?? [];
  const atRisk = analytics.at_risk ?? [];
  const maxGrade = Math.max(...grades.map((bucket) => Number(bucket.count)), 1);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        action={
          <Link href="/admin/students" className={buttonSecondary}>
            {t("openStudents")}
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("stats.students")}
          value={formatNumber(Number(totals.students), locale)}
          hint={t("stats.studentsHint", {
            sessions: formatNumber(Number(totals.sessions), locale),
            assignments: formatNumber(Number(totals.assignments), locale),
          })}
        />
        <StatCard
          label={t("stats.attendance")}
          value={formatPercent(totals.attendance_percent, locale)}
          hint={t("stats.attendanceHint")}
        />
        <StatCard
          label={t("stats.average")}
          value={formatPercent(totals.average_percent, locale)}
          hint={t("stats.averageHint")}
        />
        <StatCard label={t("stats.atRisk")} value={formatNumber(atRisk.length, locale)} hint={t("stats.atRiskHint")} />
      </div>

      <Card>
        <CardHeader title={t("countsTitle")} />
        <dl className="grid grid-cols-2 divide-[var(--line)] sm:grid-cols-3 lg:grid-cols-6 ">
          {[
            ["submissions", totals.submissions],
            ["graded", totals.graded],
            ["pending", totals.pending],
            ["flagged", totals.flagged],
            ["unreviewedPairs", totals.unreviewed_pairs],
            ["assignments", totals.assignments],
          ].map(([key, value]) => (
            <div key={String(key)} className="border-b border-[var(--line)] px-5 py-4 last:border-b-0 ">
              <dt className="text-xs text-[var(--ink-muted)]">{t(`counts.${key}`)}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-[var(--ink)]">
                {formatNumber(Number(value), locale)}
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("weeksTitle")} description={t("weeksSubtitle")} />
          <div className="space-y-4 p-5">
            {weeks.every((week) => week.sessions === 0) ? (
              <EmptyState title={t("weeksEmpty")} />
            ) : (
              weeks.map((week) => {
                const percent = week.attendance_percent === null ? null : Number(week.attendance_percent);
                return (
                  <div key={week.week_start}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-[var(--ink-soft)]">
                        {formatDate(week.week_start, locale, {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-[var(--ink)]">
                        {percent === null ? "—" : `${formatNumber(percent, locale, 1)}%`}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--glass-inset)]">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{
                          width: percent === null ? "0%" : `${Math.max(2, Math.min(100, percent))}%`,
                        }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
                      {t("weekDetail", {
                        sessions: formatNumber(Number(week.sessions), locale),
                        attended: formatNumber(Number(week.attended), locale),
                        late: formatNumber(Number(week.late), locale),
                      })}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title={t("gradesTitle")} description={t("gradesSubtitle")} />
          <div className="space-y-4 p-5">
            {grades.every((bucket) => Number(bucket.count) === 0) ? (
              <EmptyState title={t("gradesEmpty")} />
            ) : (
              grades.map((bucket: AnalyticsGradeBucket) => {
                const count = Number(bucket.count);
                const key = bucketKeys[bucket.bucket] ?? "below50";
                return (
                  <div key={bucket.bucket}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-[var(--ink-soft)]">{t(`buckets.${key}`)}</span>
                      <span className="text-sm font-semibold tabular-nums text-[var(--ink)]">
                        {formatNumber(count, locale)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--glass-inset)]">
                      <div
                        className={cn("h-full rounded-full", bucketColors[bucket.bucket] ?? "bg-primary-500")}
                        style={{ width: `${(count / maxGrade) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title={t("atRiskTitle")} description={t("atRiskSubtitle")} />
        {atRisk.length === 0 ? (
          <div className="p-5">
            <EmptyState title={t("atRiskEmpty")} description={t("atRiskEmptyHint")} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--glass-inset)] text-xs uppercase tracking-wide text-[var(--ink-muted)] ">
                <tr>
                  <th scope="col" className="px-5 py-3 text-start font-medium">
                    {t("colStudent")}
                  </th>
                  <th scope="col" className="px-5 py-3 text-start font-medium">
                    {t("colAttendance")}
                  </th>
                  <th scope="col" className="px-5 py-3 text-start font-medium">
                    {t("colAverage")}
                  </th>
                  <th scope="col" className="px-5 py-3 text-end font-medium">
                    {t("colActions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {atRisk.map((student) => (
                  <tr key={student.username}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-50 text-[11px] font-semibold text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">
                          {initials(student.full_name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[var(--ink)]">{student.full_name}</p>
                          <p className="truncate text-xs text-[var(--ink-muted)]">
                            @{student.username} · <span className="font-mono">{student.student_code}</span>
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      {student.attendance_percent === null ? (
                        <span className="text-[var(--ink-muted)]">—</span>
                      ) : (
                        <span
                          className={
                            Number(student.attendance_percent) < 50
                              ? "font-semibold text-rose-600 dark:text-rose-400"
                              : "font-semibold text-amber-600 dark:text-amber-400"
                          }
                        >
                          {formatNumber(Number(student.attendance_percent), locale, 1)}%
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      {student.average_percent === null ? (
                        <span className="text-[var(--ink-muted)]">—</span>
                      ) : (
                        <span className="font-semibold text-[var(--ink)]">
                          {formatNumber(Number(student.average_percent), locale, 1)}%
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-end">
                      <Link
                        href={`/admin/students?q=${encodeURIComponent(student.username)}`}
                        className={`${buttonSecondary} px-3 py-1.5 text-xs`}
                      >
                        {t("viewStudent")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
