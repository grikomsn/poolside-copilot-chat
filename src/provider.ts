import * as vscode from "vscode";
import { PoolsideAuth } from "./auth/auth";
import { messageOf } from "./errors";
import {
  FALLBACK_MODEL_METADATA,
  FALLBACK_MODELS,
  formatTokenLimit,
  formatModelName,
  getModelMetadata,
  orderModelMetadata,
  type PoolsideApiModel,
  type PoolsideModelMetadata,
} from "./models/catalog";
import {
  DEFAULT_REASONING_EFFORT,
  applyReasoningEffort,
  buildModelConfigurationSchema,
  resolveReasoningEffort,
  type ReasoningEffort,
} from "./models/options";
import { ChatCompletionStreamParser, type ChatStreamEvent } from "./transport/sse";
import { POOLSIDE_ENDPOINTS, poolsideHeaders } from "./transport/protocol";
import { toProviderUsagePayload } from "./usage/domain";
import { apiKeyFromConfiguration, credentialRefForApiKey, qualifiedModelId } from "./provider-profile";

export { API_BASE } from "./transport/protocol";

export interface PoolsideModel extends vscode.LanguageModelChatInformation {
  rawModelId: string;
  credentialRef: string;
}

interface ApiMessage {
  role: "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ApiToolCall[];
  tool_call_id?: string;
}

