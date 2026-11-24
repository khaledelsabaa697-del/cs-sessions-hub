"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import {
  attendanceStatusSchema,
  idSchema,
  rotateCodeSchema,
  sessionSchema,
} from "@/lib/validation";
import type {
  AttendanceSaveState,
  CodeState,
  SessionFormState,
} from "@/lib/types";

async function isCurrentUserStaff(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return profile?.role === "admin" || profile?.role === "teacher";
}

export async function createSessionAction(
  _previous: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "admin.sessions" });

  if (!(await isCurrentUserStaff())) {
    return { status: "error", error: t("errors.forbidden") };
  }

  const parsed = sessionSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    session_date: String(formData.get("session_date") ?? ""),
  });

  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path?.[0];
    return {
      status: "error",
      error: t(field === "title" ? "errors.title" : "errors.date"),
    };
  }

  const profile = await getCurrentProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      title: parsed.data.title,
      session_date: parsed.data.session_date,
      created_by: profile?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("createSessionAction failed:", error?.message);
    return { status: "error", error: t("errors.createFailed") };
  }

  revalidatePath(`/${locale}/admin/sessions`);
  revalidatePath(`/${locale}/admin`);

  redirect(`/${locale}/admin/sessions/${data.id}`);
}

export async function updateSessionAction(
  _previous: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "admin.session" });

  if (!(await isCurrentUserStaff())) {
    return { status: "error", error: t("errors.forbidden") };
  }

  const sessionId = idSchema.safeParse(formData.get("session_id"));
  const parsed = sessionSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    session_date: String(formData.get("session_date") ?? ""),
  });

  if (!sessionId.success || !parsed.success) {
    return { status: "error", error: t("errors.invalid") };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("sessions")
    .update({
      title: parsed.data.title,
      session_date: parsed.data.session_date,
    })
    .eq("id", sessionId.data);

  if (error) {
    console.error("updateSessionAction failed:", error.message);
    return { status: "error", error: t("errors.saveFailed") };
  }

  revalidatePath(`/${locale}/admin/sessions/${sessionId.data}`);
  revalidatePath(`/${locale}/admin/sessions`);
  revalidatePath(`/${locale}/attendance`);

  return { status: "success", message: t("savedDetails") };
}

export async function deleteSessionAction(formData: FormData): Promise<void> {
  const locale = toLocale(formData.get("locale"));
  if (!(await isCurrentUserStaff())) {
    redirect(`/${locale}/admin/sessions`);
  }

  const sessionId = idSchema.safeParse(formData.get("session_id"));
  if (!sessionId.success) {
    redirect(`/${locale}/admin/sessions`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("sessions")
    .delete()
    .eq("id", sessionId.data);

  if (error) {
    console.error("deleteSessionAction failed:", error.message);
  }

  revalidatePath(`/${locale}/admin/sessions`);
  revalidatePath(`/${locale}/admin`);
  redirect(`/${locale}/admin/sessions`);
}

export async function rotateCodeAction(
  _previous: CodeState,
  formData: FormData,
): Promise<CodeState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "admin.session" });

  if (!(await isCurrentUserStaff())) {
    return { status: "error", error: t("errors.forbidden") };
  }

  const parsed = rotateCodeSchema.safeParse({
    session_id: formData.get("session_id"),
    minutes: formData.get("minutes") ?? 15,
  });

  if (!parsed.success) {
    return { status: "error", error: t("errors.codeFailed") };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("generate_attendance_code", {
    p_session_id: parsed.data.session_id,
    p_minutes: parsed.data.minutes,
  });

  if (error) {
    console.error("rotateCodeAction failed:", error.message);
    return { status: "error", error: t("errors.codeFailed") };
  }

  revalidatePath(`/${locale}/admin/sessions/${parsed.data.session_id}`);
  revalidatePath(`/${locale}/admin/sessions`);

  return { status: "success", message: t("codeGenerated") };
}

export async function endCodeAction(
  _previous: CodeState,
  formData: FormData,
): Promise<CodeState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "admin.session" });

  if (!(await isCurrentUserStaff())) {
    return { status: "error", error: t("errors.forbidden") };
  }

  const sessionId = idSchema.safeParse(formData.get("session_id"));
  if (!sessionId.success) {
    return { status: "error", error: t("errors.codeFailed") };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("sessions")
    .update({ attendance_code: null, code_expires_at: null })
    .eq("id", sessionId.data);

  if (error) {
    console.error("endCodeAction failed:", error.message);
    return { status: "error", error: t("errors.codeFailed") };
  }

  revalidatePath(`/${locale}/admin/sessions/${sessionId.data}`);
  revalidatePath(`/${locale}/admin/sessions`);

  return { status: "success", message: t("codeEnded") };
}

export async function saveAttendanceAction(
  _previous: AttendanceSaveState,
  formData: FormData,
): Promise<AttendanceSaveState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "admin.session" });

  if (!(await isCurrentUserStaff())) {
    return { status: "error", error: t("errors.forbidden") };
  }

  const sessionId = idSchema.safeParse(formData.get("session_id"));
  if (!sessionId.success) {
    return { status: "error", error: t("errors.saveFailed") };
  }

  const entries = new Map<string, "present" | "late" | "absent" | "none">();
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("status:")) continue;
    const studentId = idSchema.safeParse(key.slice("status:".length));
    if (!studentId.success) continue;

    if (value === "none") {
      entries.set(studentId.data, "none");
      continue;
    }

    const status = attendanceStatusSchema.safeParse(String(value));
    if (status.success) entries.set(studentId.data, status.data);
  }

  if (entries.size === 0) {
    return { status: "error", error: t("errors.noStudents") };
  }

  const supabase = await createClient();
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id")
    .eq("id", sessionId.data)
    .maybeSingle();

  if (sessionError || !session) {
    return { status: "error", error: t("errors.notFound") };
  }

  const ids = [...entries.keys()];
  const { data: validStudents, error: studentsError } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "student")
    .in("id", ids);

  if (studentsError) {
    console.error("saveAttendanceAction lookup failed:", studentsError.message);
    return { status: "error", error: t("errors.saveFailed") };
  }

  const validIds = new Set((validStudents ?? []).map((row) => row.id));
  const rows: Array<{
    session_id: string;
    student_id: string;
    status: "present" | "late" | "absent";
    marked_by: string;
  }> = [];
  const unmarked: string[] = [];

  for (const [studentId, status] of entries) {
    if (!validIds.has(studentId)) continue;
    if (status === "none") {
      unmarked.push(studentId);
      continue;
    }
    rows.push({
      session_id: sessionId.data,
      student_id: studentId,
      status,
      marked_by: "admin",
    });
  }

  if (unmarked.length > 0) {
    const { error } = await supabase
      .from("attendance")
      .delete()
      .eq("session_id", sessionId.data)
      .in("student_id", unmarked);

    if (error) {
      console.error("saveAttendanceAction delete failed:", error.message);
      return { status: "error", error: t("errors.saveFailed") };
    }
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from("attendance")
      .upsert(rows, { onConflict: "session_id,student_id" });

    if (error) {
      console.error("saveAttendanceAction upsert failed:", error.message);
      return { status: "error", error: t("errors.saveFailed") };
    }
  }

  revalidatePath(`/${locale}/admin/sessions/${sessionId.data}`);
  revalidatePath(`/${locale}/admin/sessions`);
  revalidatePath(`/${locale}/dashboard`);
  revalidatePath(`/${locale}/attendance`);

  return { status: "success", message: t("attendanceSaved") };
}
