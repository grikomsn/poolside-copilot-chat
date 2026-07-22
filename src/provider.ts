import * as vscode from "vscode";
import { PoolsideAuth } from "./auth";
import { messageOf } from "./errors";
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  FALLBACK_MODELS,
  MAX_INPUT_TOKENS,
  formatModelName,
  orderModels,
} from "./models";
import {
  DEFAULT_REASONING_EFFORT,
  applyReasoningEffort,
  buildModelConfigurationSchema,
  resolveReasoningEffort,
  type ReasoningEffort,
} from "./model-options";
import { ChatCompletionStreamParser, type ChatStreamEvent } from "./sse";
import { toProviderUsagePayload } from "./usage";

export const API_BASE = "https://inference.poolside.ai/v1";

export interface PoolsideModel extends vscode.LanguageModelChatInformation {
  rawModelId: string;
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
  private models: string[] = [...FALLBACK_MODELS];
  private lastModelRefreshAt = 0;

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
    this.models = models;
    this.lastModelRefreshAt = Date.now();
    this.changeEmitter.fire();
    return models;
  }

  async clearApiKey(): Promise<void> {
    await this.auth.clearApiKey();
    this.models = [...FALLBACK_MODELS];
    this.lastModelRefreshAt = 0;
    this.changeEmitter.fire();
  }

  async refreshModels(): Promise<string[]> {
    const apiKey = await this.requireApiKey(false);
    const models = await this.fetchModels(apiKey);
    this.models = models;
    this.lastModelRefreshAt = Date.now();
    this.changeEmitter.fire();
    return models;
  }

  async provideLanguageModelChatInformation(
    _options: vscode.PrepareLanguageModelChatModelOptions,
    token: vscode.CancellationToken,
  ): Promise<PoolsideModel[]> {
    if (token.isCancellationRequested) return [];
    const apiKey = await this.auth.getApiKey();
    if (apiKey && Date.now() - this.lastModelRefreshAt > 5 * 60_000) {
      try {
        const models = await this.fetchModels(apiKey);
        this.models = models;
        this.lastModelRefreshAt = Date.now();
      } catch (error) {
        this.output.appendLine(`[models] discovery failed; using cached/fallback list: ${messageOf(error)}`);
      }
    }

    const defaultEffort = resolveReasoningEffort(
      undefined,
      this.configuration.get("reasoningEffort", DEFAULT_REASONING_EFFORT),
    );
    return this.models.map((id) => ({
      id,
      rawModelId: id,
      name: formatModelName(id),
      family: "poolside-laguna",
      version: "1.0.0",
      detail: apiKey ? "Poolside Platform" : "Poolside API key required",
      tooltip: `${id} via the hosted Poolside API · 256K context · text only`,
      maxInputTokens: MAX_INPUT_TOKENS,
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
      isUserSelectable: true,
      requiresAuthorization: apiKey ? undefined : { label: "Configure Poolside API key" },
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
    const apiKey = await this.requireApiKey(true);
    const reasoningEffort = resolveReasoningEffort(
      options.modelConfiguration,
      this.configuration.get("reasoningEffort", DEFAULT_REASONING_EFFORT),
    );
    const requestBody = buildRequest(model.rawModelId, messages, options, reasoningEffort);
    const response = await this.sendRequest(apiKey, requestBody, token);
    if (!response.ok) throw await apiError(`Poolside request failed for ${model.rawModelId}`, response);
    if (!response.body) throw new Error("Poolside returned an empty response stream");

    if (this.debugLogging) {
      this.output.appendLine(`[request] model=${model.rawModelId} effort=${reasoningEffort} initiator=${options.requestInitiator ?? "unknown"}`);
    }

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
      for (const event of parser.push(decoder.decode(result.value, { stream: true }))) {
        this.reportEvent(event, progress);
      }
    }
    for (const event of parser.finish()) this.reportEvent(event, progress);
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
    const apiKey = await this.requireApiKey(false);
    const model = this.models.includes("poolside/laguna-xs-2.1")
      ? "poolside/laguna-xs-2.1"
      : this.models[0] ?? FALLBACK_MODELS[0];
    const reasoningEffort = resolveReasoningEffort(
      undefined,
      this.configuration.get("reasoningEffort", DEFAULT_REASONING_EFFORT),
    );
    const response = await fetch(`${API_BASE}/chat/completions`, {
      method: "POST",
      headers: this.requestHeaders(apiKey, "application/json"),
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with exactly: Poolside connection verified" }],
        max_completion_tokens: 512,
        reasoning: { effort: reasoningEffort },
        stream: false,
      }),
    });
    if (!response.ok) throw await apiError("Poolside connection test failed", response);
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return { model, reasoningEffort, text: body.choices?.[0]?.message?.content?.trim() ?? "(empty response)" };
  }

  private async fetchModels(apiKey: string): Promise<string[]> {
    if (!apiKey) throw new Error("Poolside API key is not configured");
    const response = await fetch(`${API_BASE}/models`, {
      headers: this.requestHeaders(apiKey, "application/json, application/problem+json"),
    });
    if (!response.ok) throw await apiError("Unable to list Poolside models", response);
    const body = (await response.json()) as { data?: Array<{ id?: string }> };
    const models = orderModels((body.data ?? []).flatMap((model) => model.id ? [model.id] : []));
    if (!models.length) throw new Error("Poolside returned no chat-capable models");
    if (this.debugLogging) this.output.appendLine(`[models] ${models.join(", ")}`);
    return models;
  }

  private async requireApiKey(prompt: boolean): Promise<string> {
    let apiKey = await this.auth.getApiKey();
    if (!apiKey && prompt) {
      await vscode.commands.executeCommand("poolsideCopilot.configureApiKey");
      apiKey = await this.auth.getApiKey();
    }
    if (!apiKey) {
      throw new Error("Poolside API key is not configured. Run ‘Poolside: Configure API Key’.");
    }
    return apiKey;
  }

  private async sendRequest(
    apiKey: string,
    requestBody: Record<string, unknown>,
    cancellation: vscode.CancellationToken,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutSeconds = Math.max(10, this.configuration.get("requestTimeoutSeconds", 600));
    const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
    const listener = cancellation.onCancellationRequested(() => controller.abort());
    try {
      return await fetch(`${API_BASE}/chat/completions`, {
        method: "POST",
        headers: this.requestHeaders(apiKey, "text/event-stream"),
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
      listener.dispose();
    }
  }

  private requestHeaders(apiKey: string, accept: string): Record<string, string> {
    return {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: accept,
      "User-Agent": this.userAgent,
    };
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
  const maxTokens = vscode.workspace
    .getConfiguration("poolsideCopilot")
    .get("maxOutputTokens", DEFAULT_MAX_OUTPUT_TOKENS);
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