interface ApiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export class PoolsideProvider implements vscode.LanguageModelChatProvider<PoolsideModel> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeLanguageModelChatInformation = this.changeEmitter.event;
  private readonly catalogs = new Map<string, PoolsideModelMetadata[]>();
  private readonly refreshedAt = new Map<string, number>();
  private readonly apiKeys = new Map<string, string>();
  private activeCredentialRef = "legacy";

  private get configuration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration("poolsideCopilot");
  }

  private get debugLogging(): boolean {
    return this.configuration.get("debugLogging", false);
  }

  constructor(
    private readonly auth: PoolsideAuth,
    private readonly output: vscode.OutputChannel,
    private readonly userAgent: string,
  ) {}

  fireDidChange(): void {
    this.changeEmitter.fire();
  }

  async configureApiKey(apiKey: string): Promise<string[]> {
    const models = await this.fetchModels(apiKey.trim());
    await this.auth.storeApiKey(apiKey);
    this.activeCredentialRef = "legacy";
    this.setCatalog("legacy", models);
    this.changeEmitter.fire();
    return models.map(({ id }) => id);
  }

  async clearApiKey(): Promise<void> {
    await this.auth.clearApiKey();
    this.apiKeys.delete("legacy");
    this.setCatalog("legacy", [...FALLBACK_MODEL_METADATA]);
    this.refreshedAt.delete("legacy");
    this.changeEmitter.fire();
  }

  async refreshModels(): Promise<string[]> {
    const apiKey = await this.requireApiKey(false, "legacy");
    const models = await this.refreshCatalog("legacy", apiKey);
    this.changeEmitter.fire();
    return models.map(({ id }) => id);
  }

  async provideLanguageModelChatInformation(
    options: vscode.PrepareLanguageModelChatModelOptions,
    token: vscode.CancellationToken,
  ): Promise<PoolsideModel[]> {
    if (token.isCancellationRequested || !options.configuration) return [];
    const apiKey = apiKeyFromConfiguration(options.configuration);
    if (!apiKey) return [];
    const legacyApiKey = await this.auth.getApiKey();
    const credentialRef = credentialRefForApiKey(apiKey, legacyApiKey);
    this.apiKeys.set(credentialRef, apiKey);
    const maxAge = Math.max(1, this.configuration.get("catalogCacheMinutes", 5)) * 60_000;
    if (Date.now() - (this.refreshedAt.get(credentialRef) ?? 0) > maxAge) {
      try {
        await this.refreshCatalog(credentialRef, apiKey, token);
      } catch (error) {
        if (!token.isCancellationRequested) {
          this.output.appendLine(`[models] discovery failed; using cached/fallback list: ${messageOf(error)}`);
        }
      }
    }

    const defaultEffort = resolveReasoningEffort(
      undefined,
      this.configuration.get("reasoningEffort", DEFAULT_REASONING_EFFORT),
    );
    return this.catalogFor(credentialRef).map((metadata) => ({
      id: qualifiedModelId(credentialRef, metadata.id),
      rawModelId: metadata.id,
      credentialRef,
      name: formatModelName(metadata.id),
      family: "poolside-laguna",
      version: metadata.version,
      detail: credentialRef === "legacy" ? "Poolside Platform" : `Poolside Platform · ${credentialRef.slice(0, 8)}`,
      tooltip: `${metadata.id} via the hosted Poolside API · ${formatTokenLimit(metadata.contextLength)} context · ${formatTokenLimit(metadata.maxOutputTokens)} max output · text only`,
      maxInputTokens: metadata.contextLength,
      maxOutputTokens: metadata.maxOutputTokens,
      isUserSelectable: true,
      isBYOK: true,
      requiresAuthorization: { label: `Poolside API key (${credentialRef.slice(0, 8)})` },
      configurationSchema: buildModelConfigurationSchema(defaultEffort),
      capabilities: {
        imageInput: false,
        toolCalling: true,
      },
    }));
  }

  async provideLanguageModelChatResponse(
    model: PoolsideModel,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
    token: vscode.CancellationToken,
  ): Promise<void> {
    this.activeCredentialRef = model.credentialRef;
    const apiKey = await this.requireApiKey(false, model.credentialRef);
    const reasoningEffort = resolveReasoningEffort(
      options.modelConfiguration,
      this.configuration.get("reasoningEffort", DEFAULT_REASONING_EFFORT),
    );
    const requestBody = buildRequest(model.rawModelId, messages, options, reasoningEffort);
    const controller = new AbortController();
    const cancellation = token.onCancellationRequested(() => controller.abort());
    const timeoutSeconds = Math.max(10, this.configuration.get("requestTimeoutSeconds", 600));
    const idleTimeoutSeconds = Math.max(10, this.configuration.get("streamIdleTimeoutSeconds", 120));
    let timedOut: "total" | "idle" | undefined;
    const totalTimeout = setTimeout(() => {
      timedOut = "total";
      controller.abort();
    }, timeoutSeconds * 1000);
    let idleTimeout: ReturnType<typeof setTimeout> | undefined;
    const resetIdleTimeout = (): void => {
      if (idleTimeout) clearTimeout(idleTimeout);
      idleTimeout = setTimeout(() => {
        timedOut = "idle";
        controller.abort();
      }, idleTimeoutSeconds * 1000);
    };
    resetIdleTimeout();
    try {
      if (this.debugLogging) {
        this.output.appendLine(`[request] model=${model.rawModelId} effort=${reasoningEffort} initiator=${options.requestInitiator ?? "unknown"}`);
      }
      const response = await fetch(POOLSIDE_ENDPOINTS.chat, {
        method: "POST",
        headers: this.requestHeaders(apiKey, "text/event-stream"),
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      if (!response.ok) throw await apiError(`Poolside request failed for ${model.rawModelId}`, response);
      if (!response.body) throw new Error("Poolside returned an empty response stream");

      const parser = new ChatCompletionStreamParser();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        if (token.isCancellationRequested) {
          await reader.cancel();
          return;
        }
        const result = await reader.read();
        if (result.done) break;
        resetIdleTimeout();
        for (const event of parser.push(decoder.decode(result.value, { stream: true }))) {
          this.reportEvent(event, progress);
        }
      }
      for (const event of parser.finish()) this.reportEvent(event, progress);
    } catch (error) {
      if (token.isCancellationRequested) return;
      if (timedOut === "idle") throw new Error(`Poolside request for ${model.rawModelId} received no data for ${idleTimeoutSeconds} seconds`);
      if (timedOut === "total") throw new Error(`Poolside request for ${model.rawModelId} exceeded ${timeoutSeconds} seconds`);
      throw error;
    } finally {
      clearTimeout(totalTimeout);
      if (idleTimeout) clearTimeout(idleTimeout);
      cancellation.dispose();
    }
  }

  async provideTokenCount(
    _model: PoolsideModel,
    value: string | vscode.LanguageModelChatRequestMessage,
    _token: vscode.CancellationToken,
  ): Promise<number> {
    const text = typeof value === "string" ? value : messageToText(value);
    return Math.max(1, Math.ceil(text.length / 4));
  }

  async testConnection(): Promise<{ model: string; reasoningEffort: ReasoningEffort; text: string }> {
    const credentialRef = this.activeCredentialRef;
    const apiKey = await this.requireApiKey(false, credentialRef);
    const models = this.catalogFor(credentialRef);
    const model = models.some(({ id }) => id === "poolside/laguna-xs-2.1")
      ? "poolside/laguna-xs-2.1"
      : models[0]?.id ?? FALLBACK_MODELS[0];
    const reasoningEffort = resolveReasoningEffort(
      undefined,
      this.configuration.get("reasoningEffort", DEFAULT_REASONING_EFFORT),
    );
    const response = await fetch(POOLSIDE_ENDPOINTS.chat, {
      method: "POST",
      headers: this.requestHeaders(apiKey, "application/json"),
      body: JSON.stringify(applyReasoningEffort({
        model,
        messages: [{ role: "user", content: "Reply with exactly: Poolside connection verified" }],
        max_completion_tokens: 512,
        stream: false,
      }, reasoningEffort)),
    });
    if (!response.ok) throw await apiError("Poolside connection test failed", response);
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return { model, reasoningEffort, text: body.choices?.[0]?.message?.content?.trim() ?? "(empty response)" };
  }

  private async fetchModels(apiKey: string): Promise<PoolsideModelMetadata[]> {
    if (!apiKey) throw new Error("Poolside API key is not configured");
    const response = await fetch(POOLSIDE_ENDPOINTS.models, {
      headers: this.requestHeaders(apiKey, "application/json, application/problem+json"),
    });
    if (!response.ok) throw await apiError("Unable to list Poolside models", response);
    const body = (await response.json()) as { data?: PoolsideApiModel[] };
    const models = orderModelMetadata(body.data ?? []);
    if (!models.length) throw new Error("Poolside returned no chat-capable models");
    if (this.debugLogging) this.output.appendLine(`[models] ${models.map(({ id }) => id).join(", ")}`);
    return models;
  }

  private async requireApiKey(prompt: boolean, credentialRef: string): Promise<string> {
    let apiKey = credentialRef === "legacy" ? await this.auth.getApiKey() : this.apiKeys.get(credentialRef);
    if (!apiKey && prompt && credentialRef === "legacy") {
      await vscode.commands.executeCommand("poolsideCopilot.configureApiKey");
      apiKey = await this.auth.getApiKey();
    }
    if (!apiKey) {
      throw new Error(credentialRef === "legacy"
        ? "Poolside API key is not configured. Run ‘Poolside: Configure API Key’."
        : "The API key for this Poolside provider entry is unavailable. Update the entry in Manage Language Models.");
    }
    return apiKey;
  }

  private catalogFor(credentialRef: string): PoolsideModelMetadata[] {
    let catalog = this.catalogs.get(credentialRef);
    if (!catalog) {
      catalog = [...FALLBACK_MODEL_METADATA];
      this.catalogs.set(credentialRef, catalog);
    }
    return catalog;
  }

  private setCatalog(credentialRef: string, models: readonly PoolsideModelMetadata[]): void {
    this.catalogs.set(credentialRef, [...models]);
    this.refreshedAt.set(credentialRef, Date.now());
  }

  private async refreshCatalog(
    credentialRef: string,
    apiKey: string,
    token?: vscode.CancellationToken,
  ): Promise<PoolsideModelMetadata[]> {
    if (token?.isCancellationRequested) return this.catalogFor(credentialRef);
    const models = await this.fetchModels(apiKey);
    this.setCatalog(credentialRef, models);
    return models;
  }

  private requestHeaders(apiKey: string, accept: string): Record<string, string> {
    return poolsideHeaders(apiKey, accept, this.userAgent);
  }

  private reportEvent(
    event: ChatStreamEvent,
    progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
  ): void {
    if (event.text) progress.report(new vscode.LanguageModelTextPart(event.text));
    if (event.reasoning) {
      const ThinkingPart = (vscode as unknown as { LanguageModelThinkingPart?: typeof vscode.LanguageModelThinkingPart })
        .LanguageModelThinkingPart;
      if (ThinkingPart) progress.report(new ThinkingPart(event.reasoning));
    }
    for (const tool of event.toolCalls ?? []) {
      progress.report(new vscode.LanguageModelToolCallPart(
        tool.id || `poolside-tool-${Date.now()}`,
        tool.name,
        parseArguments(tool.arguments),
      ));
    }
    if (event.usage) {
      const payload = toProviderUsagePayload(event.usage);
      if (this.debugLogging) this.output.appendLine(`[usage] ${JSON.stringify(payload)}`);
      progress.report(new vscode.LanguageModelDataPart(
        new TextEncoder().encode(JSON.stringify(payload)),
        "usage",
      ));
    }
  }
}

