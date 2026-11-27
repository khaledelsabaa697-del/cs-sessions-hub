import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Alert, Card, CardHeader, EmptyState, PageHeader, StatCard, buttonPrimary } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber } from "@/lib/utils";
import type { AttendanceStatus } from "@/lib/types";

type SessionRow = {
  id: string;
  title: string;
  session_date: string;
};

type AttendanceRow = {
  session_id: string;
  status: AttendanceStatus;
};

const statusClasses: Record<AttendanceStatus | "none", string> = {
  present:
    "bg-emerald-50 text-emerald-700 ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
  late: "bg-amber-50 text-amber-700 ring-amber-600/10 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20",
  absent: "bg-rose-50 text-rose-700 ring-rose-600/10 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20",
  none: "bg-[var(--glass-inset)] text-[var(--ink-soft)] ring-slate-500/10 dark:ring-slate-400/20",
};

export default async function StudentAttendancePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  const profile = await requireProfile(locale);
  if (profile.role === "admin") redirect(`/${locale}/admin/sessions`);

  const t = await getTranslations("attendance");
  const ts = await getTranslations("attendanceStatus");

  const today = new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  const [sessionsResult, attendanceResult] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, title, session_date")
      .lte("session_date", today)
      .order("session_date", { ascending: false })
      .limit(100)
      .returns<SessionRow[]>(),
    supabase.from("attendance").select("session_id, status").eq("student_id", profile.id).returns<AttendanceRow[]>(),
  ]);

  const sessions = sessionsResult.data ?? [];
  const statusBySession = new Map((attendanceResult.data ?? []).map((row) => [row.session_id, row.status]));

  const counts = { present: 0, late: 0, absent: 0 };
  for (const session of sessions) {
    const status = statusBySession.get(session.id);
    if (status) counts[status] += 1;
  }

  const attended = counts.present + counts.late;
  const total = sessions.length;
  const rate = total > 0 ? Math.round((attended / total) * 100) : 0;
  const hasError = Boolean(sessionsResult.error || attendanceResult.error);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />

      {hasError ? <Alert>{t("loadError")}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("rate")}
          value={total > 0 ? `${formatNumber(rate, locale)}%` : "—"}
          hint={t("rateHint", { attended, total })}
        />
        <StatCard label={ts("present")} value={formatNumber(counts.present, locale)} />
        <StatCard label={ts("late")} value={formatNumber(counts.late, locale)} />
        <StatCard label={ts("absent")} value={formatNumber(counts.absent, locale)} />
      </div>

      <Card>
        <CardHeader title={t("history")} />
        {sessions.length === 0 ? (
          <div className="p-5">
            <EmptyState title={t("empty")} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <thead className="bg-[var(--glass-inset)] text-xs uppercase tracking-wide text-[var(--ink-muted)] ">
                <tr>
                  <th scope="col" className="px-5 py-3 text-start font-medium">
                    {t("colSession")}
                  </th>
                  <th scope="col" className="px-5 py-3 text-start font-medium">
                    {t("colStatus")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {sessions.map((session) => {
                  const status = statusBySession.get(session.id) ?? "none";
                  return (
                    <tr key={session.id}>
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-[var(--ink)]">{session.title}</p>
                        <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                          {formatDate(session.session_date, locale)}
                        </p>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusClasses[status]}`}
                        >
                          {status === "none" ? t("notRecorded") : ts(status)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-[var(--ink-muted)]">{t("note")}</p>
    </div>
  );
}
