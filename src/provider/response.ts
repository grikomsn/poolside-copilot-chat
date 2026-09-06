import * as vscode from "vscode";
import type { ChatStreamEvent } from "../transport/sse";
import { toProviderUsagePayload } from "../usage/domain";

export function reportEvent(
  event: ChatStreamEvent,
  progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
  onUsage: (usage: Record<string, unknown>) => void,
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
    onUsage(event.usage);
    progress.report(new vscode.LanguageModelDataPart(
      new TextEncoder().encode(JSON.stringify(toProviderUsagePayload(event.usage))),
      "usage",
    ));
  }
}

export async function apiError(prefix: string, response: Response): Promise<Error> {
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

function parseArguments(value: string): object {
  try {
    const parsed = JSON.parse(value || "{}");
    return typeof parsed === "object" && parsed !== null ? parsed : { value: parsed };
  } catch {
    return { value };
  }
}
