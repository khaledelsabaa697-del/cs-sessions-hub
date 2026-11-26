"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { idSchema } from "@/lib/validation";
import type { WarningFormState } from "@/lib/types";


export async function setAbsenceThresholdAction(
  formData: FormData,
): Promise<void> {
  const locale = toLocale(formData.get("locale"));
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") return;

  const value = String(formData.get("threshold") ?? "").trim();
  if (!/^[0-9]+$/.test(value)) return;

  const supabase = await createClient();
  await supabase.rpc("hr_set_setting", { p_key: "absence_threshold", p_value: value });
  revalidatePath(`/${locale}/hr/students`);
}

export async function createWarningAction(
  _previous: WarningFormState,
  formData: FormData,
): Promise<WarningFormState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "hr" });

  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "hr" && profile.role !== "admin")) {
    return { status: "error", error: t("errors.forbidden") };
  }

  const studentId = idSchema.safeParse(formData.get("student_id"));
  if (!studentId.success) {
    return { status: "error", error: t("errors.invalidStudent") };
  }

  const reason = String(formData.get("reason") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!reason) {
    return { status: "error", error: t("errors.reasonRequired") };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("hr_create_warning", {
    p_student_id: studentId.data,
    p_reason: reason,
    p_note: note || null,
  });

  if (error) {
    console.error("createWarningAction failed:", error.message);
    return {
      status: "error",
      error: error.message.includes("not_student")
        ? t("errors.notStudent")
        : t("errors.saveFailed"),
    };
  }

  revalidatePath(`/${locale}/hr/warnings`);
  revalidatePath(`/${locale}/hr/students/${studentId.data}`);
  revalidatePath(`/${locale}/dashboard`);

  return { status: "success", message: t("warningCreated") };
}
