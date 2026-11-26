import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SubmissionStatus } from "@/lib/types";
import {
  GradingError,
  callModel,
  isGradingConfigured,
  providerConfig,
  type ModelCallResult,
} from "./provider";
import {
  ensureModelCatalog,
  getGradingSettings,
  getModelStateMap,
  type GradingSettings,
} from "./catalog";
import {
  buildGradePatch,
  buildModelPlan,
  nextJobState,
  runModelFallback,
  type AttemptOutcome,
  type FallbackError,
  type PlanModel,
} from "./fallback-core";

export const MAX_GRADING_ATTEMPTS = 3;
const STALE_LOCK_MS = 5 * 60_000;
const RUN_BUDGET_MS = 45_000;
const QUEUE_STATUSES = [
  "pending",
  "queued",
  "grading",
  "pending_retry",
  "failed",
] as const;

type GradingJob = {
  id: string;
  submission_id: string;
  assignment_id: string;
  student_id: string;
  status: "queued" | "running" | "succeeded" | "pending_retry" | "failed";
  priority: number;
  attempts: number;
  max_attempts: number;
  scheduled_at: string;
  started_at: string | null;
  finished_at: string | null;
  locked_at: string | null;
  locked_by: string | null;
  selected_model: string | null;
  actual_model: string | null;
  actual_provider: string | null;
  fallback_used: boolean;
  model_attempts: number;
  duration_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cost: number | string | null;
  last_error_code: string | null;
  last_error: string | null;
};

type SubmissionRow = {
  id: string;
  code_text: string;
  status: SubmissionStatus;
  final_score: number | string | null;
  ai_score: number | string | null;
  graded_by: string | null;
  ai_model: string | null;
  ai_provider: string | null;
  ai_graded_at: string | null;
  grading_attempts: number;
  grading_locked_at: string | null;
  grading_error: string | null;
  assignments: {
    title: string;
    description: string;
    rubric: string;
    expected_output: string | null;
    max_score: number | string;
  } | null;
};

export type GradeFailure =
  | "notFound"
  | "locked"
  | "attempts"
  | "config"
  | "rateLimited"
  | "timeout"
  | "api"
  | "invalid"
  | "unavailable"
  | "payment"
  | "request"
  | "noModels";

export type GradeOutcome =
  | {
      ok: true;
      score: number;
      model: string;
      mock: boolean;
      provider?: string;
      attempts?: number;
      fallbackUsed?: boolean;
    }
  | { ok: false; reason: GradeFailure; message: string };

export type QueueOutcome = {
  graded: number;
  failed: number;
  retried: number;
  remaining: number;
};

