import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireHr } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { AdminAttendanceClient } from "../../admin/admin-attendance-client";

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

  const { session: sessionIdParam } = await searchParams;
  const supabase = await createClient();
  const [sessionsResult, studentsResult] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, title, session_date")
      .order("session_date", { ascending: false })
      .limit(100)
      .returns<SessionRow[]>(),
    // HR has no SELECT on profiles (it contains emails); use the narrow RPC.
    supabase.rpc("hr_list_students"),
  ]);

  const sessions = sessionsResult.data ?? [];
  const allStudents = (studentsResult.data ?? []) as StudentRow[];
  const selectedSession = sessionIdParam
    ? (sessions.find((s) => s.id === sessionIdParam) ?? null)
    : (sessions[0] ?? null);

  const statusByStudent = new Map<string, "present" | "absent" | "late">();
  if (selectedSession) {
    const attendanceResult = await supabase
      .from("attendance")
      .select("student_id, status")
      .eq("session_id", selectedSession.id)
      .returns<AttendanceRow[]>();
    for (const row of attendanceResult.data ?? []) {
      statusByStudent.set(row.student_id, row.status);
    }
  }

  const presentStudents = allStudents
    .filter((s) => statusByStudent.get(s.id) === "present")
    .map((s) => ({ ...s, status: "present" as const }));
  const lateStudents = allStudents
    .filter((s) => statusByStudent.get(s.id) === "late")
    .map((s) => ({ ...s, status: "late" as const }));
  const absentStudents = allStudents
    .filter((s) => statusByStudent.get(s.id) === "absent")
    .map((s) => ({ ...s, status: "absent" as const }));
  const markedStudents = [...presentStudents, ...lateStudents, ...absentStudents];

  const errorMessages: string[] = [];
  if (sessionsResult.error) errorMessages.push(sessionsResult.error.message);
  if (studentsResult.error) errorMessages.push(studentsResult.error.message);
  const hasError = errorMessages.length > 0;

  return (
    <AdminAttendanceClient
      locale={locale}
      sessions={sessions}
      markedStudents={markedStudents}
      selectedSession={selectedSession}
      hasError={hasError}
      errorMessage={process.env.NODE_ENV !== "production" ? errorMessages.join("; ") : undefined}
    />
  );
}
