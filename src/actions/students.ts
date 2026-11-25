"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { parseCsv } from "@/lib/csv";
import {
  createStudentSchema,
  csvStudentSchema,
  fieldFromZodError,
  normalizeUsername,
  resetPasswordSchema,
} from "@/lib/validation";
import {
  createStudentAccount,
  generatePassword,
} from "@/lib/students";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  CreateStudentState,
  CsvImportState,
  CsvRowResult,
  ResetPasswordState,
} from "@/lib/types";

async function isCurrentUserAdmin(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return profile?.role === "admin";
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

export async function createStudentAction(
  _previous: CreateStudentState,
  formData: FormData,
): Promise<CreateStudentState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "admin.students" });

  if (!(await isCurrentUserAdmin())) {
    return { status: "error", error: t("errors.forbidden") };
  }

  const parsed = createStudentSchema.safeParse({
    username: normalizeUsername(String(formData.get("username") ?? "")),
    full_name: String(formData.get("full_name") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) {
    const field = fieldFromZodError(parsed.error);
    const key =
      field === "username" || field === "full_name" || field === "password"
        ? field
        : "invalid";
    return { status: "error", error: t(`errors.${key}`) };
  }

  const result = await createStudentAccount(parsed.data);
  if (!result.ok) {
    return { status: "error", error: t(`errors.${result.reason}`) };
  }

  revalidatePath(`/${locale}/admin/students`);
  revalidatePath(`/${locale}/admin`);

  return {
    status: "success",
    message: t("created"),
    password: result.password,
    student: result.student,
  };
}

export async function importStudentsAction(
  _previous: CsvImportState,
  formData: FormData,
): Promise<CsvImportState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "admin.students" });

  if (!(await isCurrentUserAdmin())) {
    return { status: "error", error: t("errors.forbidden") };
  }

  const csv = String(formData.get("csv") ?? "");
  if (!csv.trim()) return { status: "error", error: t("errors.emptyCsv") };

  const rows = parseCsv(csv);
  if (rows.length === 0) return { status: "error", error: t("errors.emptyCsv") };

  const header = rows[0].map(normalizeHeader);
  const usernameIndex = header.indexOf("username");
  const fullNameIndex =
    header.indexOf("full_name") >= 0
      ? header.indexOf("full_name")
      : header.indexOf("name");
  const passwordIndex = header.indexOf("password");

  if (usernameIndex === -1 || fullNameIndex === -1) {
    return { status: "error", error: t("errors.badHeader") };
  }

  const body = rows.slice(1);
  if (body.length === 0) return { status: "error", error: t("errors.emptyCsv") };
  if (body.length > 200) return { status: "error", error: t("errors.tooMany") };

  type Prepared =
    | { kind: "invalid"; result: CsvRowResult }
    | {
        kind: "valid";
        line: number;
        username: string;
        full_name: string;
        password: string;
      };

  const prepared: Prepared[] = [];
  const seen = new Set<string>();

  body.forEach((cells, index) => {
    const line = index + 2;
    const rawUsername = cells[usernameIndex] ?? "";
    const rawFullName = cells[fullNameIndex] ?? "";
    const rawPassword = passwordIndex >= 0 ? (cells[passwordIndex] ?? "") : "";
    const password = rawPassword || generatePassword();

    const parsed = csvStudentSchema.safeParse({
      username: normalizeUsername(rawUsername),
      full_name: rawFullName.trim(),
      password,
    });

    if (!parsed.success) {
      prepared.push({
        kind: "invalid",
        result: {
          line,
          username: rawUsername,
          full_name: rawFullName,
          ok: false,
          error: t("errors.invalid"),
        },
      });
      return;
    }

    if (seen.has(parsed.data.username)) {
      prepared.push({
        kind: "invalid",
        result: {
          line,
          username: parsed.data.username,
          full_name: parsed.data.full_name,
          ok: false,
          error: t("errors.duplicate"),
        },
      });
      return;
    }

    seen.add(parsed.data.username);
    prepared.push({
      kind: "valid",
      line,
      username: parsed.data.username,
      full_name: parsed.data.full_name,
      password,
    });
  });

  const results: Array<CsvRowResult | undefined> = new Array(prepared.length);
  prepared.forEach((row, index) => {
    if (row.kind === "invalid") results[index] = row.result;
  });

  const validIndexes = prepared
    .map((row, index) => (row.kind === "valid" ? index : -1))
    .filter((index) => index >= 0);

  const admin = createAdminClient();
  let cursor = 0;

  async function worker() {
    while (cursor < validIndexes.length) {
      const position = validIndexes[cursor];
      cursor += 1;
      const row = prepared[position];
      if (row.kind !== "valid") continue;

      const created = await createStudentAccount(
        {
          username: row.username,
          full_name: row.full_name,
          password: row.password,
        },
        admin,
      );

      results[position] = created.ok
        ? {
            line: row.line,
            username: created.student.username,
            full_name: created.student.full_name,
            ok: true,
            student_code: created.student.student_code,
            password: created.password,
          }
        : {
            line: row.line,
            username: row.username,
            full_name: row.full_name,
            ok: false,
            error: t(`errors.${created.reason}`),
          };
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(5, validIndexes.length) }, () => worker()),
  );

  const finalRows = results.filter((row): row is CsvRowResult => Boolean(row));
  const created = finalRows.filter((row) => row.ok).length;

  if (created > 0) {
    revalidatePath(`/${locale}/admin/students`);
    revalidatePath(`/${locale}/admin`);
  }

  return {
    status: "done",
    rows: finalRows,
    created,
    failed: finalRows.length - created,
  };
}

