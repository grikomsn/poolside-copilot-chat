import type * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import type { ChatStreamEvent } from "../transport/sse";
import { toProviderUsagePayload } from "../usage/domain";

export type ResponsePartConstructors = Pick<typeof vscode,
  "LanguageModelTextPart" | "LanguageModelToolCallPart" | "LanguageModelDataPart"
> & { LanguageModelThinkingPart?: typeof vscode.LanguageModelThinkingPart };

/** The reporter belongs to one request, including its cleanup path. */
export class StreamResponseReporter {
  private thinkingOpen = false;
  private toolIndex = 0;

  constructor(
    private readonly progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
    private readonly parts: ResponsePartConstructors,
    private readonly onUsage: (usage: Record<string, unknown>) => void = () => {},
    private readonly requestId: string = randomUUID(),
  ) {}

  report(event: ChatStreamEvent): void {
    if (event.reasoning && this.parts.LanguageModelThinkingPart) {
      this.progress.report(new this.parts.LanguageModelThinkingPart(event.reasoning));
      this.thinkingOpen = true;
    }
    if (event.text || event.toolCalls?.length || event.done || event.finishReason) this.finish();
    if (event.text) this.progress.report(new this.parts.LanguageModelTextPart(event.text));
    for (const tool of event.toolCalls ?? []) {
      this.progress.report(new this.parts.LanguageModelToolCallPart(
        tool.id || `poolside-tool-${this.requestId}-${this.toolIndex++}`,
        tool.name,
        parseArguments(tool.arguments),
      ));
    }
    if (event.usage) {
      this.onUsage(event.usage);
      this.progress.report(new this.parts.LanguageModelDataPart(
        new TextEncoder().encode(JSON.stringify(toProviderUsagePayload(event.usage))), "usage",
      ));
    }
  }

  finish(): void {
    if (!this.thinkingOpen) return;
    const ThinkingPart = this.parts.LanguageModelThinkingPart;
    if (ThinkingPart) this.progress.report(new ThinkingPart("", "", { vscode_reasoning_done: true }));
    this.thinkingOpen = false;
  }
}

function parseArguments(value: string): object {
  const parsed: unknown = JSON.parse(value || "{}");
  return typeof parsed === "object" && parsed !== null ? parsed : { value: parsed };
}

export async function apiError(prefix: string, response: Response): Promise<Error> {
  // Error bodies may echo credentials or request contents.
  await response.body?.cancel();
  return new Error(`${prefix} (HTTP ${response.status})`);
}
