import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireHr } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";

type Detail = {
  profile: { id: string; full_name: string; student_code: string; created_at: string };
  sessions: {
    session_id: string;
    title: string;
    session_date: string;
    status: string;
    excused: boolean;
    excuse_note: string | null;
  }[];
  assignments: { assignment_id: string; title: string; deadline: string | null; state: string }[];
  warnings: { id: string; reason: string; note: string | null; created_at: string }[];
};

export default async function HrStudentDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  await requireHr(locale);
  const t = await getTranslations("hr");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_student_detail", { p_student_id: id });
  if (error || !data) notFound();
  const detail = data as Detail;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/hr/students" className="text-sm font-medium text-primary-600 hover:text-primary-500">
          ← {t("studentsTitle")}
        </Link>
      </div>
      <PageHeader title={detail.profile.full_name} description={detail.profile.student_code} />

      <Card>
        <CardHeader title={t("absencesTitle")} />
        {detail.sessions.length === 0 ? (
          <div className="p-5">
            <EmptyState title={t("noStudents")} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="bg-[var(--glass-inset)] text-xs uppercase tracking-wide text-[var(--ink-muted)] ">
                <tr>
                  <th className="px-4 py-3 text-start font-medium">Session</th>
                  <th className="px-4 py-3 text-start font-medium">Date</th>
                  <th className="px-4 py-3 text-start font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {detail.sessions.map((s) => (
                  <tr key={s.session_id}>
                    <td className="px-4 py-3">{s.title}</td>
                    <td className="px-4 py-3 text-xs">{formatDate(s.session_date, locale, { dateStyle: "medium" })}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          s.status === "present"
                            ? "rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                            : s.excused
                              ? "rounded-full bg-[var(--glass-inset)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--ink-soft)] "
                              : "rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                        }
                      >
                        {s.excused ? t("excusedLabel") : s.status}
                      </span>
                      {s.excuse_note ? (
                        <span className="ms-2 text-xs text-[var(--ink-muted)]">{s.excuse_note}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title={t("assignmentsTitle")} />
        {detail.assignments.length === 0 ? (
          <div className="p-5">
            <EmptyState title={t("noStudents")} />
          </div>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {detail.assignments.map((a) => (
              <li key={a.assignment_id} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-[var(--ink)]">{a.title}</span>
                <span
                  className={
                    a.state === "missing"
                      ? "rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300"
                      : a.state === "late"
                        ? "rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                        : "rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                  }
                >
                  {a.state === "missing"
                    ? t("missing")
                    : a.state === "late"
                      ? t("submittedLate")
                      : t("submittedOnTime")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title={t("warningsTitle")} />
        {detail.warnings.length === 0 ? (
          <div className="p-5">
            <EmptyState title={t("noWarnings")} />
          </div>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {detail.warnings.map((w) => (
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
    </div>
  );
}
