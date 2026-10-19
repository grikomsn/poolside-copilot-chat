export interface ProviderUsagePayload {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens: number };
  completion_tokens_details?: { reasoning_tokens: number };
}

export interface RequestUsage {
  readonly modelId: string;
  readonly recordedAt: number;
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly totalTokens?: number;
  readonly cachedTokens?: number;
  readonly reasoningTokens?: number;
}
export interface TrackedUsage {
  readonly requests: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly cachedTokens: number;
  readonly reasoningTokens: number;
}
export interface PoolsideUsageSnapshot {
  readonly credentialRef?: string;
  readonly lastRequest?: RequestUsage;
  readonly tracked?: TrackedUsage;
  readonly updatedAt?: number;
  readonly error?: string;
}
export interface UsageDisplayRow {
  readonly kind: "tracked" | "request" | "warning" | "empty";
  readonly label: string;
  readonly description: string;
  readonly detail?: string;
}

export function toProviderUsagePayload(raw: Record<string, unknown>): ProviderUsagePayload {
  const promptTokens = finiteNumber(raw.prompt_tokens ?? raw.input_tokens);
  const completionTokens = finiteNumber(raw.completion_tokens ?? raw.output_tokens);
  const totalTokens = finiteNumber(raw.total_tokens)
    ?? (promptTokens !== undefined && completionTokens !== undefined ? promptTokens + completionTokens : undefined);
  const promptDetails = isRecord(raw.prompt_tokens_details) ? raw.prompt_tokens_details : undefined;
  const completionDetails = isRecord(raw.completion_tokens_details) ? raw.completion_tokens_details : undefined;
  const cachedTokens = finiteNumber(promptDetails?.cached_tokens);
  const reasoningTokens = finiteNumber(completionDetails?.reasoning_tokens);

  return {
    ...(promptTokens === undefined ? {} : { prompt_tokens: promptTokens }),
    ...(completionTokens === undefined ? {} : { completion_tokens: completionTokens }),
    ...(totalTokens === undefined ? {} : { total_tokens: totalTokens }),
    ...(cachedTokens === undefined ? {} : { prompt_tokens_details: { cached_tokens: cachedTokens } }),
    ...(reasoningTokens === undefined ? {} : { completion_tokens_details: { reasoning_tokens: reasoningTokens } }),
  };
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
}

/** Accumulates one request's usage into the additive snapshot for a credential. */
export function recordRequestUsage(
  current: PoolsideUsageSnapshot,
  raw: Record<string, unknown>,
  modelId: string,
  recordedAt = Date.now(),
): PoolsideUsageSnapshot {
  const usage = toProviderUsagePayload(raw);
  const prompt = count(usage.prompt_tokens);
  const completion = count(usage.completion_tokens);
  const cached = Math.min(count(usage.prompt_tokens_details?.cached_tokens) ?? 0, prompt ?? 0);
  const lastRequest: RequestUsage = {
    modelId, recordedAt,
    promptTokens: prompt, completionTokens: completion, totalTokens: count(usage.total_tokens),
    cachedTokens: cached, reasoningTokens: count(usage.completion_tokens_details?.reasoning_tokens),
  };
  const prior = current.tracked;
  return {
    lastRequest, updatedAt: recordedAt,
    tracked: {
      requests: (prior?.requests ?? 0) + 1,
      promptTokens: (prior?.promptTokens ?? 0) + (prompt ?? 0),
      completionTokens: (prior?.completionTokens ?? 0) + (completion ?? 0),
      totalTokens: (prior?.totalTokens ?? 0) + (count(usage.total_tokens) ?? 0),
      cachedTokens: (prior?.cachedTokens ?? 0) + cached,
      reasoningTokens: (prior?.reasoningTokens ?? 0) + (lastRequest.reasoningTokens ?? 0),
    },
  };
}

/** Formats a snapshot into one status-bar token. */
export function formatUsageStatusBar(snapshot: PoolsideUsageSnapshot): string {
  return snapshot.tracked ? `$(graph) Poolside ${snapshot.tracked.totalTokens.toLocaleString()} tokens` : "$(cloud) Poolside";
}

/** Formats the multi-line status-bar tooltip. */
export function formatUsageTooltip(snapshot: PoolsideUsageSnapshot): string {
  const usage = snapshot.tracked;
  return ["Poolside API activity tracked on this device",
    ...(usage ? [`${usage.totalTokens.toLocaleString()} tokens across ${usage.requests} requests`] : []),
    "Click for details"].join("\n");
}

/** QuickPick rows for the unified usage menu. */
export function formatUsageRows(snapshot: PoolsideUsageSnapshot): UsageDisplayRow[] {
  const usage = snapshot.tracked;
  if (!usage) return [{ kind: "empty", label: "No local usage yet", description: "Send a request using a Poolside model" }];
  return [{ kind: "tracked", label: "Tracked on this device",
    description: `${usage.totalTokens.toLocaleString()} tokens · ${usage.requests} requests`,
    detail: `${usage.promptTokens} input · ${usage.completionTokens} output` },
    ...(snapshot.lastRequest ? [{ kind: "request" as const, label: "Last inference",
      description: snapshot.lastRequest.modelId, detail: new Date(snapshot.lastRequest.recordedAt).toLocaleString() }] : [])];
}
