import * as vscode from "vscode";
import { PoolsideAuth } from "./auth/auth";
import { messageOf } from "./errors";
import {
  advertisedModelLimits,
  FALLBACK_MODEL_METADATA,
  FALLBACK_MODELS,
  formatTokenLimit,
  formatModelName,
  orderModelMetadata,
  type PoolsideApiModel,
  type PoolsideModelMetadata,
} from "./models/catalog";
import {
  DEFAULT_REASONING_EFFORT,
  applyReasoningEffort,
  buildModelConfigurationSchema,
  contextSizeOptions,
  resolveContextCap,
  resolveContextSize,
  resolveReasoningEffort,
  type ReasoningEffort,
} from "./models/options";
import { ChatCompletionStreamParser, validateStreamCompletion } from "./transport/sse";
import { POOLSIDE_ENDPOINTS, poolsideHeaders } from "./transport/protocol";
import { toProviderUsagePayload } from "./usage/domain";
import { apiKeyFromConfiguration, credentialRefForApiKey, qualifiedModelId } from "./provider-profile";
import { messageToText } from "./provider/messages";
import { buildRequest } from "./provider/request";
import { apiError, reportEvent } from "./provider/response";

export { API_BASE } from "./transport/protocol";

export interface PoolsideModel extends vscode.LanguageModelChatInformation {
  rawModelId: string;
  credentialRef: string;
}

export class PoolsideProvider implements vscode.LanguageModelChatProvider<PoolsideModel> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeLanguageModelChatInformation = this.changeEmitter.event;
  private readonly catalogs = new Map<string, PoolsideModelMetadata[]>();
  private readonly refreshedAt = new Map<string, number>();
  private readonly apiKeys = new Map<string, string>();

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
    const legacyApiKey = await this.auth.getApiKey();
    const configuredApiKey = options.configuration
      ? apiKeyFromConfiguration(options.configuration)
      : undefined;
    if (token.isCancellationRequested || (options.configuration && !configuredApiKey)) return [];
    const apiKey = configuredApiKey ?? legacyApiKey;
    const credentialRef = configuredApiKey
      ? credentialRefForApiKey(configuredApiKey, legacyApiKey)
      : "legacy";
    if (apiKey) this.apiKeys.set(credentialRef, apiKey);
    const maxAge = Math.max(1, this.configuration.get("catalogCacheMinutes", 5)) * 60_000;
    if (apiKey && Date.now() - (this.refreshedAt.get(credentialRef) ?? 0) > maxAge) {
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
      detail: credentialRef === "legacy"
        ? (apiKey ? "Poolside Platform" : "Poolside API key required")
        : `Poolside Platform · ${credentialRef.slice(0, 8)}`,
      tooltip: `${metadata.id} via the hosted Poolside API · ${formatTokenLimit(metadata.contextLength)} context · ${formatTokenLimit(metadata.maxOutputTokens)} max output · text only`,
      ...advertisedModelLimits(metadata, this.configuration.get("maxOutputTokens", 0)),
      isUserSelectable: true,
      ...(credentialRef !== "legacy" ? { isBYOK: true } : {}),
      ...(credentialRef === "legacy" && !apiKey
        ? { requiresAuthorization: { label: "Configure Poolside API key" } }
        : {}),
      configurationSchema: buildModelConfigurationSchema(defaultEffort, contextSizeOptions(advertisedModelLimits(metadata, this.configuration.get("maxOutputTokens", 0)).maxInputTokens)),
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
    const apiKey = await this.requireApiKey(false, model.credentialRef);
    const reasoningEffort = resolveReasoningEffort(
      options.modelConfiguration,
      this.configuration.get("reasoningEffort", DEFAULT_REASONING_EFFORT),
    );
    const requestBody = buildRequest(
      model.rawModelId,
      messages,
      options,
      reasoningEffort,
      model.maxOutputTokens,
      this.configuration.get("maxOutputTokens", 0),
      resolveContextCap(resolveContextSize(options.modelConfiguration), model.maxInputTokens),
    );
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
          reportEvent(event, progress, (usage) => this.reportUsage(usage));
        }
      }
      for (const event of parser.finish()) reportEvent(event, progress, (usage) => this.reportUsage(usage));
      validateStreamCompletion(parser.finishReason);
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
    const credentialRef = "legacy";
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

  private reportUsage(usage: Record<string, unknown>): void {
    if (this.debugLogging) {
      this.output.appendLine(`[usage] ${JSON.stringify(toProviderUsagePayload(usage))}`);
    }
  }
}
