import * as vscode from "vscode";
import { NativeEntries, credentialReference } from "./auth/auth";
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
import { qualifiedModelId } from "./provider-profile";
import { messageToText } from "./provider/messages";
import { buildRequest } from "./provider/request";
import { apiError, StreamResponseReporter } from "./provider/response";

export { API_BASE } from "./transport/protocol";

export interface PoolsideModel extends vscode.LanguageModelChatInformation {
  rawModelId: string;
  credentialRef: string;
  entryId: string;
  generation: number;
}

export class PoolsideProvider implements vscode.LanguageModelChatProvider<PoolsideModel> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeLanguageModelChatInformation = this.changeEmitter.event;
  private readonly catalogs = new Map<string, PoolsideModelMetadata[]>();
  private readonly refreshedAt = new Map<string, number>();

  private get configuration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration("poolsideCopilot");
  }

  private get debugLogging(): boolean {
    return this.configuration.get("debugLogging", false);
  }

  constructor(
    private readonly entries: NativeEntries,
    private readonly output: vscode.OutputChannel,
    private readonly userAgent: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  fireDidChange(): void {
    this.changeEmitter.fire();
  }

  getEntries(): Array<{ entryId: string; credentialRef: string }> { return this.entries.list(); }

  getInlineApiKey(entryId: string): string | undefined {
    if (!entryId) return undefined;
    try { return this.entries.keyForEntry(entryId); } catch { return undefined; }
  }

  async forgetEntry(entryId: string): Promise<void> {
    await this.entries.forget(entryId);
    this.pruneCatalogs();
    this.changeEmitter.fire();
  }

  getForgottenEntries(): string[] { return this.entries.listForgotten(); }

  async restoreEntry(entryId: string): Promise<void> {
    await this.entries.restore(entryId);
    this.changeEmitter.fire();
  }

  private pruneCatalogs(): void {
    for (const reference of this.catalogs.keys()) {
      if (this.entries.keyForCredential(reference)) continue;
      this.catalogs.delete(reference);
      this.refreshedAt.delete(reference);
    }
  }

  private selectedEntryId(): string {
    return this.configuration.get("managementEntry", "");
  }

  async refreshModels(): Promise<string[]> {
    const apiKey = this.requireEntryKey(this.selectedEntryId());
    const models = await this.refreshCatalog(credentialReference(apiKey), apiKey);
    this.changeEmitter.fire();
    return models.map(({ id }) => id);
  }

  async provideLanguageModelChatInformation(
    options: vscode.PrepareLanguageModelChatModelOptions,
    token: vscode.CancellationToken,
  ): Promise<PoolsideModel[]> {
    if (token.isCancellationRequested || !options.configuration) return [];
    const { entryId, credentialRef, generation } = this.entries.register(options.configuration);
    const apiKey = this.requireEntryKey(entryId);
    this.pruneCatalogs();
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

    if (token.isCancellationRequested || !this.entries.matches(entryId, credentialRef, generation)) return [];
    const defaultEffort = resolveReasoningEffort(
      undefined,
      this.configuration.get("reasoningEffort", DEFAULT_REASONING_EFFORT),
    );
    return this.catalogFor(credentialRef).map((metadata) => ({
      id: qualifiedModelId(entryId, metadata.id),
      rawModelId: metadata.id,
      credentialRef,
      entryId,
      generation,
      name: formatModelName(metadata.id),
      family: "poolside-laguna",
      version: metadata.version,
      detail: `Poolside Platform · ${entryId}`,
      tooltip: `${metadata.id} via the hosted Poolside API · ${formatTokenLimit(metadata.contextLength)} context · ${formatTokenLimit(metadata.maxOutputTokens)} max output · text only`,
      ...advertisedModelLimits(metadata, this.configuration.get("maxOutputTokens", 0)),
      isUserSelectable: true,
      isBYOK: true,
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
    if (token.isCancellationRequested) return;
    if (!this.entries.matches(model.entryId, model.credentialRef, model.generation)) {
      throw new Error("This provider entry was replaced or removed. Select its current model in Manage Language Models.");
    }
    const apiKey = this.requireEntryKey(model.entryId);
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
    const reporter = new StreamResponseReporter(progress, vscode, (usage) => this.reportUsageForModel(usage, model));
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const abortBody = (): void => { void reader?.cancel().catch(() => {}); };
    controller.signal.addEventListener("abort", abortBody);
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
      const response = await this.fetcher(POOLSIDE_ENDPOINTS.chat, {
        method: "POST",
        headers: this.requestHeaders(apiKey, "text/event-stream"),
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      if (!response.ok) throw await apiError(`Poolside request failed for ${model.rawModelId}`, response);
      if (!response.body) throw new Error("Poolside returned an empty response stream");

      const parser = new ChatCompletionStreamParser();
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let complete = false;
      while (true) {
        if (token.isCancellationRequested) {
          await reader.cancel();
          return;
        }
        const result = await reader.read();
        if (result.done) break;
        resetIdleTimeout();
        for (const event of parser.push(decoder.decode(result.value, { stream: true }))) {
          reporter.report(event);
          if (event.done) complete = true;
        }
        if (complete) {
          await reader.cancel();
          break;
        }
      }
      for (const event of parser.push(decoder.decode())) reporter.report(event);
      for (const event of parser.finish()) reporter.report(event);
      if (token.isCancellationRequested) return;
      if (timedOut) throw new Error("Request timed out");
      validateStreamCompletion(parser.finishReason);
    } catch (error) {
      if (token.isCancellationRequested) return;
      if (timedOut === "idle") throw new Error(`Poolside request for ${model.rawModelId} received no data for ${idleTimeoutSeconds} seconds`);
      if (timedOut === "total") throw new Error(`Poolside request for ${model.rawModelId} exceeded ${timeoutSeconds} seconds`);
      throw error;
    } finally {
      reporter.finish();
      controller.signal.removeEventListener("abort", abortBody);
      await reader?.cancel().catch(() => {});
      reader?.releaseLock();
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
    const apiKey = this.requireEntryKey(this.selectedEntryId());
    const credentialRef = credentialReference(apiKey);
    const models = this.catalogFor(credentialRef);
    const model = models.some(({ id }) => id === "poolside/laguna-xs-2.1")
      ? "poolside/laguna-xs-2.1"
      : models[0]?.id ?? FALLBACK_MODELS[0];
    const reasoningEffort = resolveReasoningEffort(
      undefined,
      this.configuration.get("reasoningEffort", DEFAULT_REASONING_EFFORT),
    );
    const response = await this.fetcher(POOLSIDE_ENDPOINTS.chat, {
      method: "POST",
      headers: this.requestHeaders(apiKey, "application/json"),
      signal: AbortSignal.timeout(60_000),
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
    const response = await this.fetcher(POOLSIDE_ENDPOINTS.models, {
      headers: this.requestHeaders(apiKey, "application/json, application/problem+json"),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw await apiError("Unable to list Poolside models", response);
    const body = (await response.json()) as { data?: PoolsideApiModel[] };
    const models = orderModelMetadata(body.data ?? []);
    if (!models.length) throw new Error("Poolside returned no chat-capable models");
    if (this.debugLogging) this.output.appendLine(`[models] ${models.map(({ id }) => id).join(", ")}`);
    return models;
  }

  private requireEntryKey(entryId: string): string {
    const key = this.getInlineApiKey(entryId);
    if (!key) throw new Error("Select an available Poolside entry in Manage Connection, or provision it in Manage Language Models.");
    return key;
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

  private reportUsageForModel(usage: Record<string, unknown>, _model: PoolsideModel): void {
    if (this.debugLogging) {
      this.output.appendLine(`[usage] ${JSON.stringify(toProviderUsagePayload(usage))}`);
    }
  }
}
