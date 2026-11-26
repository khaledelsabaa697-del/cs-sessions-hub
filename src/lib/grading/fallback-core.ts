/**
 * Pure fallback and grading-decision logic. No SDK, database, or `server-only`
 * imports, so the tests can drive every failure sequence with mocks.
 */

export type PlanModel = {
  id: string;
  displayName: string;
  provider: string;
  isFree: boolean;
  supportsJsonMode: boolean;
  available: boolean;
  contextLength: number | null;
  maxCompletionTokens: number | null;
  pricingPrompt: number | null;
  pricingCompletion: number | null;
};

export type GradingMode = "auto_free" | "manual_free" | "manual_paid";

export const AUTO_FREE_MODEL = "kilo-auto/free";

export type PlanInput = {
  mode: GradingMode;
  preferredModel: string | null;
  allowPaid: boolean;
  models: PlanModel[];
  /** Epoch ms per model id. `null`/missing means no cooldown. */
  cooldowns?: Record<string, number | null>;
  now?: number;
  maxModels?: number;
};

function cooling(
  id: string,
  cooldowns: Record<string, number | null>,
  now: number,
): boolean {
  const until = cooldowns[id];
  return typeof until === "number" && Number.isFinite(until) && until > now;
}

function rankModels(a: PlanModel, b: PlanModel): number {
  if (a.supportsJsonMode !== b.supportsJsonMode) {
    return a.supportsJsonMode ? -1 : 1;
  }
  const context = (b.contextLength ?? 0) - (a.contextLength ?? 0);
  if (context !== 0) return context;
  const completion = (b.maxCompletionTokens ?? 0) - (a.maxCompletionTokens ?? 0);
  if (completion !== 0) return completion;
  return a.id.localeCompare(b.id);
}

/**
 * Construct the attempt order from the live catalog. Paid models are only
 * inserted when an admin explicitly selected one in `manual_paid` mode; they
 * are never added as fallbacks.
 */
export function buildModelPlan(input: PlanInput): PlanModel[] {
  const now = input.now ?? Date.now();
  const cooldowns = input.cooldowns ?? {};
  const available = input.models.filter(
    (model) => model.available && !cooling(model.id, cooldowns, now),
  );
  const free = available.filter((model) => model.isFree);
  const autoFree = free.find((model) => model.id === AUTO_FREE_MODEL) ?? null;
  const preferred = input.preferredModel
    ? available.find((model) => model.id === input.preferredModel) ?? null
    : null;

  const plan: PlanModel[] = [];
  const push = (model: PlanModel | null) => {
    if (model && !plan.some((entry) => entry.id === model.id)) plan.push(model);
  };

  const freeRest = [...free]
    .filter((model) => model.id !== AUTO_FREE_MODEL)
    .sort(rankModels);

  if (input.mode === "auto_free") {
    push(autoFree);
    freeRest.forEach(push);
  } else if (input.mode === "manual_free") {
    if (preferred?.isFree) push(preferred);
    push(autoFree);
    freeRest.forEach(push);
  } else {
    // manual_paid: the admin's explicit paid choice may run first, but the
    // fallback sequence is still free-only.
    if (input.allowPaid && preferred && !preferred.isFree) {
      push(preferred);
    } else if (preferred?.isFree) {
      push(preferred);
    }
    push(autoFree);
    freeRest.forEach(push);
  }

  return plan.slice(0, Math.max(1, input.maxModels ?? 6));
}

export type FallbackError = {
  code: string;
  message: string;
  status?: number;
  retryAfterSeconds?: number;
  fatal?: boolean;
};

export type AttemptOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: FallbackError };

export type FallbackFailure = FallbackError & { modelId: string };

export type FallbackResult<T> =
  | {
      ok: true;
      value: T;
      model: PlanModel;
      attempts: number;
      fallbackUsed: boolean;
      durationMs: number;
    }
  | {
      ok: false;
      reason: "no_models" | "deadline" | "fatal" | "rate_limited" | "exhausted";
      error: FallbackFailure;
      errors: FallbackFailure[];
      allRateLimited: boolean;
      attempts: number;
      durationMs: number;
    };