function buildRequest(
  model: string,
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  options: vscode.ProvideLanguageModelChatResponseOptions,
  reasoningEffort: ReasoningEffort,
): Record<string, unknown> {
  const configuredMaxTokens = vscode.workspace
    .getConfiguration("poolsideCopilot")
    .get("maxOutputTokens", 0);
  const advertisedMaxTokens = getModelMetadata(model).maxOutputTokens;
  const maxTokens = configuredMaxTokens > 0
    ? Math.min(configuredMaxTokens, advertisedMaxTokens)
    : advertisedMaxTokens;
  const tools = (options.tools ?? []).map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: sanitizeSchema(tool.inputSchema),
    },
  }));
  return applyReasoningEffort({
    model,
    messages: normalizeMessages(messages.flatMap(convertMessage)),
    stream: true,
    stream_options: { include_usage: true },
    max_completion_tokens: maxTokens,
    ...(tools.length ? { tools, tool_choice: toolMode(options.toolMode), parallel_tool_calls: true } : {}),
  }, reasoningEffort);
}

function convertMessage(message: vscode.LanguageModelChatRequestMessage): ApiMessage[] {
  const role = message.role === vscode.LanguageModelChatMessageRole.Assistant ? "assistant" : "user";
  const text: string[] = [];
  const toolCalls: ApiToolCall[] = [];
  const results: ApiMessage[] = [];

  for (const part of message.content) {
    if (part instanceof vscode.LanguageModelTextPart) text.push(part.value);
    else if (part instanceof vscode.LanguageModelToolCallPart) {
      toolCalls.push({
        id: part.callId,
        type: "function",
        function: { name: part.name, arguments: JSON.stringify(part.input ?? {}) },
      });
    } else if (part instanceof vscode.LanguageModelToolResultPart) {
      results.push({ role: "tool", tool_call_id: part.callId, content: part.content.map(inputPartText).join("\n") });
    } else if (part instanceof vscode.LanguageModelDataPart && part.mimeType.startsWith("image/")) {
      throw new Error("Poolside hosted models are text-only. Remove image attachments and try again.");
    }
  }

  const content = text.join("\n");
  if (role === "assistant" && toolCalls.length) {
    return [{ role, content: content || null, tool_calls: toolCalls }];
  }
  if (results.length) return content ? [{ role, content }, ...results] : results;
  return [{ role, content }];
}

