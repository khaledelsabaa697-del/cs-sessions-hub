import "server-only";
import { gradingResponseSchema, normalizeGradingResponse, type GradingInput, type GradingResponse } from "./schema";
import { MOCK_MODEL, mockGrade } from "./mock";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";

export const DEFAULT_MODEL = "gemini-2.5-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_ATTEMPTS = 3;

export type GradingFailure =
  | "config"
  | "rateLimited"
  | "timeout"
  | "api"
  | "invalid";

export class GradingError extends Error {
  code: GradingFailure;

  constructor(code: GradingFailure, message: string) {
    super(message);
    this.name = "GradingError";
    this.code = code;
  }
}

export type GradingConfig = {
  apiKey: string | null;
  model: string;
  mock: boolean;
};

export function gradingConfig(): GradingConfig {
  const apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  const requested = (process.env.GEMINI_MODEL ?? "").trim() || DEFAULT_MODEL;
  const mock =
    !apiKey &&
    process.env.GEMINI_MOCK === "1" &&
    process.env.NODE_ENV !== "production";

  return {
    apiKey: apiKey || null,
    model: mock ? MOCK_MODEL : requested,
    mock,
  };
}

export function isGradingConfigured(): boolean {
  const config = gradingConfig();
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
  },
  required: ["score", "feedback_en", "feedback_ar", "issues"],
  propertyOrdering: ["score", "feedback_en", "feedback_ar", "issues"],
} as const;

type GeminiPayload = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
};

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number, retryAfterHeader: string | null): number {
  const retryAfter = Number(retryAfterHeader);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(5_000, retryAfter * 1_000);
  }
  const base = 400 * 2 ** (attempt - 1);
  return base + Math.floor(Math.random() * 250);
}

function extractText(payload: GeminiPayload): string {
  if (payload.promptFeedback?.blockReason) {
    throw new GradingError("invalid", "The grader refused to answer.");
  }

  const candidate = payload.candidates?.[0];
  if (!candidate) throw new GradingError("invalid", "Empty grading response.");
  if (candidate.finishReason === "MAX_TOKENS") {
    throw new GradingError("invalid", "Grading response was truncated.");
  }

  const text = (candidate.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) throw new GradingError("invalid", "Empty grading response.");
  return text;
}

function parseGradingJson(text: string, maxScore: number): GradingResponse {
  const cleaned = text
    .replace(/^\uFEFF/, "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

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

export type GradeCodeResult = {
  response: GradingResponse;
  model: string;
  mock: boolean;
};

/**
 * Calls Gemini with a strict JSON response schema and retries transient
 * failures (429/5xx/network). The API key never leaves the server.
 */
export async function gradeCode(
  input: GradingInput,
  options: { maxAttempts?: number } = {},
): Promise<GradeCodeResult> {
  const config = gradingConfig();

  if (config.mock) {
    return { response: mockGrade(input), model: MOCK_MODEL, mock: true };
  }

  if (!config.apiKey) {
    throw new GradingError("config", "GEMINI_API_KEY is not configured.");
  }

  const maxAttempts = Math.min(
    MAX_ATTEMPTS,
    Math.max(1, options.maxAttempts ?? MAX_ATTEMPTS),
  );

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
    contents: [{ role: "user", parts: [{ text: buildUserPrompt(input) }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  const url = `${API_BASE}/${encodeURIComponent(config.model)}:generateContent`;

  let lastFailure: GradingError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": config.apiKey,
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });

      if (response.ok) {
        const payload = (await response.json()) as GeminiPayload;
        const text = extractText(payload);
        return {
          response: parseGradingJson(text, input.maxScore),
          model: config.model,
          mock: false,
        };
      }

      const status = response.status;
      console.error(`Gemini grading failed with status ${status} (attempt ${attempt}).`);

      if (status === 429) {
        lastFailure = new GradingError("rateLimited", "Gemini rate limit reached.");
      } else if (status === 401 || status === 403) {
        throw new GradingError("config", "Gemini rejected the API key.");
      } else if (status === 400) {
        throw new GradingError("api", "Gemini rejected the request.");
      } else {
        lastFailure = new GradingError("api", `Gemini returned ${status}.`);
      }

      if (!RETRYABLE_STATUS.has(status) || attempt === maxAttempts) {
        throw lastFailure;
      }

      await sleep(backoffMs(attempt, response.headers.get("retry-after")));
    } catch (error) {
      if (error instanceof GradingError) throw error;

      const isTimeout =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");

      lastFailure = isTimeout
        ? new GradingError("timeout", "Gemini did not answer in time.")
        : new GradingError("api", "Could not reach Gemini.");

      console.error(
        `Gemini grading request error (attempt ${attempt}):`,
        error instanceof Error ? error.message : error,
      );

      if (attempt === maxAttempts) throw lastFailure;
      await sleep(backoffMs(attempt, null));
    }
  }

  throw lastFailure ?? new GradingError("api", "Grading failed.");
}
