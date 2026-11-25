import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireHr } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Card, CardHeader, EmptyState, PageHeader, inputClass, labelClass, buttonPrimary, buttonSecondary } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createWarningAction } from "@/actions/hr";

type StudentRow = { id: string; full_name: string; student_code: string };

export default async function HrWarningsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ student?: string }>;
}) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  await requireHr(locale);
  const t = await getTranslations("hr");

  const query = await searchParams;
  const selectedStudent = typeof query.student === "string" ? query.student : "";

  const supabase = await createClient();
  const { data: students } = await supabase
    .from("profiles")
    .select("id, full_name, student_code")
    .eq("role", "student")
    .order("full_name", { ascending: true })
    .limit(500)
    .returns<StudentRow[]>();

  const studentList = students ?? [];

  // Load warnings for selected student (if any) via RPC detail
  let warnings: { id: string; reason: string; note: string | null; created_at: string }[] = [];
  if (selectedStudent) {
    const { data } = await supabase.rpc("hr_student_detail", { p_student_id: selectedStudent });
    warnings = (data as { warnings?: typeof warnings })?.warnings ?? [];
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("warningsTitle")} />

      <Card>
        <CardHeader title={t("createWarning")} />
        <form action={createWarningAction} className="space-y-4 p-5">
          <input type="hidden" name="locale" value={locale} />
          <div>
            <label htmlFor="w-student" className={labelClass}>{t("colStudent")}</label>
            <select id="w-student" name="student_id" defaultValue={selectedStudent} className={inputClass} required>
              <option value="">—</option>
              {studentList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} ({s.student_code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="w-reason" className={labelClass}>{t("warningReason")}</label>
            <input id="w-reason" name="reason" type="text" required className={inputClass} />
          </div>
          <div>
            <label htmlFor="w-note" className={labelClass}>{t("warningNote")}</label>
            <textarea id="w-note" name="note" rows={3} className={inputClass} />
          </div>
          <SubmitButton idle={t("createWarning")} pendingLabel={t("createWarning")} />
        </form>
      </Card>

      {selectedStudent ? (
        <Card>
          <CardHeader title={t("warningsTitle")} />
          {warnings.length === 0 ? (
            <div className="p-5">
              <EmptyState title={t("noWarnings")} />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {warnings.map((w) => (
                <li key={w.id} className="px-5 py-3">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{w.reason}</p>
                  {w.note ? <p className="text-xs text-slate-500 dark:text-slate-400">{w.note}</p> : null}
                  <p className="text-xs text-slate-400">{formatDate(w.created_at, locale, { dateStyle: "medium", timeStyle: "short" })}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </div>
  );
}
