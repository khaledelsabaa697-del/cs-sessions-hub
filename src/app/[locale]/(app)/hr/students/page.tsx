import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireHr } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber } from "@/lib/utils";
import { Card, CardHeader, EmptyState, PageHeader, buttonSecondary, inputClass, buttonPrimary } from "@/components/ui";
import { setAbsenceThresholdAction } from "@/actions/hr";

type OverviewRow = {
  student_id: string;
  full_name: string;
  student_code: string;
  sessions_attended: number;
  sessions_absent: number;
  excused_absences: number;
  attendance_percent: number;
  last_attended: string | null;
  late_submissions: number;
  missed_assignments: number;
  warnings_count: number;
  needs_warning: boolean;
};

export default async function HrStudentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  const profile = await requireHr(locale);
  const t = await getTranslations("hr");
  const tc = await getTranslations("common");

  const query = await searchParams;
  const rawQuery = typeof query.q === "string" ? query.q : "";
  const search = rawQuery.trim().slice(0, 60);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_students_overview", {
    p_search: search || null,
  });
  const rows = (data ?? []) as OverviewRow[];

  const threshold = (await supabase.rpc("hr_get_setting", { p_key: "absence_threshold" })).data ?? "3";
  const isAdmin = profile.role === "admin";

  return (
    <div className="space-y-6">
      <PageHeader title={t("studentsTitle")} />

      <Card>
        <CardHeader title={t("thresholdLabel")} />
        <div className="p-5 text-sm text-[var(--ink-muted)]">
          {t("thresholdHint")} — {t("thresholdLabel")}: {threshold}
        </div>
        {isAdmin ? (
          <form
            action={setAbsenceThresholdAction}
            className="flex flex-wrap items-end gap-2 border-t border-[var(--line)] p-5 "
          >
            <input type="hidden" name="locale" value={locale} />
            <div>
              <label htmlFor="threshold" className="block text-xs font-medium text-[var(--ink-soft)]">
                {t("thresholdLabel")}
              </label>
              <input
                id="threshold"
                name="threshold"
                type="number"
                min={0}
                defaultValue={threshold}
                className="mt-1 w-24 rounded-lg border border-[var(--line)] bg-[var(--glass-strong)] px-3 py-2 text-sm text-[var(--ink)]"
              />
            </div>
            <button type="submit" className={buttonPrimary}>
              {t("saveThreshold")}
            </button>
          </form>
        ) : null}
      </Card>

      <Card>
        <CardHeader title={t("studentsTitle")} />
        <div className="border-b border-[var(--line)] p-4 ">
          <form method="get" className="flex min-w-0 gap-2" role="search">
            <input
              name="q"
              type="search"
              defaultValue={search}
              maxLength={60}
              placeholder={t("searchPlaceholder")}
              className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--glass-strong)] px-3 py-2 text-sm text-[var(--ink)]"
            />
            <button type="submit" className={`${buttonSecondary} shrink-0`}>
              {tc("search")}
            </button>
          </form>
        </div>
        {error ? (
          <div className="p-5 text-sm text-red-600">{error.message}</div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title={t("noStudents")} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[72rem] text-sm">
              <thead className="bg-[var(--glass-inset)] text-xs uppercase tracking-wide text-[var(--ink-muted)] ">
                <tr>
                  <th className="px-4 py-3 text-start font-medium">{t("colStudent")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("colCode")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("colAttended")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("colAbsent")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("colExcused")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("colAttendancePercent")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("colLastAttended")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("colLateSubmissions")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("colMissedAssignments")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("colWarnings")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {rows.map((r) => (
                  <tr key={r.student_id} className={r.needs_warning ? "bg-red-50/40 dark:bg-red-500/5" : ""}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/hr/students/${r.student_id}`}
                        className="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
                      >
                        {r.full_name}
                      </Link>
                      {r.needs_warning ? (
                        <span className="ms-2 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
                          {t("needsWarning")}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{r.student_code}</td>
                    <td className="px-4 py-3">{formatNumber(r.sessions_attended, locale)}</td>
                    <td className="px-4 py-3">{formatNumber(r.sessions_absent, locale)}</td>
                    <td className="px-4 py-3">{formatNumber(r.excused_absences, locale)}</td>
                    <td className="px-4 py-3">{formatNumber(Number(r.attendance_percent), locale, 1)}%</td>
                    <td className="px-4 py-3 text-xs">
                      {r.last_attended ? formatDate(r.last_attended, locale, { dateStyle: "medium" }) : "—"}
                    </td>
                    <td className="px-4 py-3">{formatNumber(r.late_submissions, locale)}</td>
                    <td className="px-4 py-3">{formatNumber(r.missed_assignments, locale)}</td>
                    <td className="px-4 py-3">{formatNumber(r.warnings_count, locale)}</td>
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
