import { z } from "zod";

/**
 * The canonical grading shape. Different free models are inconsistent: some
 * return a numeric string, omit the Arabic translation, or put issues in one
 * string. The schema coerces those common variations, then the service
 * normalises everything into this exact object before it is written.
 */
const rubricScoreSchema = z.object({
  criterion: z.string().trim().min(1).max(200),
  score: z.coerce.number(),
  max: z.coerce.number().optional().nullable(),
  comment: z.string().trim().max(500).optional().nullable(),
});

export const gradingResponseSchema = z.object({
  score: z.coerce.number().finite(),
  feedback_en: z.string().trim().min(1).max(4000),
  feedback_ar: z.string().trim().max(4000).optional().nullable(),
  issues: z.union([z.array(z.string()), z.string()]).optional().nullable(),
  rubric_scores: z.array(rubricScoreSchema).max(12).optional().nullable(),
  rubric: z.array(rubricScoreSchema).max(12).optional().nullable(),
});

export type GradingRubricScore = {
  criterion: string;
  score: number;
  max: number | null;
  comment: string | null;
};

export type GradingResponse = {
  score: number;
  feedback_en: string;
  feedback_ar: string;
  issues: string[];
  rubric_scores: GradingRubricScore[];
};

export type GradingInput = {
  title: string;
  description: string;
  rubric: string;
  expectedOutput: string | null;
  maxScore: number;
  code: string;
};

function normalizeIssues(value: string[] | string | null | undefined): string[] {
  if (!value) return [];
  const items = Array.isArray(value)
    ? value
    : value.split(/\r?\n|;\s*/);
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function normalizeRubric(
  rows: Array<{
    criterion: string;
    score: number;
    max?: number | null;
    comment?: string | null;
  }> | null | undefined,
  maxScore: number,
): GradingRubricScore[] {
  if (!rows) return [];
  return rows.slice(0, 10).map((row) => {
    const max = Number.isFinite(row.max ?? NaN) ? Number(row.max) : null;
    const score = Math.max(
      0,
      Math.min(max ?? maxScore, Number.isFinite(row.score) ? row.score : 0),
    );
    return {
      criterion: row.criterion.trim().slice(0, 200),
      score: Math.round(score * 10) / 10,
      max,
      comment: row.comment?.trim().slice(0, 500) || null,
    };
  });
}

/** Clamp, fill missing translations, and return the exact stored shape. */
export function normalizeGradingResponse(
  raw: z.infer<typeof gradingResponseSchema>,
  maxScore: number,
): GradingResponse {
  const score = Math.max(
    0,
    Math.min(maxScore, Math.round(raw.score * 10) / 10),
  );
  const feedbackEn = raw.feedback_en.trim().slice(0, 4000);
  const feedbackAr = (raw.feedback_ar ?? feedbackEn).trim().slice(0, 4000) || feedbackEn;

  return {
    score: Number.isFinite(score) ? score : 0,
    feedback_en: feedbackEn,
    feedback_ar: feedbackAr,
    issues: normalizeIssues(raw.issues),
    rubric_scores: normalizeRubric(
      raw.rubric_scores ?? raw.rubric ?? [],
      maxScore,
    ),
  };
}