export type FallbackOptions<T> = {
  plan: PlanModel[];
  attempt: (model: PlanModel, attemptNumber: number) => Promise<AttemptOutcome<T>>;
  recordFailure?: (
    model: PlanModel,
    error: FallbackError,
    attemptNumber: number,
  ) => Promise<void> | void;
  onSuccess?: (model: PlanModel) => Promise<void> | void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  deadlineAt?: number;
  maxModelAttempts?: number;
};

const TRANSIENT_CODES = new Set(["timeout", "api", "invalid"]);

/**
 * Tries each model in order. A 429 moves immediately to the next model, while
 * transient failures get one controlled retry. Fatal errors (400/401/402) stop
 * the chain so no paid capacity is touched and no broken request is repeated.
 */
export async function runModelFallback<T>(
  options: FallbackOptions<T>,
): Promise<FallbackResult<T>> {
  const now = options.now ?? (() => Date.now());
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const startedAt = now();
  const errors: FallbackFailure[] = [];
  let attempts = 0;
  const maxModelAttempts = Math.max(1, options.maxModelAttempts ?? 2);

  if (options.plan.length === 0) {
    const error: FallbackFailure = {
      code: "noModels",
      message: "No eligible free model is currently available.",
      modelId: "",
    };
    return {
      ok: false,
      reason: "no_models",
      error,
      errors: [error],
      allRateLimited: false,
      attempts: 0,
      durationMs: 0,
    };
  }

  for (const model of options.plan) {
    for (let modelAttempt = 1; modelAttempt <= maxModelAttempts; modelAttempt += 1) {
      if (options.deadlineAt !== undefined && now() >= options.deadlineAt) {
        const error: FallbackFailure = {
          code: "timeout",
          message: "The grading run exceeded its time budget.",
          modelId: model.id,
        };
        return {
          ok: false,
          reason: "deadline",
          error,
          errors,
          allRateLimited: false,
          attempts,
          durationMs: now() - startedAt,
        };
      }

      attempts += 1;
      const outcome = await options.attempt(model, modelAttempt);

      if (outcome.ok) {
        await options.onSuccess?.(model);
        return {
          ok: true,
          value: outcome.value,
          model,
          attempts,
          fallbackUsed: model.id !== options.plan[0]?.id,
          durationMs: now() - startedAt,
        };
      }

      const failure: FallbackFailure = { ...outcome.error, modelId: model.id };
      errors.push(failure);
      await options.recordFailure?.(model, failure, modelAttempt);

      if (failure.fatal) {
        return {
          ok: false,
          reason: "fatal",
          error: failure,
          errors,
          allRateLimited: false,
          attempts,
          durationMs: now() - startedAt,
        };
      }

      if (!TRANSIENT_CODES.has(failure.code)) break;

      if (modelAttempt >= maxModelAttempts) break;

      const wait = Math.min(
        2_000,
        Math.max(150, (failure.retryAfterSeconds ?? 0) * 1_000),
      );
      if (options.deadlineAt !== undefined && now() + wait >= options.deadlineAt) {
        break;
      }
      await sleep(wait);
    }
  }

  const allRateLimited =
    errors.length > 0 && errors.every((error) => error.code === "rateLimited");
  const last = errors[errors.length - 1] ?? {
    code: "api",
    message: "Grading failed.",
    modelId: "",
  };

  return {
    ok: false,
    reason: allRateLimited ? "rate_limited" : "exhausted",
    error: last,
    errors,
    allRateLimited,
    attempts,
    durationMs: now() - startedAt,
  };
}

export type JobDecisionInput = {
  attempts: number;
  maxAttempts: number;
  allRateLimited: boolean;
  gatewayBusy?: boolean;
  earliestCooldownAt?: number | null;
  now?: number;
  retryDelayMs?: number;
  rateLimitDelayMs?: number;
};

