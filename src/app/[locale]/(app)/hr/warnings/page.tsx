import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireHr } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Card, CardHeader, EmptyState, PageHeader, buttonSecondary } from "@/components/ui";
import { WarningForm } from "@/components/hr/warning-form";

type StudentRow = { id: string; full_name: string; student_code: string };
type WarningRow = { id: string; reason: string; note: string | null; created_at: string };

export default async function HrWarningsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ student?: string; q?: string }>;
}) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  await requireHr(locale);
  const t = await getTranslations("hr");
  const tc = await getTranslations("common");

  const query = await searchParams;
  const selectedStudent = typeof query.student === "string" ? query.student : "";
  const search = typeof query.q === "string" ? query.q.trim().slice(0, 60) : "";

  const supabase = await createClient();

  // HR has no SELECT on profiles (it contains emails); use the narrow RPC.
  const { data: studentRows, error: studentsError } = await supabase.rpc("hr_list_students");
  if (studentsError) console.error("[hr/warnings] hr_list_students error:", studentsError);

  const allStudents = (studentRows ?? []) as StudentRow[];
  const needle = search.toLowerCase();
  const studentList = needle
    ? allStudents.filter(
        (s) => s.full_name.toLowerCase().includes(needle) || s.student_code.toLowerCase().includes(needle),
      )
    : allStudents;

  let warnings: WarningRow[] = [];
  if (selectedStudent) {
    const { data } = await supabase.rpc("hr_student_detail", { p_student_id: selectedStudent });
    warnings = (data as { warnings?: WarningRow[] })?.warnings ?? [];
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("warningsTitle")} />

      <Card>
        <CardHeader title={t("searchPlaceholder")} />
        <form method="get" className="flex min-w-0 gap-2 p-5" role="search">
          <input type="hidden" name="student" value={selectedStudent} />
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
      </Card>

      <Card>
        <CardHeader title={t("createWarning")} />
        <WarningForm locale={locale} students={studentList} defaultStudentId={selectedStudent} />
      </Card>

      {selectedStudent ? (
        <Card>
          <CardHeader title={t("warningsTitle")} />
          {warnings.length === 0 ? (
            <div className="p-5">
              <EmptyState title={t("noWarnings")} />
            </div>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {warnings.map((w) => (
                <li key={w.id} className="px-5 py-3">
                  <p className="text-sm font-medium text-[var(--ink)]">{w.reason}</p>
                  {w.note ? <p className="text-xs text-[var(--ink-muted)]">{w.note}</p> : null}
                  <p className="text-xs text-[var(--ink-muted)]">
                    {formatDate(w.created_at, locale, { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </div>
  );
}
