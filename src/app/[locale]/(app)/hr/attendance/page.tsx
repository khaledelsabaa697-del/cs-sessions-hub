import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireHr } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { AttendanceForm } from "@/components/admin/attendance-form";
import { Alert, Card, CardHeader, PageHeader, buttonSecondary, inputClass, labelClass } from "@/components/ui";

type SessionRow = { id: string; title: string; session_date: string };
type StudentRow = { id: string; full_name: string; student_code: string };
type AttendanceRow = { student_id: string; status: "present" | "absent" | "late" };

export default async function HrAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ session?: string }>;
}) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  await requireHr(locale);
  const t = await getTranslations("admin.attendance");
  const ts = await getTranslations("attendanceStatus");
  const tc = await getTranslations("common");

  const { session: sessionIdParam } = await searchParams;
  const supabase = await createClient();

  const [sessionsResult, studentsResult] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, title, session_date")
      .order("session_date", { ascending: false })
      .limit(100)
      .returns<SessionRow[]>(),
    supabase.rpc("hr_list_students"),
  ]);

  const sessions = sessionsResult.data ?? [];
  const allStudents = (studentsResult.data ?? []) as StudentRow[];

  const selectedSession = sessionIdParam
    ? (sessions.find((s) => s.id === sessionIdParam) ?? null)
    : (sessions[0] ?? null);

  let attendanceResult: { data: AttendanceRow[] | null; error: { message: string } | null } = {
    data: null,
    error: null,
  };
  if (selectedSession) {
    attendanceResult = await supabase
      .from("attendance")
      .select("student_id, status")
      .eq("session_id", selectedSession.id)
      .returns<AttendanceRow[]>();
  }

  const existing = Object.fromEntries(
    (attendanceResult.data ?? []).map((row) => [row.student_id, row.status]),
  ) as Record<string, "present" | "absent" | "late">;

  const students = allStudents.map((student) => ({
    id: student.id,
    full_name: student.full_name,
    username: "",
    student_code: student.student_code,
  }));

  const hasError = Boolean(sessionsResult.error || studentsResult.error || attendanceResult.error);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        action={
          <Link href="/hr" className={buttonSecondary}>
            {tc("back")}
          </Link>
        }
      />

      {hasError ? <Alert>{t("loadError")}</Alert> : null}

      <Card>
        <CardHeader title={t("recordTitle")} description={t("recordSubtitle")} />
        <div className="p-5">
          <label htmlFor="hr-session-select" className={labelClass}>
            {t("sessionLabel")}
          </label>
          <select
            id="hr-session-select"
            className={inputClass}
            onChange={(event) => {
              const params = new URLSearchParams(window.location.search);
              if (event.target.value) params.set("session", event.target.value);
              else params.delete("session");
              window.location.href = `?${params.toString()}`;
            }}
            value={selectedSession?.id ?? ""}
          >
            <option value="">{t("selectSession")}</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.title} — {formatDate(session.session_date, locale)}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {selectedSession ? (
        <AttendanceForm locale={locale} sessionId={selectedSession.id} students={students} existing={existing} />
      ) : (
        <Card className="p-5">
          <p className="text-sm text-[var(--ink-muted)]">{t("selectSessionFirst")}</p>
        </Card>
      )}
    </div>
  );
}
