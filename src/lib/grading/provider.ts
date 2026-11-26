import "server-only";
import {
  gradingResponseSchema,
  normalizeGradingResponse,
  type GradingInput,
  type GradingResponse,
} from "./schema";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import { GradingError, classifyHttpFailure } from "./errors";
import type { PlanModel } from "./fallback-core";

export { GradingError } from "./errors";
export type { GradingFailure } from "./errors";

const DEFAULT_MODEL = "kilo-auto/free";
const DEFAULT_BASE_URL = "https://ai-gateway.kilo.ai/api/v1";
const DEFAULT_TIMEOUT_MS = 30_000;

export type ProviderConfig = {
  apiKey: string | null;
  baseUrl: string | null;
  model: string;
  mock: boolean;
};

function timeoutMs(): number {
  const parsed = Number(process.env.AI_REQUEST_TIMEOUT_MS);
  if (Number.isFinite(parsed) && parsed >= 5_000) {
    return Math.min(60_000, parsed);
  }
  return DEFAULT_TIMEOUT_MS;
}

export function providerConfig(): ProviderConfig {
  const apiKey = (
    process.env.AI_API_KEY ??
    process.env.KILOCODE_API_KEY ??
    process.env.KILO_API_KEY ??
    ""
  ).trim();
  const baseUrl = (
    process.env.AI_BASE_URL ??
    process.env.KILO_BASE_URL ??
    DEFAULT_BASE_URL
  ).trim();
  const model = (process.env.AI_MODEL ?? "").trim() || DEFAULT_MODEL;
  const mock =
    !apiKey &&
    process.env.AI_MOCK === "1" &&
    process.env.NODE_ENV !== "production";

  return {
    apiKey: apiKey || null,
    baseUrl: baseUrl || null,
    model: mock ? "mock" : model,
    mock,
  };
}

export function isGradingConfigured(): boolean {
  const config = providerConfig();
  return Boolean(config.apiKey) || config.mock;
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    score: {
      type: "NUMBER",
      description: "Numeric score between 0 and the assignment maximum.",
    },
    feedback_en: {
      type: "STRING",
      description: "Short English feedback a first-year student can act on.",
    },
    feedback_ar: {
      type: "STRING",
      description: "The same feedback written in Arabic.",
    },
    issues: {
      type: "ARRAY",
      description: "Concrete problems to fix, newest rubric order, max 6.",
      items: { type: "STRING" },
    },
    rubric_scores: {
      type: "ARRAY",
      description: "Optional per-criterion scores, best effort.",
      items: {
        type: "OBJECT",
        properties: {
          criterion: { type: "STRING" },
          score: { type: "NUMBER" },
          max: { type: "NUMBER" },
          comment: { type: "STRING" },
        },
        required: ["criterion", "score"],
      },
    },
  },
  required: ["score", "feedback_en", "feedback_ar", "issues"],
  propertyOrdering: [
    "score",
    "feedback_en",
    "feedback_ar",
    "issues",
    "rubric_scores",
  ],
} as const;

type ChatPayload = {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
    };
    delta?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string; code?: string | number };
};

function extractText(payload: ChatPayload): string {
  if (payload.error?.message) {
    throw new GradingError("api", payload.error.message);
  }

  const choice = payload.choices?.[0];
  if (!choice) throw new GradingError("invalid", "Empty grading response.");

  if (choice.finish_reason === "length") {
    throw new GradingError("invalid", "Grading response was truncated.");
  }

  const text =
    choice.message?.content?.trim() ||
    choice.message?.reasoning_content?.trim() ||
    choice.delta?.content?.trim() ||
    "";
  if (!text) throw new GradingError("invalid", "Empty grading response.");
  return text;
}

function parseGradingJson(text: string, maxScore: number): GradingResponse {
  let cleaned = text
    .replace(/^\uFEFF/, "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  // Some free models prepend a sentence before the JSON object.
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(cleaned);
  } catch {
    throw new GradingError("invalid", "The grader did not return JSON.");
  }

  const parsed = gradingResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new GradingError("invalid", "The grader returned an unexpected shape.");
  }

  return normalizeGradingResponse(parsed.data, maxScore);
}

