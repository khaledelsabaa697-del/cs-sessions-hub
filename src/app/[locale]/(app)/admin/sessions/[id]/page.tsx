import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AttendanceForm } from "@/components/admin/attendance-form";
import { CsvDownloadButton } from "@/components/admin/csv-download-button";
import { DeleteSessionForm } from "@/components/admin/delete-session-form";
import { EditSessionForm } from "@/components/admin/edit-session-form";
import { MaterialsPanel } from "@/components/admin/materials-panel";
import { Alert, Card, PageHeader, buttonSecondary } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { idSchema } from "@/lib/validation";
import type { AttendanceStatus } from "@/lib/types";

type AdminSessionRow = {
  id: string;
  title: string;
  session_date: string;
  attendance_code: string | null;
  code_expires_at: string | null;
};

type StudentRow = {
  id: string;
  full_name: string;
  username: string;
  student_code: string;
};

type AttendanceRow = {
  student_id: string;
  status: AttendanceStatus;
};

type MaterialRow = {
  id: string;
  type: string;
  title: string;
  content: string | null;
  file_path: string | null;
  language: string | null;
};

export default async function AdminSessionPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  await requireStaff(locale);

  const sessionId = idSchema.safeParse(id);
  if (!sessionId.success) notFound();

  const t = await getTranslations("admin.session");
  const tc = await getTranslations("common");

  const supabase = await createClient();
  const [sessionsResult, studentsResult, attendanceResult, materialsResult] = await Promise.all([
    supabase.rpc("admin_list_sessions"),
    supabase
      .from("profiles")
      .select("id, full_name, username, student_code")
      .eq("role", "student")
      .order("full_name", { ascending: true })
      .returns<StudentRow[]>(),
    supabase
      .from("attendance")
      .select("student_id, status")
      .eq("session_id", sessionId.data)
      .returns<AttendanceRow[]>(),
    supabase
      .from("session_materials")
      .select("id, type, title, content, file_path, language")
      .eq("session_id", sessionId.data)
      .order("created_at", { ascending: true })
      .limit(100)
      .returns<MaterialRow[]>(),
  ]);

  const session = ((sessionsResult.data ?? []) as AdminSessionRow[]).find((row) => row.id === sessionId.data);
  if (!session) notFound();

  const students = studentsResult.data ?? [];
  const existing = Object.fromEntries(
    (attendanceResult.data ?? []).map((row) => [row.student_id, row.status]),
  ) as Record<string, AttendanceStatus>;

  const hasError = Boolean(sessionsResult.error || studentsResult.error || attendanceResult.error);

  return (
    <div className="space-y-6">
      <PageHeader
        title={session.title}
        description={formatDate(session.session_date, locale, { dateStyle: "full" })}
        action={
          <div className="flex flex-wrap items-start gap-2">
            <CsvDownloadButton locale={locale} kind="session" id={session.id} label={t("exportAttendance")} />
            <Link href="/admin/sessions" className={buttonSecondary}>
              {t("back")}
            </Link>
          </div>
        }
      />

      {hasError ? <Alert>{tc("errorBody")}</Alert> : null}

      <AttendanceForm locale={locale} sessionId={session.id} students={students} existing={existing} />

      <MaterialsPanel locale={locale} sessionId={session.id} materials={materialsResult.data ?? []} />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <EditSessionForm locale={locale} sessionId={session.id} title={session.title} date={session.session_date} />
        <Card className="p-5">
          <DeleteSessionForm locale={locale} sessionId={session.id} />
        </Card>
      </div>
    </div>
  );
}
