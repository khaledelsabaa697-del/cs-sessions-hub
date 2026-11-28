import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireHr } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { AttendanceForm } from "@/components/admin/attendance-form";
import { HrSessionSelect } from "@/components/hr/hr-session-select";
import { Alert, Card, CardHeader, PageHeader, buttonSecondary } from "@/components/ui";
import type { AttendanceStatus } from "@/lib/types";

type SessionRow = { id: string; title: string; session_date: string };
type StudentRow = { id: string; full_name: string; student_code: string };
type AttendanceRow = { student_id: string; status: "present" | "absent" | "late" | "excused" };

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
  const tSession = await getTranslations("admin.session");

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

  if (sessionsResult.error) {
    console.error("[hr/attendance] sessions query failed:", sessionsResult.error);
  }
  if (studentsResult.error) {
    console.error("[hr/attendance] hr_list_students RPC failed:", studentsResult.error);
  }

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
    if (attendanceResult.error) {
      console.error("[hr/attendance] attendance query failed:", attendanceResult.error);
    }
  }

  const existing = Object.fromEntries(
    (attendanceResult.data ?? []).map((row) => [row.student_id, row.status]),
  ) as Record<string, AttendanceStatus>;

  const students = allStudents.map((student) => ({
    id: student.id,
    full_name: student.full_name,
    username: "",
    student_code: student.student_code,
  }));

  const sessionOptions = sessions.map((session) => ({
    id: session.id,
    label: `${session.title} — ${formatDate(session.session_date, locale)}`,
  }));

  const hasError = Boolean(sessionsResult.error || studentsResult.error || attendanceResult.error);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={tSession("attendanceSubtitle")}
        action={
          <Link href="/hr" className={buttonSecondary}>
            {t("backToAdmin")}
          </Link>
        }
      />

      {hasError ? <Alert>{t("loadError")}</Alert> : null}

      <Card>
        <CardHeader title={t("title")} description={tSession("attendanceSubtitle")} />
        <div className="p-5">
          <HrSessionSelect
            label={t("sessionLabel")}
            placeholder={t("selectSession")}
            sessions={sessionOptions}
            selectedId={selectedSession?.id ?? null}
          />
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
