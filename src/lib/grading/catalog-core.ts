/**
 * Pure catalog parsing/filtering. Kept free of `server-only` and SDK imports so
 * the fallback tests can exercise the real filtering rules with mocked data.
 */

export type CatalogModel = {
  id: string;
  displayName: string;
  provider: string;
  isFree: boolean;
  supportsJsonMode: boolean;
  supportsStructured: boolean;
  outputModalities: string[];
  contextLength: number | null;
  maxCompletionTokens: number | null;
  pricingPrompt: number | null;
  pricingCompletion: number | null;
  pricingRequest: number | null;
  available: boolean;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function providerFromId(id: string): string {
  const prefix = id.split("/")[0]?.trim();
  return prefix || "unknown";
}

/**
 * A model is only automatically eligible when Kilo explicitly marks it free
 * AND its prompt/completion prices are exactly zero. A zero price alone is not
 * enough (some catalog entries have no pricing metadata yet).
 */
export function isFreeModel(record: UnknownRecord): boolean {
  const pricing = asRecord(record.pricing) ?? {};
  const prompt = asFiniteNumber(pricing.prompt);
  const completion = asFiniteNumber(pricing.completion);
  return record.isFree === true && prompt === 0 && completion === 0;
}

export function parseKiloCatalog(payload: unknown): CatalogModel[] {
  const root = asRecord(payload);
  const rows = Array.isArray(root?.data) ? root.data : [];
  const models: CatalogModel[] = [];

  for (const raw of rows) {
    const row = asRecord(raw);
    if (!row) continue;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id) continue;

    const architecture = asRecord(row.architecture) ?? {};
    const topProvider = asRecord(row.top_provider) ?? {};
    const pricing = asRecord(row.pricing) ?? {};
    const outputModalities = asStringArray(architecture.output_modalities);
    const modality = typeof architecture.modality === "string" ? architecture.modality : "";
    const outputsText =
      outputModalities.includes("text") ||
      (outputModalities.length === 0 && /->\s*text$/i.test(modality));

    // Audio/image generators and embedding-style entries are not chat graders.
    if (!outputsText) continue;

    const params = asStringArray(row.supported_parameters);
    const inferenceProviders = asStringArray(row.inference_provider_ids);
    const pricingPrompt = asFiniteNumber(pricing.prompt);
    const pricingCompletion = asFiniteNumber(pricing.completion);
    const pricingRequest = asFiniteNumber(pricing.request);

    models.push({
      id,
      displayName:
        typeof row.name === "string" && row.name.trim() ? row.name.trim() : id,
      provider: inferenceProviders[0] ?? providerFromId(id),
      isFree: isFreeModel(row),
      supportsJsonMode:
        params.includes("response_format") || params.includes("structured_outputs"),
      supportsStructured: params.includes("structured_outputs"),
      outputModalities,
      contextLength: asFiniteNumber(row.context_length),
      maxCompletionTokens: asFiniteNumber(topProvider.max_completion_tokens),
      pricingPrompt,
      pricingCompletion,
      pricingRequest,
      available: true,
    });
  }

  return models;
}
