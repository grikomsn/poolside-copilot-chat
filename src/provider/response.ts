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
  /** Usage events held back while a thinking segment is open, flushed on close. */
  private pendingUsage: Record<string, unknown>[] = [];

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
    if (event.text || event.toolCalls?.length || event.done || event.finishReason) this.flushThinking();
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
      // Copilot Chat only merges reasoning deltas while the previous reported
      // part is also thinking; hold usage data parts until the segment closes.
      if (this.thinkingOpen) this.pendingUsage.push(event.usage);
      else this.reportUsage(event.usage);
    }
  }

  finish(): void {
    this.flushThinking();
  }

  private flushThinking(): void {
    if (!this.thinkingOpen) return;
    this.thinkingOpen = false;
    const ThinkingPart = this.parts.LanguageModelThinkingPart;
    if (ThinkingPart) this.progress.report(new ThinkingPart("", "", { vscode_reasoning_done: true }));
    for (const usage of this.pendingUsage.splice(0)) this.reportUsage(usage);
  }

  private reportUsage(usage: Record<string, unknown>): void {
    this.progress.report(new this.parts.LanguageModelDataPart(
      new TextEncoder().encode(JSON.stringify(toProviderUsagePayload(usage))), "usage",
    ));
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
