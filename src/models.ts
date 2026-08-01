export const FALLBACK_MODELS = [
  "poolside/laguna-m.1",
  "poolside/laguna-xs-2.1",
  "poolside/laguna-s-2.1",
] as const;

export const DEFAULT_MAX_INPUT_TOKENS = 262_144;
export const DEFAULT_MAX_OUTPUT_TOKENS = 32_768;

export interface PoolsideModelMetadata {
  readonly id: string;
  readonly version: string;
  readonly contextLength: number;
  readonly maxOutputTokens: number;
}

export interface PoolsideApiModel {
  readonly id?: unknown;
  readonly version?: unknown;
  readonly context_length?: unknown;
  readonly max_context_tokens?: unknown;
  readonly max_model_len?: unknown;
  readonly max_output_tokens?: unknown;
  readonly max_completion_tokens?: unknown;
}

export const FALLBACK_MODEL_METADATA: readonly PoolsideModelMetadata[] = [
  {
    id: "poolside/laguna-m.1",
    version: "1",
    contextLength: 262_144,
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
  },
  {
    id: "poolside/laguna-xs-2.1",
    version: "2.1",
    contextLength: 262_144,
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
  },
  {
    id: "poolside/laguna-s-2.1",
    version: "2.1",
    contextLength: 1_048_576,
    maxOutputTokens: 131_072,
  },
];

const PREFERRED_ORDER = new Map<string, number>(
  FALLBACK_MODELS.map((id, index) => [id, index]),
);

const FALLBACK_METADATA_BY_ID = new Map(
  FALLBACK_MODEL_METADATA.map((metadata) => [metadata.id, metadata]),
);

export function isPoolsideChatModel(id: string): boolean {
  const value = id.toLowerCase();
  return value.startsWith("poolside/")
    && !/(?:^|[-/])(point|embed(?:ding)?s?|image|video|audio|voice)(?:[-/.]|$)/.test(value);
}

export function orderModels(ids: readonly string[]): string[] {
  return [...new Set(ids)]
    .filter(isPoolsideChatModel)
    .sort((left, right) => {
      const leftRank = PREFERRED_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = PREFERRED_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank || left.localeCompare(right);
    });
}

export function getModelMetadata(id: string): PoolsideModelMetadata {
  return FALLBACK_METADATA_BY_ID.get(id) ?? {
    id,
    version: "unknown",
    contextLength: DEFAULT_MAX_INPUT_TOKENS,
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
  };
}

export function orderModelMetadata(models: readonly PoolsideApiModel[]): PoolsideModelMetadata[] {
  const metadataById = new Map<string, PoolsideModelMetadata>();
  for (const model of models) {
    const metadata = modelMetadataFromApi(model);
    if (metadata && !metadataById.has(metadata.id)) metadataById.set(metadata.id, metadata);
  }
  return orderModels([...metadataById.keys()]).flatMap((id) => {
    const metadata = metadataById.get(id);
    return metadata ? [metadata] : [];
  });
}

export function formatTokenLimit(tokens: number): string {
  if (tokens >= 1024 * 1024) return `${Math.round(tokens / (1024 * 1024))}M`;
  if (tokens >= 1024) return `${Math.round(tokens / 1024)}K`;
  return `${tokens}`;
}

function modelMetadataFromApi(model: PoolsideApiModel): PoolsideModelMetadata | undefined {
  if (typeof model.id !== "string" || !isPoolsideChatModel(model.id)) return undefined;
  const fallback = getModelMetadata(model.id);
  return {
    ...fallback,
    ...(typeof model.version === "string" && model.version ? { version: model.version } : {}),
    contextLength: positiveInteger(
      model.context_length ?? model.max_context_tokens ?? model.max_model_len,
    ) ?? fallback.contextLength,
    maxOutputTokens: positiveInteger(
      model.max_output_tokens ?? model.max_completion_tokens,
    ) ?? fallback.maxOutputTokens,
  };
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

export function formatModelName(id: string): string {
  return id
    .replace(/^poolside\//i, "")
    .split("-")
    .map((part) => {
      if (/^(xs|s|m)(?:\.|$)/i.test(part)) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}
