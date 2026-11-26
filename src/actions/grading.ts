"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { gradingRequestSchema, idSchema } from "@/lib/validation";
import { isGradingConfigured } from "@/lib/grading/provider";
import {
  gradePendingForAssignment,
  gradeSubmissionById,
  type GradeFailure,
} from "@/lib/grading/service";
import type { GradeState } from "@/lib/types";

async function isCurrentUserStaff(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return profile?.role === "admin" || profile?.role === "teacher";
}

function failureKey(reason: GradeFailure): string {
  switch (reason) {
    case "config":
      return "gradingNotConfigured";
    case "locked":
      return "locked";
    case "attempts":
      return "attempts";
    case "rateLimited":
      return "rateLimited";
    case "timeout":
      return "timeout";
    case "invalid":
      return "invalidResponse";
    case "notFound":
      return "notFound";
    case "payment":
      return "paidBlocked";
    case "noModels":
      return "noModels";
    case "unavailable":
      return "unavailable";
    case "request":
      return "requestRejected";
    default:
      return "gradeFailed";
  }
}

export async function gradeSubmissionAction(
  _previous: GradeState,
  formData: FormData,
): Promise<GradeState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "admin.review" });

  if (!(await isCurrentUserStaff())) {
    return { status: "error", error: t("errors.forbidden") };
  }

  const parsed = gradingRequestSchema.safeParse({
    submission_id: formData.get("submission_id"),
    force: formData.get("force") === "1",
  });

  if (!parsed.success) {
    return { status: "error", error: t("errors.invalid") };
  }

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("submissions")
    .select("assignment_id")
    .eq("id", parsed.data.submission_id)
    .maybeSingle()
    .returns<{ assignment_id: string } | null>();

  if (!row) {
    return { status: "error", error: t("errors.notFound") };
  }

  const outcome = await gradeSubmissionById(parsed.data.submission_id, {
    force: parsed.data.force,
    maxAttempts: 2,
  });

  revalidatePath(`/${locale}/admin/assignments/${row.assignment_id}`);
  revalidatePath(
    `/${locale}/admin/assignments/${row.assignment_id}/submissions/${parsed.data.submission_id}`,
  );
  revalidatePath(`/${locale}/admin/assignments`);
  revalidatePath(`/${locale}/assignments/${row.assignment_id}`);
  revalidatePath(`/${locale}/assignments`);
  revalidatePath(`/${locale}/dashboard`);

  if (!outcome.ok) {
    return { status: "error", error: t(`errors.${failureKey(outcome.reason)}`) };
  }

  return {
    status: "success",
    message: outcome.mock
      ? t("gradedMock", { score: outcome.score })
      : t("graded", { score: outcome.score }),
  };
}

export async function gradePendingAction(
  _previous: GradeState,
  formData: FormData,
): Promise<GradeState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "admin.assignment" });
  const tr = await getTranslations({ locale, namespace: "admin.review" });

  if (!(await isCurrentUserStaff())) {
    return { status: "error", error: t("errors.forbidden") };
  }

  const assignmentId = idSchema.safeParse(formData.get("assignment_id"));
  if (!assignmentId.success) {
    return { status: "error", error: t("errors.invalid") };
  }

  if (!isGradingConfigured()) {
    return { status: "error", error: tr("errors.gradingNotConfigured") };
  }

  const outcome = await gradePendingForAssignment(assignmentId.data, 3);

  revalidatePath(`/${locale}/admin/assignments/${assignmentId.data}`);
  revalidatePath(`/${locale}/admin/assignments`);
  revalidatePath(`/${locale}/assignments`);
  revalidatePath(`/${locale}/dashboard`);

  return {
    status: "success",
    message: t("gradeResult", {
      graded: outcome.graded,
      failed: outcome.failed,
      remaining: outcome.remaining,
    }),
  };
}
