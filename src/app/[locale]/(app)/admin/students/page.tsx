import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CreateStudentForm } from "@/components/admin/create-student-form";
import { CsvDownloadButton } from "@/components/admin/csv-download-button";
import { CsvImportForm } from "@/components/admin/csv-import-form";
import { ResetPasswordDialog } from "@/components/admin/reset-password-dialog";
import { ChangeRoleDialog } from "@/components/admin/change-role-dialog";
import { DeleteAccountDialog } from "@/components/admin/delete-account-dialog";
import { Alert, Card, CardHeader, EmptyState, PageHeader, buttonSecondary, inputClass } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber, initials } from "@/lib/utils";
import type { StudentMetric } from "@/lib/types";

type StudentRow = {
  id: string;
  username: string;
  student_code: string;
  full_name: string;
  display_name: string;
  role: string;
  created_at: string;
  opted_out_of_leaderboard: boolean;
};

export default async function AdminStudentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  await requireAdmin(locale);
  const t = await getTranslations("admin.students");
  const tc = await getTranslations("common");

  const query = await searchParams;
  const rawQuery = typeof query.q === "string" ? query.q : "";
  const search = rawQuery.trim().slice(0, 60);
  const safeSearch = search
    .replace(/[%,()\\_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const supabase = await createClient();
  let request = supabase
    .from("profiles")
    .select("id, username, student_code, full_name, display_name, role, created_at, opted_out_of_leaderboard")
    .order("created_at", { ascending: false })
    .limit(200);

  if (safeSearch) {
    request = request.or(
      `username.ilike.%${safeSearch}%,full_name.ilike.%${safeSearch}%,student_code.ilike.%${safeSearch}%`,
    );
  }

  const { data: students, error } = await request.returns<StudentRow[]>();

  const { data: metrics, error: metricsError } = await supabase.rpc("admin_student_metrics");
  const metricById = new Map(((metrics ?? []) as StudentMetric[]).map((row) => [row.student_id, row]));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        action={<CsvDownloadButton locale={locale} kind="students" label={t("exportCsv")} />}
      />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <CreateStudentForm locale={locale} />
        <CsvImportForm locale={locale} />
      </div>

      <Card>
        <CardHeader title={t("listTitle")} />
        <div className="border-b border-[var(--line)] p-4 ">
          <div className="flex flex-wrap items-center gap-2">
            <form method="get" className="flex min-w-0 flex-1 gap-2" role="search">
              <label htmlFor="student-search" className="sr-only">
                {tc("search")}
              </label>
              <input
                id="student-search"
                name="q"
                type="search"
                defaultValue={search}
                maxLength={60}
                placeholder={t("searchPlaceholder")}
                className={inputClass}
              />
              <button type="submit" className={`${buttonSecondary} shrink-0`}>
                {tc("search")}
              </button>
            </form>
            {search ? (
              <Link href="/admin/students" className={buttonSecondary}>
                {tc("clear")}
              </Link>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="p-5">
            <Alert>{t("loadError")}</Alert>
          </div>
        ) : !students || students.length === 0 ? (
          <div className="p-5">
            <EmptyState title={search ? t("emptySearch") : t("empty")} />
          </div>
        ) : (
          <>
            {metricsError ? (
              <div className="px-5 pt-4">
                <Alert>{t("metricsError")}</Alert>
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] text-sm">
                <thead className="bg-[var(--glass-inset)] text-xs uppercase tracking-wide text-[var(--ink-muted)] ">
                  <tr>
                    <th scope="col" className="px-5 py-3 text-start font-medium">
                      {t("colStudent")}
                    </th>
                    <th scope="col" className="px-5 py-3 text-start font-medium">
                      {t("colCode")}
                    </th>
                    <th scope="col" className="px-5 py-3 text-start font-medium">
                      {t("role")}
                    </th>
                    <th scope="col" className="px-5 py-3 text-start font-medium">
                      {t("colAttendance")}
                    </th>
                    <th scope="col" className="px-5 py-3 text-start font-medium">
                      {t("colAverage")}
                    </th>
                    <th scope="col" className="px-5 py-3 text-start font-medium">
                      {t("colLastAttended")}
                    </th>
                    <th scope="col" className="px-5 py-3 text-end font-medium">
                      {t("colActions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {students.map((student) => {
                    const metric = metricById.get(student.id);
                    return (
                      <tr key={student.id}>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">
                              {initials(student.full_name)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-[var(--ink)]">{student.full_name}</p>
                              <p className="truncate text-xs text-[var(--ink-muted)]">@{student.username}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="font-mono text-xs text-[var(--ink-soft)]">{student.student_code}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center rounded-full bg-[var(--glass-inset)] px-2.5 py-0.5 text-xs font-medium text-[var(--ink-soft)] ">
                            {student.role}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5">
                          {metric ? (
                            metric.sessions_total === 0 ? (
                              <span className="text-xs text-[var(--ink-muted)]">{t("noSessions")}</span>
                            ) : (
                              <>
                                <span className="font-medium text-[var(--ink)]">
                                  {formatNumber(metric.attendance_percent ?? 0, locale)}%
                                </span>
                                <span className="ms-1.5 text-xs text-[var(--ink-muted)]">
                                  ({metric.attended}/{metric.sessions_total})
                                </span>
                              </>
                            )
                          ) : (
                            <span className="text-[var(--ink-muted)]">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5">
                          {metric?.average_percent === null || !metric ? (
                            <span className="text-[var(--ink-muted)]">—</span>
                          ) : (
                            <span className="font-medium text-[var(--ink)]">
                              {formatNumber(metric.average_percent, locale, 1)}%
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-sm text-[var(--ink-muted)]">
                          {metric?.last_attended_at ? formatDate(metric.last_attended_at, locale) : t("never")}
                        </td>
                        <td className="px-5 py-3.5 text-end">
                          <div className="flex flex-wrap justify-end gap-2">
                            <ResetPasswordDialog
                              studentId={student.id}
                              studentName={student.full_name}
                              locale={locale}
                            />
                            <ChangeRoleDialog
                              studentId={student.id}
                              studentName={student.full_name}
                              currentRole={student.role}
                              locale={locale}
                            />
                            {student.role === "student" ? (
                              <DeleteAccountDialog
                                studentId={student.id}
                                studentName={student.full_name}
                                locale={locale}
                              />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
