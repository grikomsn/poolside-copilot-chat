import * as vscode from "vscode";

export interface ApiMessage {
  role: "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ApiToolCall[];
  tool_call_id?: string;
}

export interface ApiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export function convertMessages(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
): ApiMessage[] {
  const converted = messages.flatMap(convertMessage);
  const filtered = converted.filter((message) =>
    Boolean(message.tool_calls?.length || message.tool_call_id || message.content),
  );
  if (filtered[0]?.role === "assistant") {
    filtered.unshift({ role: "user", content: "Continue from the previous assistant response." });
  }
  return filtered.length ? filtered : [{ role: "user", content: "" }];
}

export function messageToText(message: vscode.LanguageModelChatRequestMessage): string {
  return message.content.map(inputPartText).join("\n");
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

function inputPartText(part: vscode.LanguageModelInputPart | unknown): string {
  if (part instanceof vscode.LanguageModelTextPart) return part.value;
  if (part instanceof vscode.LanguageModelToolCallPart) return JSON.stringify(part.input ?? {});
  if (part instanceof vscode.LanguageModelToolResultPart) return part.content.map(inputPartText).join("\n");
  if (part instanceof vscode.LanguageModelDataPart) return `[${part.mimeType} data omitted]`;
  if (typeof part === "string") return part;
  return "";
}