function normalizeMessages(messages: ApiMessage[]): ApiMessage[] {
  const filtered = messages.filter((message) =>
    Boolean(message.tool_calls?.length || message.tool_call_id || message.content),
  );
  if (filtered[0]?.role === "assistant") {
    filtered.unshift({ role: "user", content: "Continue from the previous assistant response." });
  }
  return filtered.length ? filtered : [{ role: "user", content: "" }];
}

function inputPartText(part: vscode.LanguageModelInputPart | unknown): string {
  if (part instanceof vscode.LanguageModelTextPart) return part.value;
  if (part instanceof vscode.LanguageModelToolCallPart) return JSON.stringify(part.input ?? {});
  if (part instanceof vscode.LanguageModelToolResultPart) return part.content.map(inputPartText).join("\n");
  if (part instanceof vscode.LanguageModelDataPart) return `[${part.mimeType} data omitted]`;
  if (typeof part === "string") return part;
  return "";
}

function messageToText(message: vscode.LanguageModelChatRequestMessage): string {
  return message.content.map(inputPartText).join("\n");
}

function sanitizeSchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return { type: "object", properties: {} };
  }
  return schema as Record<string, unknown>;
}

function toolMode(mode: vscode.LanguageModelChatToolMode | undefined): "auto" | "required" {
  return mode === vscode.LanguageModelChatToolMode.Required ? "required" : "auto";
}

function parseArguments(value: string): object {
  try {
    const parsed = JSON.parse(value || "{}");
    return typeof parsed === "object" && parsed !== null ? parsed : { value: parsed };
  } catch {
    return { value };
  }
}

async function apiError(prefix: string, response: Response): Promise<Error> {
  const text = (await response.text().catch(() => "")).trim();
  let detail = text;
  try {
    const json = JSON.parse(text) as {
      error?: { message?: string } | string;
      detail?: string;
      message?: string;
      title?: string;
    };
    detail = typeof json.error === "string"
      ? json.error
      : json.error?.message ?? json.detail ?? json.message ?? json.title ?? text;
  } catch {
    // Use the response text as-is.
  }
  return new Error(`${prefix} (HTTP ${response.status})${detail ? `: ${detail.slice(0, 1000)}` : ""}`);
}