export type JobDecision = {
  status: "pending_retry" | "failed";
  delayMs: number;
};

/** Bounded retry policy shared by the worker and its tests. */
export function nextJobState(input: JobDecisionInput): JobDecision {
  const now = input.now ?? Date.now();
  const attempts = Math.max(0, input.attempts);
  const maxAttempts = Math.max(1, input.maxAttempts);

  if (attempts >= maxAttempts) {
    return { status: "failed", delayMs: 0 };
  }

  const cooldownDelay =
    typeof input.earliestCooldownAt === "number" && input.earliestCooldownAt > now
      ? input.earliestCooldownAt - now
      : 0;
  const rateLimited = input.gatewayBusy === true || input.allRateLimited;
  const base = rateLimited
    ? (input.rateLimitDelayMs ?? 15 * 60_000)
    : (input.retryDelayMs ?? 2 * 60_000);

  return {
    status: "pending_retry",
    delayMs: Math.min(60 * 60_000, Math.max(base, cooldownDelay)),
  };
}

const PENDING_STATUSES = new Set([
  "pending",
  "queued",
  "grading",
  "pending_retry",
]);

export function isPendingSubmissionStatus(status: string): boolean {
  return PENDING_STATUSES.has(status);
}

export const TERMINAL_SUBMISSION_STATUSES = ["graded", "flagged"] as const;

export function isTerminalSubmissionStatus(status: string): boolean {
  return status === "graded" || status === "flagged";
}

export type GradePatchInput = {
  aiScore: number;
  feedbackEn: string;
  feedbackAr: string;
  issues: string[];
  rubricScores: unknown[];
  actualModel: string;
  selectedModel: string;
  provider: string;
  attempts: number;
  durationMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  cost: number | null;
  fallbackUsed: boolean;
  existingFinalScore: number | null;
  currentStatus: string;
  gradedBy: string | null;
  nowIso: string;
};

export type GradePatch = {
  ai_score: number;
  ai_feedback: string;
  ai_feedback_ar: string;
  ai_issues: string[];
  ai_rubric: unknown[];
  ai_model: string;
  ai_selected_model: string;
  ai_provider: string;
  ai_attempts: number;
  ai_duration_ms: number;
  ai_prompt_tokens: number | null;
  ai_completion_tokens: number | null;
  ai_cost: number | null;
  ai_fallback_used: boolean;
  ai_graded_at: string;
  final_score?: number;
  graded_at?: string;
  graded_by?: string;
  status?: string;
};

/**
 * Never overwrites a teacher's final score. Applying the same patch twice is
 * safe because every field is a deterministic value from the grading result.
 */
export function buildGradePatch(input: GradePatchInput): GradePatch {
  const patch: GradePatch = {
    ai_score: input.aiScore,
    ai_feedback: input.feedbackEn,
    ai_feedback_ar: input.feedbackAr,
    ai_issues: input.issues,
    ai_rubric: input.rubricScores,
    ai_model: input.actualModel,
    ai_selected_model: input.selectedModel,
    ai_provider: input.provider,
    ai_attempts: input.attempts,
    ai_duration_ms: input.durationMs,
    ai_prompt_tokens: input.promptTokens,
    ai_completion_tokens: input.completionTokens,
    ai_cost: input.cost,
    ai_fallback_used: input.fallbackUsed,
    ai_graded_at: input.nowIso,
  };

  if (input.existingFinalScore === null) {
    patch.final_score = input.aiScore;
    patch.graded_at = input.nowIso;
    patch.graded_by = "ai";
    patch.status = input.currentStatus === "flagged" ? "flagged" : "graded";
  } else if (
    input.gradedBy !== "teacher" &&
    input.currentStatus !== "flagged" &&
    isPendingSubmissionStatus(input.currentStatus)
  ) {
    patch.status = "graded";
    patch.graded_at = input.nowIso;
  }

  return patch;
}
