"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { fingerprintCode, similarityPercent } from "@/lib/similarity";
import { createClient } from "@/lib/supabase/server";
import { idSchema, similarityCheckSchema } from "@/lib/validation";
import type {
  SimilarityActionResult,
  SimilarityRunState,
} from "@/lib/types";

type SubmissionSourceRow = {
  id: string;
  student_id: string;
  created_at: string;
  code_text: string;
};

type PairRef = {
  id: string;
  assignment_id: string;
  submission_a: string;
  submission_b: string;
};

async function isCurrentUserStaff(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return profile?.role === "admin" || profile?.role === "teacher";
}

export async function runSimilarityCheckAction(
  _previous: SimilarityRunState,
  formData: FormData,
): Promise<SimilarityRunState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "admin.similarity" });

  if (!(await isCurrentUserStaff())) {
    return { status: "error", error: t("errors.forbidden") };
  }

  const parsed = similarityCheckSchema.safeParse({
    assignment_id: formData.get("assignment_id"),
    threshold: formData.get("threshold"),
  });
  if (!parsed.success) {
    return { status: "error", error: t("errors.invalid") };
  }

  const assignmentId = parsed.data.assignment_id;
  const threshold = parsed.data.threshold;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("submissions")
    .select("id, student_id, created_at, code_text")
    .eq("assignment_id", assignmentId)
    .order("created_at", { ascending: false })
    .limit(500)
    .returns<SubmissionSourceRow[]>();

  if (error) {
    console.error("runSimilarityCheckAction read failed:", error.message);
    return { status: "error", error: t("errors.failed") };
  }

  // Only the most recent attempt per student participates in a comparison.
  const latest = new Map<string, SubmissionSourceRow>();
  for (const row of data ?? []) {
    if (!latest.has(row.student_id)) latest.set(row.student_id, row);
  }

  const submissions = [...latest.values()];
  if (submissions.length < 2) {
    return { status: "error", error: t("notEnough") };
  }

  const fingerprints = new Map(
    submissions.map((row) => [row.id, fingerprintCode(row.code_text)]),
  );

  const pairs: Array<{ a: string; b: string; similarity: number }> = [];
  const bestScore = new Map<string, number>();

  for (let index = 0; index < submissions.length; index += 1) {
    for (let other = index + 1; other < submissions.length; other += 1) {
      const left = submissions[index];
      const right = submissions[other];
      const score = similarityPercent(
        fingerprints.get(left.id)!,
        fingerprints.get(right.id)!,
      );
      if (score < threshold) continue;

      const [a, b] = left.id < right.id ? [left.id, right.id] : [right.id, left.id];
      pairs.push({ a, b, similarity: score });
      bestScore.set(left.id, Math.max(bestScore.get(left.id) ?? 0, score));
      bestScore.set(right.id, Math.max(bestScore.get(right.id) ?? 0, score));
    }
  }

  const { error: resetError } = await supabase
    .from("submissions")
    .update({ similarity_flag: false, similarity_score: null })
    .eq("assignment_id", assignmentId);

  if (resetError) {
    console.error("runSimilarityCheckAction reset failed:", resetError.message);
    return { status: "error", error: t("errors.failed") };
  }

  const { error: clearError } = await supabase
    .from("submission_similarity")
    .delete()
    .eq("assignment_id", assignmentId)
    .eq("reviewed", false);

  if (clearError) {
    console.error("runSimilarityCheckAction clear failed:", clearError.message);
    return { status: "error", error: t("errors.failed") };
  }

  if (pairs.length > 0) {
    const { error: pairError } = await supabase.from("submission_similarity").upsert(
      pairs.map((pair) => ({
        assignment_id: assignmentId,
        submission_a: pair.a,
        submission_b: pair.b,
        similarity: pair.similarity,
      })),
      { onConflict: "submission_a,submission_b" },
    );

    if (pairError) {
      console.error("runSimilarityCheckAction pair insert failed:", pairError.message);
      return { status: "error", error: t("errors.failed") };
    }

    const updates = [...bestScore.entries()].map(([id, score]) =>
      supabase
        .from("submissions")
        .update({
          similarity_score: score,
          similarity_flag: score >= threshold,
        })
        .eq("id", id),
    );
    const results = await Promise.all(updates);
    const updateError = results.find((result) => result.error)?.error;
    if (updateError) {
      console.error("runSimilarityCheckAction score update failed:", updateError.message);
      return { status: "error", error: t("errors.failed") };
    }
  }

  await supabase
    .from("assignments")
    .update({ similarity_checked_at: new Date().toISOString() })
    .eq("id", assignmentId);

  revalidatePath(`/${locale}/admin/assignments/${assignmentId}`);
  revalidatePath(`/${locale}/admin/analytics`);

  return {
    status: "success",
    scanned: submissions.length,
    pairs: pairs.length,
    flagged: bestScore.size,
    threshold,
  };
}

async function loadPair(pairId: string): Promise<PairRef | null> {
  const id = idSchema.safeParse(pairId);
  if (!id.success) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("submission_similarity")
    .select("id, assignment_id, submission_a, submission_b")
    .eq("id", id.data)
    .maybeSingle()
    .returns<PairRef | null>();

  return data ?? null;
}

export async function markSimilarityReviewedAction(
  pairId: string,
  localeRaw: string,
): Promise<SimilarityActionResult> {
  const locale = toLocale(localeRaw);
  const t = await getTranslations({ locale, namespace: "admin.similarity" });

  if (!(await isCurrentUserStaff())) return { ok: false, error: t("errors.forbidden") };

  const pair = await loadPair(pairId);
  if (!pair) return { ok: false, error: t("errors.invalid") };

  const supabase = await createClient();
  const { error } = await supabase
    .from("submission_similarity")
    .update({ reviewed: true })
    .eq("id", pair.id);

  if (error) {
    console.error("markSimilarityReviewedAction failed:", error.message);
    return { ok: false, error: t("errors.failed") };
  }

  revalidatePath(`/${locale}/admin/assignments/${pair.assignment_id}`);
  return { ok: true };
}

export async function flagSimilarPairAction(
  pairId: string,
  localeRaw: string,
): Promise<SimilarityActionResult> {
  const locale = toLocale(localeRaw);
  const t = await getTranslations({ locale, namespace: "admin.similarity" });

  if (!(await isCurrentUserStaff())) return { ok: false, error: t("errors.forbidden") };

  const pair = await loadPair(pairId);
  if (!pair) return { ok: false, error: t("errors.invalid") };

  const supabase = await createClient();
  const [flagged, reviewed] = await Promise.all([
    supabase
      .from("submissions")
      .update({ status: "flagged", similarity_flag: true })
      .in("id", [pair.submission_a, pair.submission_b]),
    supabase
      .from("submission_similarity")
      .update({ reviewed: true })
      .eq("id", pair.id),
  ]);

  if (flagged.error || reviewed.error) {
    console.error(
      "flagSimilarPairAction failed:",
      flagged.error?.message ?? reviewed.error?.message,
    );
    return { ok: false, error: t("errors.failed") };
  }

  revalidatePath(`/${locale}/admin/assignments/${pair.assignment_id}`);
  revalidatePath(`/${locale}/admin/analytics`);
  return { ok: true };
}