export type ModelUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export type ModelCallResult = {
  response: GradingResponse;
  rawModel: string;
  provider: string;
  usage: ModelUsage;
  cost: number | null;
};

function tokenCount(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}

/**
 * One HTTP call to one model. No retry logic here: the fallback manager owns
 * attempts, cooldowns, and model order.
 */
export async function callModel(
  model: PlanModel,
  input: GradingInput,
  options: { allowPaid?: boolean } = {},
): Promise<ModelCallResult> {
  if (!model.isFree && options.allowPaid !== true) {
    throw new GradingError(
      "payment",
      "A paid model was blocked by the free-only grading policy.",
      { model: model.id, fatal: true },
    );
  }

  const config = providerConfig();
  if (!config.apiKey) {
    throw new GradingError("config", "AI_API_KEY is not configured.", {
      fatal: true,
    });
  }
  if (!config.baseUrl) {
    throw new GradingError("config", "AI_BASE_URL is not configured.", {
      fatal: true,
    });
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(input);
  const maxTokens = Math.max(
    512,
    Math.min(2048, model.maxCompletionTokens ?? 2048),
  );

  const body: Record<string, unknown> = {
    model: model.id,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: maxTokens,
  };

  // Not every free endpoint accepts response_format. The prompt still demands
  // JSON, and parseGradingJson tolerates fences and extra prose.
  if (model.supportsJsonMode) {
    body.response_format = { type: "json_object" };
  }

  const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs()),
      cache: "no-store",
    });
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    throw new GradingError(
      isTimeout ? "timeout" : "api",
      isTimeout
        ? "The grading model did not answer in time."
        : "Could not reach the AI gateway.",
      { model: model.id },
    );
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    console.error(
      `[grading] ${model.id} returned ${response.status}: ${bodyText.slice(0, 300)}`,
    );
    throw classifyHttpFailure(
      response.status,
      bodyText,
      response.headers.get("retry-after"),
    );
  }

  let payload: ChatPayload;
  try {
    payload = (await response.json()) as ChatPayload;
  } catch {
    throw new GradingError("invalid", "The gateway returned invalid JSON.", {
      model: model.id,
    });
  }

  const text = extractText(payload);
  const grading = parseGradingJson(text, input.maxScore);
  const promptTokens = tokenCount(payload.usage?.prompt_tokens);
  const completionTokens = tokenCount(payload.usage?.completion_tokens);

  let cost: number | null = null;
  if (model.isFree) {
    cost = 0;
  } else if (
    promptTokens !== null &&
    completionTokens !== null &&
    model.pricingPrompt !== null &&
    model.pricingCompletion !== null
  ) {
    cost =
      promptTokens * model.pricingPrompt +
      completionTokens * model.pricingCompletion;
  }

  return {
    response: grading,
    rawModel:
      typeof payload.model === "string" && payload.model.trim()
        ? payload.model.trim()
        : model.id,
    provider: model.provider,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens:
        tokenCount(payload.usage?.total_tokens) ??
        (promptTokens !== null && completionTokens !== null
          ? promptTokens + completionTokens
          : null),
    },
    cost,
  };
}

export type GradeCodeResult = {
  response: GradingResponse;
  model: string;
  mock: boolean;
};

/**
 * Legacy single-model helper kept for compatibility. New code goes through the
 * queue + fallback manager in service.ts.
 */
export async function gradeCode(
  input: GradingInput,
  options: { maxAttempts?: number } = {},
): Promise<GradeCodeResult> {
  const config = providerConfig();
  if (config.mock) {
    const { mockGrade } = await import("./mock");
    return { response: mockGrade(input), model: "mock", mock: true };
  }

  const result = await callModel(
    {
      id: config.model,
      displayName: config.model,
      provider: "configured",
      isFree: true,
      supportsJsonMode: true,
      available: true,
      contextLength: null,
      maxCompletionTokens: 2048,
      pricingPrompt: 0,
      pricingCompletion: 0,
    },
    input,
  );

  return {
    response: result.response,
    model: result.rawModel,
    mock: false,
  };
}
