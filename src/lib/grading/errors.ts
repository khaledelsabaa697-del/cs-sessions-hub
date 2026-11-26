import "server-only";

export type GradingFailure =
  | "config"
  | "auth"
  | "payment"
  | "rateLimited"
  | "timeout"
  | "unavailable"
  | "forbidden"
  | "request"
  | "api"
  | "invalid"
  | "noModels"
  | "gateway";

type GradingErrorOptions = {
  status?: number;
  retryAfterSeconds?: number;
  model?: string;
  fatal?: boolean;
};

export class GradingError extends Error {
  code: GradingFailure;
  status?: number;
  retryAfterSeconds?: number;
  model?: string;
  /** Fatal errors stop the fallback chain instead of trying another model. */
  fatal: boolean;

  constructor(
    code: GradingFailure,
    message: string,
    options: GradingErrorOptions = {},
  ) {
    super(message);
    this.name = "GradingError";
    this.code = code;
    this.status = options.status;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.model = options.model;
    this.fatal = options.fatal ?? false;
  }
}

function retryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) {
    return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  }
  return undefined;
}

/**
 * Classify a non-2xx gateway response. Only errors that are safe to retry on a
 * different model are non-fatal; 400/401/402 stop the chain so we never burn
 * attempts on a broken request or accidentally touch paid capacity.
 */
export function classifyHttpFailure(
  status: number,
  body: string,
  retryAfterHeader: string | null,
): GradingError {
  const wait = retryAfterSeconds(retryAfterHeader);
  const detail = body.replace(/\s+/g, " ").trim().slice(0, 300);
  const suffix = detail ? ` ${detail}` : "";

  if (status === 429) {
    return new GradingError("rateLimited", `Gateway rate limit reached.${suffix}`, {
      status,
      retryAfterSeconds: wait,
    });
  }
  if (status === 401) {
    return new GradingError("auth", `Gateway rejected the API key.${suffix}`, {
      status,
      fatal: true,
    });
  }
  if (status === 402) {
    return new GradingError("payment", `The selected model requires credits.${suffix}`, {
      status,
      fatal: true,
    });
  }
  if (status === 403) {
    return new GradingError("forbidden", `This model cannot be used by the key.${suffix}`, {
      status,
    });
  }
  if (status === 404) {
    return new GradingError("unavailable", `The model is not available.${suffix}`, {
      status,
    });
  }
  if (status === 400) {
    return new GradingError("request", `The gateway rejected the request.${suffix}`, {
      status,
      fatal: true,
    });
  }
  if (status === 408 || status === 425) {
    return new GradingError("timeout", `The gateway did not answer in time.${suffix}`, {
      status,
      retryAfterSeconds: wait,
    });
  }
  if (status === 502 || status === 503 || status === 504) {
    return new GradingError("api", `The provider is temporarily unavailable (${status}).${suffix}`, {
      status,
      retryAfterSeconds: wait,
    });
  }
  if (status >= 500) {
    return new GradingError("api", `The provider returned ${status}.${suffix}`, {
      status,
      retryAfterSeconds: wait,
    });
  }

  return new GradingError("api", `The gateway returned ${status}.${suffix}`, { status });
}
