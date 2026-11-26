"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureModelCatalog, getGradingSettings } from "@/lib/grading/catalog";
import type { GradingMode } from "@/lib/grading/fallback-core";
import type { GradingSettingsState } from "@/lib/types";

function isStaff(role: string | undefined): boolean {
  return role === "admin" || role === "teacher";
}

function parseMode(value: FormDataEntryValue | null): GradingMode | null {
  return value === "auto_free" ||
    value === "manual_free" ||
    value === "manual_paid"
    ? value
    : null;
}

export async function saveGradingSettingsAction(
  _previous: GradingSettingsState,
  formData: FormData,
): Promise<GradingSettingsState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "admin.grading" });

  const profile = await getCurrentProfile();
  if (!profile || !isStaff(profile.role)) {
    return { status: "error", error: t("errors.forbidden") };
  }

  const mode = parseMode(formData.get("mode"));
  if (!mode) {
    return { status: "error", error: t("errors.invalid") };
  }

  const allowPaid = formData.get("allow_paid") === "on";
  if (allowPaid && profile.role !== "admin") {
    return { status: "error", error: t("errors.paidAdminOnly") };
  }
  if (mode === "manual_paid" && profile.role !== "admin") {
    return { status: "error", error: t("errors.paidAdminOnly") };
  }

  const maxAttemptsRaw = Number(formData.get("max_attempts"));
  const maxAttempts =
    Number.isFinite(maxAttemptsRaw) && maxAttemptsRaw >= 1 && maxAttemptsRaw <= 10
      ? Math.floor(maxAttemptsRaw)
      : 3;

  const preferredRaw = String(formData.get("preferred_model") ?? "").trim();
  const preferredModel = preferredRaw || null;

  if (mode === "manual_free" || mode === "manual_paid") {
    if (!preferredModel) {
      return { status: "error", error: t("errors.modelRequired") };
    }
  }

  if (mode === "manual_paid" && !allowPaid) {
    return { status: "error", error: t("errors.paidNotEnabled") };
  }

  if (preferredModel) {
    const models = await ensureModelCatalog(false);
    const selected = models.find((model) => model.id === preferredModel);
    if (!selected) {
      return { status: "error", error: t("errors.modelNotFound") };
    }
    if (mode === "manual_free" && !selected.isFree) {
      return { status: "error", error: t("errors.notFree") };
    }
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("grading_settings")
    .update({
      mode,
      preferred_model: preferredModel,
      allow_paid: profile.role === "admin" ? allowPaid : false,
      max_attempts: maxAttempts,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (error) {
    console.error("saveGradingSettingsAction failed:", error.message);
    return { status: "error", error: t("errors.saveFailed") };
  }

  revalidatePath(`/${locale}/admin/grading`);
  revalidatePath(`/${locale}/admin/assignments`);
  return { status: "success", message: t("saved") };
}

export async function refreshGradingModelsAction(
  _previous: GradingSettingsState,
  formData: FormData,
): Promise<GradingSettingsState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "admin.grading" });

  const profile = await getCurrentProfile();
  if (!profile || !isStaff(profile.role)) {
    return { status: "error", error: t("errors.forbidden") };
  }

  try {
    const models = await ensureModelCatalog(true);
    const free = models.filter((model) => model.isFree).length;
    if (models.length === 0) {
      return { status: "error", error: t("errors.catalogEmpty") };
    }
    revalidatePath(`/${locale}/admin/grading`);
    return {
      status: "success",
      message: t("refreshed", { count: models.length, free }),
    };
  } catch (error) {
    console.error(
      "refreshGradingModelsAction failed:",
      error instanceof Error ? error.message : error,
    );
    return { status: "error", error: t("errors.refreshFailed") };
  }
}