export async function resetPasswordAction(
  _previous: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "admin.students" });

  if (!(await isCurrentUserAdmin())) {
    return { status: "error", error: t("errors.forbidden") };
  }

  const parsed = resetPasswordSchema.safeParse({
    student_id: String(formData.get("student_id") ?? ""),
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) {
    return { status: "error", error: t("errors.password") };
  }

  const admin = createAdminClient();
  const { data: target, error: lookupError } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", parsed.data.student_id)
    .maybeSingle();

  if (lookupError || !target || target.role !== "student") {
    return { status: "error", error: t("errors.notFound") };
  }

  const { error } = await admin.auth.admin.updateUserById(parsed.data.student_id, {
    password: parsed.data.password,
  });

  if (error) {
    console.error("resetPasswordAction failed:", error.message);
    return { status: "error", error: t("errors.updateFailed") };
  }

  return { status: "success", message: t("resetDone") };
}

export async function changeUserRoleAction(
  _previous: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "admin.students" });

  if (!(await isCurrentUserAdmin())) {
    return { status: "error", error: t("errors.forbidden") };
  }

  const studentId = String(formData.get("student_id") ?? "").trim();
  const newRole = String(formData.get("new_role") ?? "").trim();

  if (!studentId || !["student", "teacher", "admin", "hr"].includes(newRole)) {
    return { status: "error", error: t("errors.invalid") };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ role: newRole })
    .eq("id", studentId);

  if (error) {
    console.error("changeUserRoleAction failed:", error.message);
    return { status: "error", error: t("errors.roleChangeFailed") };
  }

  revalidatePath(`/${locale}/admin/students`);
  return { status: "success", message: t("roleChanged") };
}

export async function deleteStudentAccountAction(
  _previous: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "admin.students" });

  if (!(await isCurrentUserAdmin())) {
    return { status: "error", error: t("errors.forbidden") };
  }

  const studentId = String(formData.get("student_id") ?? "").trim();
  if (!studentId) {
    return { status: "error", error: t("errors.invalid") };
  }

  const admin = createAdminClient();

  // Only allow deleting student accounts.
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", studentId)
    .maybeSingle();

  if (!profile || profile.role !== "student") {
    return { status: "error", error: t("errors.notFound") };
  }

  const { error } = await admin.auth.admin.deleteUser(studentId);
  if (error) {
    const authError = error as { message?: string; status?: number; name?: string; code?: string };
    console.error("deleteStudentAccountAction failed:", {
      message: authError.message,
      status: authError.status,
      name: authError.name,
      code: authError.code,
      studentId,
    });
    return { status: "error", error: t("errors.deleteFailed") };
  }

  // The profiles.id -> auth.users(id) FK is ON DELETE CASCADE, but verify it
  // actually ran. If a hosted schema ever drifts, don't leave a ghost account
  // in the admin list.
  const { data: leftover, error: verifyError } = await admin
    .from("profiles")
    .select("id")
    .eq("id", studentId)
    .maybeSingle();

  if (verifyError) {
    console.error("deleteStudentAccountAction verify failed:", {
      message: verifyError.message,
      code: verifyError.code,
      details: verifyError.details,
      hint: verifyError.hint,
      studentId,
    });
    return { status: "error", error: t("errors.deleteFailed") };
  }

  if (leftover) {
    const { error: cleanupError } = await admin
      .from("profiles")
      .delete()
      .eq("id", studentId);

    if (cleanupError) {
      console.error("deleteStudentAccountAction profile cleanup failed:", {
        message: cleanupError.message,
        code: cleanupError.code,
        details: cleanupError.details,
        hint: cleanupError.hint,
        studentId,
      });
      return { status: "error", error: t("errors.deleteFailed") };
    }
  }

  revalidatePath(`/${locale}/admin/students`);
  return { status: "success", message: t("accountDeleted") };
}
