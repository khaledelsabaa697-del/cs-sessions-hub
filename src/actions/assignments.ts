"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  assignmentSchema,
  idSchema,
  parseDeadlineInput,
  submissionReviewSchema,
} from "@/lib/validation";
import type {
  AssignmentFormState,
  SubmissionReviewState,
} from "@/lib/types";

async function isCurrentUserStaff(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return profile?.role === "admin" || profile?.role === "teacher";
}

function parseAssignmentForm(formData: FormData) {
  return assignmentSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    rubric: String(formData.get("rubric") ?? ""),
    expected_output: String(formData.get("expected_output") ?? ""),
    max_score: formData.get("max_score") ?? 100,
    allow_resubmit: formData.get("allow_resubmit") === "on",
  });
}

export async function createAssignmentAction(
  _previous: AssignmentFormState,
  formData: FormData,
): Promise<AssignmentFormState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "admin.assignments" });

  if (!(await isCurrentUserStaff())) {
    return { status: "error", error: t("errors.forbidden") };
  }

  const parsed = parseAssignmentForm(formData);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path?.[0];
    return {
      status: "error",
      error: t(
        field === "title"
          ? "errors.title"
          : field === "max_score"
            ? "errors.maxScore"
            : "errors.invalid",
      ),
    };
  }

  const deadline = parseDeadlineInput(String(formData.get("deadline") ?? ""));
  if (!deadline.ok) {
    return { status: "error", error: t("errors.deadline") };
  }

  const profile = await getCurrentProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assignments")
    .insert({
      title: parsed.data.title,
      description: parsed.data.description,
      rubric: parsed.data.rubric,
      expected_output: parsed.data.expected_output || null,
      max_score: parsed.data.max_score,
      deadline: deadline.iso,
      allow_resubmit: parsed.data.allow_resubmit,
      created_by: profile?.id ?? null,
    })
    .select("id")
    .single()
    .returns<{ id: string } | null>();

  if (error || !data) {
    console.error("createAssignmentAction failed:", error?.message);
    return { status: "error", error: t("errors.createFailed") };
  }

  revalidatePath(`/${locale}/admin/assignments`);
  revalidatePath(`/${locale}/admin`);
  revalidatePath(`/${locale}/assignments`);

  redirect(`/${locale}/admin/assignments/${data.id}`);
}

export async function updateAssignmentAction(
  _previous: AssignmentFormState,
  formData: FormData,
): Promise<AssignmentFormState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "admin.assignment" });

  if (!(await isCurrentUserStaff())) {
    return { status: "error", error: t("errors.forbidden") };
  }

  const assignmentId = idSchema.safeParse(formData.get("assignment_id"));
  const parsed = parseAssignmentForm(formData);
  if (!assignmentId.success || !parsed.success) {
    return { status: "error", error: t("errors.invalid") };
  }

  const deadline = parseDeadlineInput(String(formData.get("deadline") ?? ""));
  if (!deadline.ok) {
    return { status: "error", error: t("errors.deadline") };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("assignments")
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
      rubric: parsed.data.rubric,
      expected_output: parsed.data.expected_output || null,
      max_score: parsed.data.max_score,
      deadline: deadline.iso,
      allow_resubmit: parsed.data.allow_resubmit,
    })
    .eq("id", assignmentId.data);

  if (error) {
    console.error("updateAssignmentAction failed:", error.message);
    return { status: "error", error: t("errors.saveFailed") };
  }

  revalidatePath(`/${locale}/admin/assignments`);
  revalidatePath(`/${locale}/admin/assignments/${assignmentId.data}`);
  revalidatePath(`/${locale}/assignments`);
  revalidatePath(`/${locale}/assignments/${assignmentId.data}`);
  revalidatePath(`/${locale}/dashboard`);

  return { status: "success", message: t("saved") };
}

export async function deleteAssignmentAction(formData: FormData): Promise<void> {
  const locale = toLocale(formData.get("locale"));
  if (!(await isCurrentUserStaff())) {
    redirect(`/${locale}/admin/assignments`);
  }

  const assignmentId = idSchema.safeParse(formData.get("assignment_id"));
  if (!assignmentId.success) {
    redirect(`/${locale}/admin/assignments`);
  }

  const supabase = await createClient();

  const { data: files } = await supabase
    .from("submissions")
    .select("file_path")
    .eq("assignment_id", assignmentId.data)
    .returns<Array<{ file_path: string }>>();

  const { error } = await supabase
    .from("assignments")
    .delete()
    .eq("id", assignmentId.data);

  if (error) {
    console.error("deleteAssignmentAction failed:", error.message);
  }

  const paths = (files ?? []).map((row) => row.file_path).filter(Boolean);
  for (let index = 0; index < paths.length; index += 100) {
    const chunk = paths.slice(index, index + 100);
    const { error: storageError } = await supabase.storage
      .from("submissions")
      .remove(chunk);
    if (storageError) {
      console.error("deleteAssignmentAction storage cleanup failed:", storageError.message);
    }
  }

  revalidatePath(`/${locale}/admin/assignments`);
  revalidatePath(`/${locale}/admin`);
  revalidatePath(`/${locale}/assignments`);
  revalidatePath(`/${locale}/dashboard`);

  redirect(`/${locale}/admin/assignments`);
}

export async function reviewSubmissionAction(
  _previous: SubmissionReviewState,
  formData: FormData,
): Promise<SubmissionReviewState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "admin.review" });

  if (!(await isCurrentUserStaff())) {
    return { status: "error", error: t("errors.forbidden") };
  }

  const parsed = submissionReviewSchema.safeParse({
    submission_id: formData.get("submission_id"),
    final_score: formData.get("final_score") ?? "",
    status: formData.get("status") ?? "graded",
  });

  if (!parsed.success) {
    return { status: "error", error: t("errors.invalid") };
  }

  const supabase = await createAdminClient();

  const { data: submission, error: lookupError } = await supabase
    .from("submissions")
    .select("id, assignment_id, assignments(max_score)")
    .eq("id", parsed.data.submission_id)
    .maybeSingle()
    .returns<{
      id: string;
      assignment_id: string;
      assignments: { max_score: number | string } | null;
    } | null>();

  if (lookupError || !submission) {
    return { status: "error", error: t("errors.notFound") };
  }

  const maxScore = Number(submission.assignments?.max_score ?? 100);
  const score = Math.round(parsed.data.final_score * 100) / 100;

  if (!Number.isFinite(score) || score < 0 || score > maxScore) {
    return { status: "error", error: t("errors.scoreRange", { max: maxScore }) };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("submissions")
    .update({
      final_score: score,
      status: parsed.data.status,
      graded_by: "teacher",
      graded_at: now,
      reviewed_at: now,
    })
    .eq("id", submission.id);

  if (error) {
    console.error("reviewSubmissionAction failed:", error.message);
    return { status: "error", error: t("errors.saveFailed") };
  }

  revalidatePath(`/${locale}/admin/assignments/${submission.assignment_id}`);
  revalidatePath(
    `/${locale}/admin/assignments/${submission.assignment_id}/submissions/${submission.id}`,
  );
  revalidatePath(`/${locale}/admin/assignments`);
  revalidatePath(`/${locale}/admin/students`);
  revalidatePath(`/${locale}/assignments`);
  revalidatePath(`/${locale}/assignments/${submission.assignment_id}`);
  revalidatePath(`/${locale}/dashboard`);

  return { status: "success", message: t("saved"), finalScore: score };
}
