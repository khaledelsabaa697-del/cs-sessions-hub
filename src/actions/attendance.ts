"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import type { AttendanceStatus } from "@/lib/types";

type MarkAttendanceRow = {
  session_id: string;
  session_title: string;
  status: AttendanceStatus;
};

type RecordAttendanceResult =
  | { status: "idle" }
  | { status: "error"; error: string }
  | {
      status: "success";
      message: string;
      recorded: number;
      alreadyRecorded: string[];
      notFound: string[];
    };

export async function recordAttendanceAction(
  _previous: RecordAttendanceResult,
  formData: FormData,
): Promise<RecordAttendanceResult> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "admin.attendance" });

  const profile = await getCurrentProfile();
  if (!profile) {
    return { status: "error", error: t("errors.signedOut") };
  }
  if (profile.role === "student") {
    return { status: "error", error: t("errors.teachersOnly") };
  }

  const sessionId = formData.get("session_id") as string;
  const rawIds = formData.get("student_ids") as string;

  if (!sessionId || !rawIds?.trim()) {
    return { status: "error", error: t("errors.missingFields") };
  }

  const supabase = await createClient();

  // Verify session exists
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, title")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError || !session) {
    return { status: "error", error: t("errors.sessionNotFound") };
  }

  // Parse student IDs (accept newlines, commas, spaces)
  const inputIds = rawIds
    .split(/[\n,]+/)
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  // Remove duplicates
  const uniqueIds = [...new Set(inputIds)];

  if (uniqueIds.length === 0) {
    return { status: "error", error: t("errors.noIds") };
  }

  // Find matching students by student_code OR id. Only real UUIDs may go into
  // the `id` filter — casting a code like "CS-0002" to uuid aborts the query.
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const uuidIds = uniqueIds.filter((id) => uuidPattern.test(id));
  const codeIds = uniqueIds.filter(
    (id) => !uuidPattern.test(id) && /^[A-Za-z0-9_-]{1,64}$/.test(id),
  );
  const filters: string[] = [];
  if (uuidIds.length > 0) {
    filters.push(`id.in.(${uuidIds.map((id) => `"${id}"`).join(",")})`);
  }
  if (codeIds.length > 0) {
    filters.push(`student_code.in.(${codeIds.map((id) => `"${id}"`).join(",")})`);
  }

  const studentsResult: {
    data: Array<{ id: string; student_code: string; full_name: string }> | null;
    error: { message: string } | null;
  } = { data: [], error: null };

  if (filters.length > 0) {
    if (profile.role === "hr") {
      // HR has no SELECT on profiles (it contains emails). Use the narrow,
      // security-definer lookup RPC instead.
      const result = await supabase.rpc("hr_find_students", {
        p_ids: uuidIds.length > 0 ? uuidIds : null,
        p_codes: codeIds.length > 0 ? codeIds : null,
      });
      studentsResult.data = (result.data ?? []) as Array<{
        id: string;
        student_code: string;
        full_name: string;
      }>;
      studentsResult.error = result.error;
    } else {
      const result = await supabase
        .from("profiles")
        .select("id, student_code, full_name")
        .eq("role", "student")
        .or(filters.join(","))
        .returns<Array<{ id: string; student_code: string; full_name: string }>>();
      studentsResult.data = result.data;
      studentsResult.error = result.error;
    }
  }

  if (studentsResult.error) {
    console.error("recordAttendanceAction student lookup failed:", studentsResult.error.message);
    return { status: "error", error: t("errors.lookupFailed") };
  }

  const students = studentsResult.data ?? [];

  const foundIds = new Set(students?.map((s) => s.id) ?? []);
  const foundCodes = new Set(students?.map((s) => s.student_code) ?? []);
  const allFound = new Set([...foundIds, ...foundCodes]);

  const notFound = uniqueIds.filter((id) => !allFound.has(id));

  // Get existing attendance for this session
  const studentIds = students?.map((s) => s.id) ?? [];
  const { data: existingAttendance, error: attendanceError } = await supabase
    .from("attendance")
    .select("student_id, status")
    .eq("session_id", sessionId)
    .in("student_id", studentIds);

  if (attendanceError) {
    console.error("recordAttendanceAction attendance lookup failed:", attendanceError.message);
    return { status: "error", error: t("errors.lookupFailed") };
  }

  const alreadyRecorded = new Set((existingAttendance ?? []).map((a) => a.student_id));
  const toInsert = studentIds.filter((id) => !alreadyRecorded.has(id));

  let recorded = 0;
  if (toInsert.length > 0) {
    const rows = toInsert.map((studentId) => ({
      session_id: sessionId,
      student_id: studentId,
      status: "present" as AttendanceStatus,
      marked_by: "admin",
    }));

    const { error } = await supabase
      .from("attendance")
      .upsert(rows, { onConflict: "session_id,student_id" });

    if (error) {
      console.error("recordAttendanceAction upsert failed:", error.message);
      return { status: "error", error: t("errors.insertFailed") };
    }
    recorded = toInsert.length;
  }

  revalidatePath(`/${locale}/admin/attendance`);
  revalidatePath(`/${locale}/hr/attendance`);
  revalidatePath(`/${locale}/admin/sessions/${sessionId}`);
  revalidatePath(`/${locale}/dashboard`);
  revalidatePath(`/${locale}/attendance`);
  revalidatePath(`/${locale}/leaderboard`);
  revalidatePath(`/${locale}/progress`);

  return {
    status: "success",
    message: t("success", { recorded, alreadyRecorded: alreadyRecorded.size, notFound: notFound.length }),
    recorded,
    alreadyRecorded: [...alreadyRecorded],
    notFound,
  };
}

export async function removeAttendanceAction(
  _previous: RecordAttendanceResult,
  formData: FormData,
): Promise<RecordAttendanceResult> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "admin.attendance" });

  const profile = await getCurrentProfile();
  if (!profile) {
    return { status: "error", error: t("errors.signedOut") };
  }
  if (profile.role === "student") {
    return { status: "error", error: t("errors.teachersOnly") };
  }

  const sessionId = formData.get("session_id") as string;
  const studentId = formData.get("student_id") as string;

  if (!sessionId || !studentId) {
    return { status: "error", error: t("errors.missingFields") };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("attendance")
    .delete()
    .eq("session_id", sessionId)
    .eq("student_id", studentId);

  if (error) {
    console.error("removeAttendanceAction failed:", error.message);
    return { status: "error", error: t("errors.removeFailed") };
  }

  revalidatePath(`/${locale}/admin/attendance`);
  revalidatePath(`/${locale}/hr/attendance`);
  revalidatePath(`/${locale}/admin/sessions/${sessionId}`);
  revalidatePath(`/${locale}/dashboard`);
  revalidatePath(`/${locale}/attendance`);
  revalidatePath(`/${locale}/leaderboard`);
  revalidatePath(`/${locale}/progress`);

  return {
    status: "success",
    message: t("removed"),
    recorded: 0,
    alreadyRecorded: [],
    notFound: [],
  };
}