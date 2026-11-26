import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseKiloCatalog,
  type CatalogModel,
} from "./catalog-core";
import type { GradingMode } from "./fallback-core";

export const DEFAULT_MODELS_URL = "https://ai-gateway.kilo.ai/api/v1/models";
const CATALOG_TTL_MS = 15 * 60_000;
const MEMORY_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 12_000;
const CHUNK_SIZE = 150;

let memoryCache: { at: number; models: CatalogModel[] } | null = null;

export type GradingSettings = {
  mode: GradingMode;
  preferredModel: string | null;
  allowPaid: boolean;
  maxAttempts: number;
  updatedAt: string | null;
};

export type ModelState = {
  status: "ok" | "rate_limited" | "unavailable";
  cooldownUntil: number | null;
};

export const DEFAULT_GRADING_SETTINGS: GradingSettings = {
  mode: "auto_free",
  preferredModel: null,
  allowPaid: false,
  maxAttempts: 3,
  updatedAt: null,
};

export function modelsEndpoint(): string {
  return (process.env.AI_MODELS_URL ?? "").trim() || DEFAULT_MODELS_URL;
}

type ModelRow = {
  id: string;
  display_name: string;
  provider: string;
  is_free: boolean;
  supports_json_mode: boolean;
  supports_structured: boolean;
  output_modalities: string[] | null;
  context_length: number | null;
  max_completion_tokens: number | null;
  pricing_prompt: number | string | null;
  pricing_completion: number | string | null;
  pricing_request: number | string | null;
  available: boolean;
};

function numberOrNull(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fromRow(row: ModelRow): CatalogModel {
  return {
    id: row.id,
    displayName: row.display_name,
    provider: row.provider,
    isFree: row.is_free,
    supportsJsonMode: row.supports_json_mode,
    supportsStructured: row.supports_structured,
    outputModalities: row.output_modalities ?? [],
    contextLength: row.context_length,
    maxCompletionTokens: row.max_completion_tokens,
    pricingPrompt: numberOrNull(row.pricing_prompt),
    pricingCompletion: numberOrNull(row.pricing_completion),
    pricingRequest: numberOrNull(row.pricing_request),
    available: row.available,
  };
}

function toRow(model: CatalogModel, nowIso: string) {
  return {
    id: model.id,
    display_name: model.displayName,
    provider: model.provider,
    is_free: model.isFree,
    supports_json_mode: model.supportsJsonMode,
    supports_structured: model.supportsStructured,
    output_modalities: model.outputModalities,
    context_length: model.contextLength,
    max_completion_tokens: model.maxCompletionTokens,
    pricing_prompt: model.pricingPrompt,
    pricing_completion: model.pricingCompletion,
    pricing_request: model.pricingRequest,
    available: true,
    last_seen_at: nowIso,
    updated_at: nowIso,
  };
}

async function fetchCatalog(): Promise<CatalogModel[]> {
  const response = await fetch(modelsEndpoint(), {
    method: "GET",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Model catalog returned ${response.status}.`);
  }

  const payload: unknown = await response.json();
  const models = parseKiloCatalog(payload);
  if (models.length === 0) {
    throw new Error("Model catalog did not contain any text models.");
  }
  return models;
}

async function persistCatalog(
  admin: ReturnType<typeof createAdminClient>,
  models: CatalogModel[],
): Promise<void> {
  const nowIso = new Date().toISOString();
  const rows = models.map((model) => toRow(model, nowIso));

  for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
    const chunk = rows.slice(start, start + CHUNK_SIZE);
    const { error } = await admin
      .from("grading_models")
      .upsert(chunk, { onConflict: "id" });
    if (error) throw error;
  }

  // Anything not seen in this refresh is no longer offered by Kilo.
  await admin
    .from("grading_models")
    .update({ available: false })
    .lt("last_seen_at", nowIso);
}

async function readCatalog(
  admin: ReturnType<typeof createAdminClient>,
): Promise<CatalogModel[]> {
  const { data, error } = await admin
    .from("grading_models")
    .select(
      "id, display_name, provider, is_free, supports_json_mode, supports_structured, output_modalities, context_length, max_completion_tokens, pricing_prompt, pricing_completion, pricing_request, available",
    )
    .order("is_free", { ascending: false })
    .order("display_name", { ascending: true })
    .returns<ModelRow[]>();
  if (error) throw error;
  return (data ?? []).map(fromRow);
}

/**
 * Returns the current catalog, refreshing it from Kilo when older than 15
 * minutes (or when `force` is set). A failed refresh keeps the previous rows
 * instead of taking grading offline.
 */
export async function ensureModelCatalog(force = false): Promise<CatalogModel[]> {
  const now = Date.now();
  if (!force && memoryCache && now - memoryCache.at < MEMORY_TTL_MS) {
    return memoryCache.models;
  }

  const admin = createAdminClient();

  let newest: string | null = null;
  const latest = await admin
    .from("grading_models")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ updated_at: string }>();
  if (!latest.error && latest.data?.updated_at) {
    newest = latest.data.updated_at;
  }

  const stale =
    force ||
    newest === null ||
    now - Date.parse(newest) > CATALOG_TTL_MS;

  if (stale) {
    try {
      const fresh = await fetchCatalog();
      await persistCatalog(admin, fresh);
      memoryCache = { at: now, models: fresh };
      return fresh;
    } catch (error) {
      console.error(
        "[grading catalog] refresh failed:",
        error instanceof Error ? error.message : error,
      );
      if (memoryCache) return memoryCache.models;
    }
  }

  try {
    const models = await readCatalog(admin);
    memoryCache = { at: now, models };
    return models;
  } catch (error) {
    console.error(
      "[grading catalog] read failed:",
      error instanceof Error ? error.message : error,
    );
    return memoryCache?.models ?? [];
  }
}

export async function getGradingSettings(): Promise<GradingSettings> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("grading_settings")
    .select("mode, preferred_model, allow_paid, max_attempts, updated_at")
    .eq("id", 1)
    .maybeSingle<{
      mode: GradingMode;
      preferred_model: string | null;
      allow_paid: boolean;
      max_attempts: number;
      updated_at: string;
    }>();

  if (error || !data) return DEFAULT_GRADING_SETTINGS;

  return {
    mode: data.mode,
    preferredModel: data.preferred_model,
    allowPaid: data.allow_paid,
    maxAttempts: data.max_attempts,
    updatedAt: data.updated_at,
  };
}

export async function getModelStateMap(): Promise<Record<string, ModelState>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("grading_model_state")
    .select("model_id, status, cooldown_until")
    .returns<
      Array<{
        model_id: string;
        status: "ok" | "rate_limited" | "unavailable";
        cooldown_until: string | null;
      }>
    >();

  if (error) {
    console.error("[grading catalog] model state read failed:", error.message);
    return {};
  }

  const map: Record<string, ModelState> = {};
  for (const row of data ?? []) {
    map[row.model_id] = {
      status: row.status,
      cooldownUntil: row.cooldown_until ? Date.parse(row.cooldown_until) : null,
    };
  }
  return map;
}

export async function getCatalogUpdatedAt(): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("grading_models")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ updated_at: string }>();
  return data?.updated_at ?? null;
}

export function freeModels(models: CatalogModel[]): CatalogModel[] {
  return models.filter((model) => model.isFree);
}

export function paidModels(models: CatalogModel[]): CatalogModel[] {
  return models.filter((model) => !model.isFree);
}