function adminOrNull(): SupabaseClient | null {
  try {
    return createAdminClient();
  } catch (error) {
    console.error(
      "Grading is unavailable:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hourlyLimit(): number {
  const parsed = Number(process.env.GRADING_HOURLY_LIMIT);
  if (Number.isFinite(parsed) && parsed >= 1) {
    return Math.min(5_000, Math.floor(parsed));
  }
  return 180;
}

function mapReason(code: string, allRateLimited: boolean): GradeFailure {
  if (code === "rateLimited" || allRateLimited) return "rateLimited";
  if (code === "timeout" || code === "gateway") return "timeout";
  if (code === "config" || code === "auth") return "config";
  if (code === "payment") return "payment";
  if (code === "request") return "request";
  if (code === "noModels") return "noModels";
  if (code === "unavailable" || code === "forbidden") return "unavailable";
  if (code === "invalid") return "invalid";
  return "api";
}

function errorText(error: FallbackError): string {
  return `${error.code}: ${error.message}`.slice(0, 500);
}

async function recordModelFailure(
  admin: SupabaseClient,
  model: PlanModel,
  error: FallbackError,
): Promise<void> {
  if (error.fatal) return;

  let status: "rate_limited" | "unavailable" = "unavailable";
  let cooldown = 120;

  if (error.code === "rateLimited") {
    status = "rate_limited";
    cooldown = Math.max(30, Math.min(3_600, error.retryAfterSeconds ?? 600));
  } else if (error.code === "forbidden") {
    cooldown = 900;
  } else if (error.code === "invalid") {
    cooldown = 60;
  } else if (error.code === "timeout" || error.code === "api") {
    cooldown = Math.max(60, Math.min(600, error.retryAfterSeconds ?? 120));
  }

  const { error: rpcError } = await admin.rpc("record_grading_model_failure", {
    p_model: model.id,
    p_status: status,
    p_cooldown_seconds: cooldown,
    p_error: error.message,
  });
  if (rpcError) {
    console.error("[grading] model state update failed:", rpcError.message);
  }
}

async function recordGatewayFailure(
  admin: SupabaseClient,
  seconds: number,
  message: string,
): Promise<void> {
  const { error } = await admin.rpc("record_grading_model_failure", {
    p_model: "__gateway__",
    p_status: "rate_limited",
    p_cooldown_seconds: Math.max(30, Math.min(3_600, seconds)),
    p_error: message,
  });
  if (error) {
    console.error("[grading] gateway state update failed:", error.message);
  }
}

async function recordModelSuccess(
  admin: SupabaseClient,
  modelId: string,
): Promise<void> {
  const { error } = await admin.rpc("record_grading_model_success", {
    p_model: modelId,
  });
  if (error) {
    console.error("[grading] model success update failed:", error.message);
  }
}

async function remainingCount(admin: SupabaseClient): Promise<number> {
  const { count } = await admin
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .in("status", QUEUE_STATUSES);
  return count ?? 0;
}

async function failJob(
  admin: SupabaseClient,
  job: GradingJob,
  status: "failed" | "pending_retry",
  code: string,
  message: string,
  delayMs = 0,
): Promise<void> {
  const now = Date.now();
  const scheduledAt = new Date(now + delayMs).toISOString();
  const submissionStatus =
    status === "failed" ? "failed" : "pending_retry";

  const { error: jobError } = await admin
    .from("grading_jobs")
    .update({
      status,
      scheduled_at: scheduledAt,
      finished_at: status === "failed" ? new Date(now).toISOString() : null,
      locked_at: null,
      locked_by: null,
      last_error_code: code,
      last_error: message.slice(0, 500),
      updated_at: new Date(now).toISOString(),
    })
    .eq("id", job.id);

  if (jobError) {
    console.error("[grading] job failure update failed:", jobError.message);
  }

  const { error: submissionError } = await admin
    .from("submissions")
    .update({
      status: submissionStatus,
      grading_locked_at: null,
      grading_error: errorText({ code, message }),
    })
    .eq("id", job.submission_id);

  if (submissionError) {
    console.error(
      "[grading] submission failure update failed:",
      submissionError.message,
    );
  }
}

async function completeJob(
  admin: SupabaseClient,
  job: GradingJob,
  submission: SubmissionRow,
  result: ModelCallResult,
  model: PlanModel,
  selectedModel: string,
  attempts: number,
  durationMs: number,
  fallbackUsed: boolean,
): Promise<GradeOutcome> {
  const nowIso = new Date().toISOString();
  const existingFinal = toNumber(submission.final_score);

  const patch = buildGradePatch({
    aiScore: result.response.score,
    feedbackEn: result.response.feedback_en,
    feedbackAr: result.response.feedback_ar,
    issues: result.response.issues,
    rubricScores: result.response.rubric_scores,
    actualModel: result.rawModel,
    selectedModel,
    provider: result.provider,
    attempts,
    durationMs,
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
    cost: result.cost,
    fallbackUsed,
    existingFinalScore: existingFinal,
    currentStatus: submission.status,
    gradedBy: submission.graded_by,
    nowIso,
  });

  const { error: saveError } = await admin
    .from("submissions")
    .update({
      ...patch,
      grading_locked_at: null,
      grading_error: null,
    })
    .eq("id", submission.id);

  if (saveError) {
    await failJob(
      admin,
      job,
      "pending_retry",
      "save_failed",
      saveError.message,
      60_000,
    );
    return {
      ok: false,
      reason: "api",
      message: "Could not save the grade.",
    };
  }

  const { error: jobError } = await admin
    .from("grading_jobs")
    .update({
      status: "succeeded",
      finished_at: nowIso,
      locked_at: null,
      locked_by: null,
      selected_model: selectedModel,
      actual_model: result.rawModel,
      actual_provider: result.provider,
      fallback_used: fallbackUsed,
      model_attempts: attempts,
      duration_ms: durationMs,
      prompt_tokens: result.usage.promptTokens,
      completion_tokens: result.usage.completionTokens,
      cost: result.cost,
      last_error_code: null,
      last_error: null,
      updated_at: nowIso,
    })
    .eq("id", job.id);

  if (jobError) {
    console.error("[grading] job success update failed:", jobError.message);
  }

  return {
    ok: true,
    score: result.response.score,
    model: result.rawModel,
    mock: false,
    provider: result.provider,
    attempts,
    fallbackUsed,
  };
}

async function runJob(
  admin: SupabaseClient,
  job: GradingJob,
  settings: GradingSettings,
  options: { force?: boolean } = {},
): Promise<GradeOutcome> {
  const { data: submission, error } = await admin
    .from("submissions")
    .select(
      "id, code_text, status, final_score, ai_score, graded_by, ai_model, ai_provider, ai_graded_at, grading_attempts, grading_locked_at, grading_error, assignments(title, description, rubric, expected_output, max_score)",
    )
    .eq("id", job.submission_id)
    .maybeSingle()
    .returns<SubmissionRow | null>();

  if (error || !submission) {
    await failJob(
      admin,
      job,
      "failed",
      "not_found",
      "The submission no longer exists.",
    );
    return { ok: false, reason: "notFound", message: "Submission not found." };
  }

  if (!submission.assignments) {
    await failJob(
      admin,
      job,
      "failed",
      "not_found",
      "The assignment no longer exists.",
    );
    return { ok: false, reason: "notFound", message: "Assignment not found." };
  }

  // Idempotency: a previous worker may have saved the grade but crashed before
  // marking the job succeeded. Never call the gateway twice for that row.
  if (
    !options.force &&
    submission.ai_graded_at &&
    (submission.status === "graded" || submission.status === "flagged")
  ) {
    await admin
      .from("grading_jobs")
      .update({
        status: "succeeded",
        finished_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
        selected_model: submission.ai_model,
        actual_model: submission.ai_model,
        actual_provider: submission.ai_provider,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return {
      ok: true,
      score: toNumber(submission.final_score ?? submission.ai_score) ?? 0,
      model: submission.ai_model ?? "unknown",
      mock: false,
    };
  }

  const assignment = submission.assignments;
  const maxScore = toNumber(assignment.max_score) ?? 100;
  const input = {
    title: assignment.title,
    description: assignment.description,
    rubric: assignment.rubric,
    expectedOutput: assignment.expected_output,
    maxScore,
    code: submission.code_text,
  };

  const config = providerConfig();

  // Development-only deterministic grader.
  if (config.mock) {
    const { mockGrade } = await import("./mock");
    const mockModel: PlanModel = {
      id: "mock-dev",
      displayName: "Mock grader",
      provider: "local",
      isFree: true,
      supportsJsonMode: false,
      available: true,
      contextLength: null,
      maxCompletionTokens: 2048,
      pricingPrompt: 0,
      pricingCompletion: 0,
    };
    const result: ModelCallResult = {
      response: mockGrade(input),
      rawModel: "mock-dev",
      provider: "local",
      usage: { promptTokens: null, completionTokens: null, totalTokens: null },
      cost: 0,
    };
    const outcome = await completeJob(
      admin,
      job,
      submission,
      result,
      mockModel,
      mockModel.id,
      1,
      0,
      false,
    );
    return outcome.ok ? { ...outcome, mock: true } : outcome;
  }

  const [models, states] = await Promise.all([
    ensureModelCatalog(false),
    getModelStateMap(),
  ]);

  if (models.length === 0) {
    await failJob(
      admin,
      job,
      job.attempts >= job.max_attempts ? "failed" : "pending_retry",
      "no_models",
      "The free model catalog is empty. Refresh the catalog in grading settings.",
      15 * 60_000,
    );
    return {
      ok: false,
      reason: "noModels",
      message: "No free grading model is available.",
    };
  }

  const cooldowns: Record<string, number | null> = {};
  for (const [id, state] of Object.entries(states)) {
    cooldowns[id] = state.cooldownUntil;
  }

  const plan = buildModelPlan({
    mode: settings.mode,
    preferredModel: settings.preferredModel,
    allowPaid: settings.allowPaid,
    models,
    cooldowns,
    maxModels: 6,
  });

  if (plan.length === 0) {
    const earliest = Object.values(cooldowns)
      .filter((value): value is number => typeof value === "number")
      .sort((a, b) => a - b)[0] ?? null;
    const decision = nextJobState({
      attempts: job.attempts,
      maxAttempts: job.max_attempts,
      allRateLimited: true,
      earliestCooldownAt: earliest,
    });
    await failJob(
      admin,
      job,
      decision.status,
      "all_cooling",
      "Every eligible free model is cooling down after a failure.",
      decision.delayMs,
    );
    return {
      ok: false,
      reason: "rateLimited",
      message: "All eligible free models are cooling down.",
    };
  }

  const selectedModel = plan[0].id;
  const allowPaid =
    settings.mode === "manual_paid" &&
    settings.allowPaid &&
    !plan[0].isFree;

  const fallback = await runModelFallback<ModelCallResult>({
    plan,
    deadlineAt: Date.now() + RUN_BUDGET_MS,
    maxModelAttempts: 2,
    attempt: async (model): Promise<AttemptOutcome<ModelCallResult>> => {
      if (!model.isFree && !(allowPaid && model.id === selectedModel)) {
        return {
          ok: false,
          error: {
            code: "payment",
            message: "Paid fallback is disabled.",
            fatal: true,
          },
        };
      }

      const slot = await admin.rpc("take_grading_slot", {
        p_min_interval_ms: 250,
        p_hourly_limit: hourlyLimit(),
      });
      if (slot.error) {
        return {
          ok: false,
          error: {
            code: "gateway",
            message: `Gateway pacing check failed: ${slot.error.message}`,
            fatal: true,
          },
        };
      }
      if (slot.data !== true) {
        return {
          ok: false,
          error: {
            code: "gateway",
            message: "The shared grading gateway is busy or over its hourly budget.",
            retryAfterSeconds: 60,
            fatal: true,
          },
        };
      }

      try {
        const value = await callModel(model, input, { allowPaid });
        return { ok: true, value };
      } catch (error) {
        if (error instanceof GradingError) {
          return {
            ok: false,
            error: {
              code: error.code,
              message: error.message,
              status: error.status,
              retryAfterSeconds: error.retryAfterSeconds,
              fatal: error.fatal,
            },
          };
        }
        return {
          ok: false,
          error: {
            code: "api",
            message: error instanceof Error ? error.message : "Grading failed.",
          },
        };
      }
    },
    recordFailure: async (model, modelError) => {
      if (modelError.code === "gateway") {
        await recordGatewayFailure(
          admin,
          modelError.retryAfterSeconds ?? 60,
          modelError.message,
        );
        return;
      }
      await recordModelFailure(admin, model, modelError);
    },
    onSuccess: async (model) => {
      await recordModelSuccess(admin, model.id);
    },
  });

  if (fallback.ok) {
    const outcome = await completeJob(
      admin,
      job,
      submission,
      fallback.value,
      fallback.model,
      selectedModel,
      fallback.attempts,
      fallback.durationMs,
      fallback.fallbackUsed,
    );
    return outcome.ok
      ? { ...outcome, mock: false }
      : outcome;
  }

  const gatewayBusy = fallback.errors.some(
    (item) => item.code === "gateway",
  );
  const fatal =
    fallback.reason === "fatal" &&
    fallback.error.code !== "gateway" &&
    fallback.error.code !== "rateLimited";

  if (fatal) {
    await failJob(
      admin,
      job,
      "failed",
      fallback.error.code,
      fallback.error.message,
    );
    return {
      ok: false,
      reason: mapReason(fallback.error.code, fallback.allRateLimited),
      message: fallback.error.message,
    };
  }

  const earliest = Object.values(cooldowns)
    .filter((value): value is number => typeof value === "number")
    .sort((a, b) => a - b)[0] ?? null;

  const retryAfterMs =
    Math.max(
      0,
      ...fallback.errors
        .filter((item) => item.code === "rateLimited")
        .map((item) => (item.retryAfterSeconds ?? 0) * 1_000),
    ) || 0;

  const decision = nextJobState({
    attempts: job.attempts,
    maxAttempts: job.max_attempts,
    allRateLimited: fallback.allRateLimited,
    gatewayBusy,
    earliestCooldownAt: earliest,
    rateLimitDelayMs: Math.max(
      gatewayBusy ? 15 * 60_000 : 10 * 60_000,
      retryAfterMs,
    ),
  });

  const decisionStatus =
    fallback.reason === "no_models" || fallback.reason === "deadline"
      ? "pending_retry"
      : decision.status;
  const delay =
    fallback.reason === "deadline" ? 60_000 : decision.delayMs;

  await failJob(
    admin,
    job,
    job.attempts >= job.max_attempts ? "failed" : decisionStatus,
    fallback.error.code,
    fallback.error.message,
    delay,
  );

  return {
    ok: false,
    reason:
      fallback.reason === "deadline"
        ? "timeout"
        : mapReason(fallback.error.code, fallback.allRateLimited),
    message: fallback.error.message,
  };
}

/**
 * Claim and process up to `limit` jobs. Safe to call from multiple serverless
 * instances: the database claim uses SKIP LOCKED and the gate enforces a shared
 * hourly ceiling.
 */
export async function processGradingQueue(
  options: { limit?: number; worker?: string } = {},
): Promise<QueueOutcome> {
  const empty: QueueOutcome = { graded: 0, failed: 0, retried: 0, remaining: 0 };

  const admin = adminOrNull();
  if (!admin) return empty;

  if (!isGradingConfigured()) {
    // Do not leave students on "grading" forever when the key is missing.
    const nowIso = new Date().toISOString();
    await admin
      .from("grading_jobs")
      .update({
        status: "failed",
        finished_at: nowIso,
        last_error_code: "config",
        last_error: "AI grading is not configured.",
        updated_at: nowIso,
      })
      .in("status", ["queued", "pending_retry"]);
    await admin
      .from("submissions")
      .update({
        status: "failed",
        grading_locked_at: null,
        grading_error: "config: AI grading is not configured.",
      })
      .in("status", ["queued", "grading", "pending_retry"]);
    return { ...empty, remaining: await remainingCount(admin) };
  }

  const states = await getModelStateMap();
  const gatewayUntil = states.__gateway__?.cooldownUntil ?? null;
  if (gatewayUntil && gatewayUntil > Date.now()) {
    return { ...empty, remaining: await remainingCount(admin) };
  }

  const recovered = await admin.rpc("recover_stale_grading_jobs", {
    p_stale_seconds: 300,
  });
  if (recovered.error) {
    console.error(
      "[grading] stale job recovery failed:",
      recovered.error.message,
    );
  }

  const claimed = await admin.rpc("claim_grading_jobs", {
    p_limit: Math.min(5, Math.max(1, options.limit ?? 1)),
    p_worker: options.worker ?? `next-${process.pid}`,
  });
  if (claimed.error) {
    console.error("[grading] job claim failed:", claimed.error.message);
    return { ...empty, remaining: await remainingCount(admin) };
  }

  const jobs = (claimed.data ?? []) as GradingJob[];
  if (jobs.length === 0) {
    return { ...empty, remaining: await remainingCount(admin) };
  }

  const settings = await getGradingSettings();
  let graded = 0;
  let failed = 0;
  let retried = 0;

  for (const job of jobs) {
    const outcome = await runJob(admin, job, settings);
    if (outcome.ok) {
      graded += 1;
    } else if (outcome.reason === "rateLimited" || outcome.reason === "timeout") {
      retried += 1;
    } else {
      failed += 1;
    }
  }

  return {
    graded,
    failed,
    retried,
    remaining: await remainingCount(admin),
  };
}

function mapJobToFailure(outcome: GradeOutcome): GradeFailure {
  return outcome.ok ? "api" : outcome.reason;
}

/**
 * Grade one submission on demand (teacher "Regrade" / legacy actions).
 * `force` resets attempts so a teacher can deliberately retry.
 */
export async function gradeSubmissionById(
  submissionId: string,
  options: { force?: boolean; maxAttempts?: number } = {},
): Promise<GradeOutcome> {
  if (!isGradingConfigured()) {
    return { ok: false, reason: "config", message: "Grading is not configured." };
  }

  const admin = adminOrNull();
  if (!admin) {
    return { ok: false, reason: "config", message: "Grading is not available." };
  }

  const settings = await getGradingSettings();

  let { data: job } = await admin
    .from("grading_jobs")
    .select("*")
    .eq("submission_id", submissionId)
    .maybeSingle<GradingJob>();

  if (!job) {
    const { data: submission } = await admin
      .from("submissions")
      .select("assignment_id, student_id")
      .eq("id", submissionId)
      .maybeSingle<{ assignment_id: string; student_id: string }>();

    if (!submission) {
      return { ok: false, reason: "notFound", message: "Submission not found." };
    }

    const inserted = await admin
      .from("grading_jobs")
      .insert({
        submission_id: submissionId,
        assignment_id: submission.assignment_id,
        student_id: submission.student_id,
        max_attempts: options.maxAttempts ?? settings.maxAttempts,
      })
      .select("*")
      .single<GradingJob>();
    if (inserted.error || !inserted.data) {
      return {
        ok: false,
        reason: "api",
        message: inserted.error?.message ?? "Could not create a grading job.",
      };
    }
    job = inserted.data;
  }

  if (
    job.status === "running" &&
    job.locked_at &&
    Date.now() - Date.parse(job.locked_at) < STALE_LOCK_MS
  ) {
    return {
      ok: false,
      reason: "locked",
      message: "This submission is already being graded.",
    };
  }

  if (job.status === "succeeded" && !options.force) {
    return {
      ok: false,
      reason: "locked",
      message: "This submission is already graded.",
    };
  }

  const nowIso = new Date().toISOString();
  const nextAttempts = options.force ? 1 : job.attempts + 1;
  const maxAttempts = options.maxAttempts ?? job.max_attempts;

  if (options.force) {
    await admin
      .from("submissions")
      .update({
        status: "queued",
        grading_locked_at: null,
        grading_error: null,
      })
      .eq("id", submissionId);
  }

  const claim = await admin
    .from("grading_jobs")
    .update({
      status: "running",
      attempts: nextAttempts,
      max_attempts: maxAttempts,
      scheduled_at: nowIso,
      started_at: job.started_at ?? nowIso,
      finished_at: null,
      locked_at: nowIso,
      locked_by: `manual-${process.pid}`,
      last_error: null,
      last_error_code: null,
      updated_at: nowIso,
    })
    .eq("id", job.id)
    .eq("status", job.status)
    .select("*")
    .maybeSingle<GradingJob>();

  if (claim.error || !claim.data) {
    return {
      ok: false,
      reason: "locked",
      message: "This submission is already being graded.",
    };
  }

  await admin
    .from("submissions")
    .update({ status: "grading" })
    .eq("id", submissionId);

  const outcome = await runJob(admin, claim.data, settings, {
    force: options.force,
  });
  return outcome;
}

/**
 * Queue every ungraded attempt for an assignment, then process a small batch.
 * The teacher can click again for the rest.
 */
export async function gradePendingForAssignment(
  assignmentId: string,
  limit = 3,
): Promise<QueueOutcome> {
  const admin = adminOrNull();
  if (!admin) return { graded: 0, failed: 0, retried: 0, remaining: 0 };

  const settings = await getGradingSettings();
  const { data: submissions, error } = await admin
    .from("submissions")
    .select("id, assignment_id, student_id")
    .eq("assignment_id", assignmentId)
    .in("status", QUEUE_STATUSES)
    .order("created_at", { ascending: true })
    .limit(Math.min(10, Math.max(1, limit)))
    .returns<
      Array<{ id: string; assignment_id: string; student_id: string }>
    >();

  if (error) {
    console.error("[grading] queue lookup failed:", error.message);
    return { graded: 0, failed: 0, retried: 0, remaining: 0 };
  }

  const nowIso = new Date().toISOString();
  for (const row of submissions ?? []) {
    const { error: upsertError } = await admin.from("grading_jobs").upsert(
      {
        submission_id: row.id,
        assignment_id: row.assignment_id,
        student_id: row.student_id,
        status: "queued",
        attempts: 0,
        max_attempts: settings.maxAttempts,
        scheduled_at: nowIso,
        started_at: null,
        finished_at: null,
        locked_at: null,
        locked_by: null,
        last_error_code: null,
        last_error: null,
        updated_at: nowIso,
      },
      { onConflict: "submission_id" },
    );
    if (upsertError) {
      console.error("[grading] queue upsert failed:", upsertError.message);
    }
  }

  return processGradingQueue({
    limit: Math.min(3, Math.max(1, limit)),
    worker: `teacher-${process.pid}`,
  });
}

/** Used by the admin screens to explain why grading is / is not available. */
export function gradingStatus(): {
  configured: boolean;
  mock: boolean;
  model: string;
} {
  const config = providerConfig();
  return {
    configured: Boolean(config.apiKey) || config.mock,
    mock: config.mock,
    model: config.model,
  };
}

/**
 * Mark a freshly queued submission failed when grading is not configured, so
 * the student sees a real state instead of an endless "grading" badge.
 */
export async function markGradingUnavailable(submissionId: string): Promise<void> {
  const admin = adminOrNull();
  if (!admin) return;

  const nowIso = new Date().toISOString();
  await admin
    .from("grading_jobs")
    .update({
      status: "failed",
      finished_at: nowIso,
      last_error_code: "config",
      last_error: "AI grading is not configured.",
      updated_at: nowIso,
    })
    .eq("submission_id", submissionId);
  await admin
    .from("submissions")
    .update({
      status: "failed",
      grading_locked_at: null,
      grading_error: "config: AI grading is not configured.",
    })
    .eq("id", submissionId);
}

export { mapJobToFailure };
