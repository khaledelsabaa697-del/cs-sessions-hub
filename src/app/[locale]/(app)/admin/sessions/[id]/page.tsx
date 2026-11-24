import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import QRCode from "qrcode";
import { Link } from "@/i18n/navigation";
import { AttendanceForm } from "@/components/admin/attendance-form";
import { CodePanel } from "@/components/admin/code-panel";
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

export default async function AdminSessionPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
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

  const session = ((sessionsResult.data ?? []) as AdminSessionRow[]).find(
    (row) => row.id === sessionId.data,
  );
  if (!session) notFound();

  const students = studentsResult.data ?? [];
  const existing = Object.fromEntries(
    (attendanceResult.data ?? []).map((row) => [row.student_id, row.status]),
  ) as Record<string, AttendanceStatus>;

  const active = Boolean(
    session.attendance_code &&
      session.code_expires_at &&
      new Date(session.code_expires_at).getTime() > Date.now(),
  );

  let checkInUrl: string | null = null;
  let qrDataUrl: string | null = null;

  if (active && session.attendance_code) {
    const headerList = await headers();
    const host =
      headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
    const forwardedProto = headerList.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const proto = forwardedProto || (host.startsWith("localhost") ? "http" : "https");
    checkInUrl = new URL(
      `/${locale}/check-in?code=${encodeURIComponent(session.attendance_code)}`,
      `${proto}://${host}`,
    ).toString();

    try {
      qrDataUrl = await QRCode.toDataURL(checkInUrl, {
        margin: 1,
        width: 400,
        errorCorrectionLevel: "M",
      });
    } catch (error) {
      console.error("QR generation failed:", error);
    }
  }

  const hasError = Boolean(
    sessionsResult.error || studentsResult.error || attendanceResult.error,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={session.title}
        description={formatDate(session.session_date, locale, { dateStyle: "full" })}
        action={
          <div className="flex flex-wrap items-start gap-2">
            <CsvDownloadButton
              locale={locale}
              kind="session"
              id={session.id}
              label={t("exportAttendance")}
            />
            <Link href="/admin/sessions" className={buttonSecondary}>
              {t("back")}
            </Link>
          </div>
        }
      />

      {hasError ? <Alert>{tc("errorBody")}</Alert> : null}

      <CodePanel
        locale={locale}
        sessionId={session.id}
        code={session.attendance_code}
        expiresAt={session.code_expires_at}
        active={active}
        qrDataUrl={qrDataUrl}
        checkInUrl={checkInUrl}
      />

      <AttendanceForm
        locale={locale}
        sessionId={session.id}
        students={students}
        existing={existing}
      />

      <MaterialsPanel
        locale={locale}
        sessionId={session.id}
        materials={materialsResult.data ?? []}
      />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <EditSessionForm
          locale={locale}
          sessionId={session.id}
          title={session.title}
          date={session.session_date}
        />
        <Card className="p-5">
          <DeleteSessionForm locale={locale} sessionId={session.id} />
        </Card>
      </div>
    </div>
  );
}
