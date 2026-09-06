import * as vscode from "vscode";
import { resolveMaxOutputTokens } from "../models/catalog";
import { applyReasoningEffort, type ReasoningEffort } from "../models/options";
import { convertMessages } from "./messages";

export function buildRequest(
  model: string,
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  options: vscode.ProvideLanguageModelChatResponseOptions,
  reasoningEffort: ReasoningEffort,
  advertisedMaxTokens: number,
  configuredMaxTokens: number,
): Record<string, unknown> {
  const maxTokens = resolveMaxOutputTokens(configuredMaxTokens, advertisedMaxTokens);
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
    messages: convertMessages(messages),
    stream: true,
    stream_options: { include_usage: true },
    max_completion_tokens: maxTokens,
    ...(tools.length ? { tools, tool_choice: toolMode(options.toolMode), parallel_tool_calls: true } : {}),
  }, reasoningEffort);
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
