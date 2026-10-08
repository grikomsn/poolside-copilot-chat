export interface PendingToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatStreamEvent {
  text?: string;
  reasoning?: string;
  toolCalls?: PendingToolCall[];
  usage?: Record<string, unknown>;
  done?: boolean;
  finishReason?: string;
}

export class ChatCompletionStreamParser {
  private buffer = "";
  private readonly pendingTools = new Set<PendingToolCall>();
  private readonly toolIndexes = new Map<number, PendingToolCall>();
  private readonly toolIds = new Map<string, PendingToolCall>();
  private readonly completedIds = new Set<string>();
  private lastFinishReason: string | undefined;

  get finishReason(): string | undefined { return this.lastFinishReason; }

  push(chunk: string): ChatStreamEvent[] {
    this.buffer = (this.buffer + chunk).replace(/\r\n/g, "\n");
    const events: ChatStreamEvent[] = [];
    let boundary: number;
    while ((boundary = this.buffer.indexOf("\n\n")) >= 0) {
      const block = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      const event = this.parseBlock(block);
      if (event) events.push(event);
    }
    return events;
  }

  finish(): ChatStreamEvent[] {
    const events: ChatStreamEvent[] = [];
    const trailing = this.parseBlock(this.buffer);
    this.buffer = "";
    if (trailing) events.push(trailing);
    const tools = successfulCompletion(this.lastFinishReason) ? this.flushTools() : [];
    if (tools.length) events.push({ toolCalls: tools });
    return events;
  }

  private parseBlock(block: string): ChatStreamEvent | undefined {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();
    if (!data) return undefined;
    if (data === "[DONE]") {
      const toolCalls = successfulCompletion(this.lastFinishReason) ? this.flushTools() : [];
      return { done: true, ...(toolCalls.length ? { toolCalls } : {}) };
    }

    let json: Record<string, unknown>;
    try {
      json = JSON.parse(data) as Record<string, unknown>;
    } catch {
      return undefined;
    }

    if (!isRecord(json)) return undefined;
    if (json.error) throw new Error("Poolside returned an error in the response stream");

    const choices = Array.isArray(json.choices) ? json.choices : [];
    const choice = isRecord(choices[0]) ? choices[0] : undefined;
    const delta = isRecord(choice?.delta) ? choice.delta : {};
    this.collectTools(delta.tool_calls);

    const finishReason = typeof choice?.finish_reason === "string" && choice.finish_reason
      ? choice.finish_reason
      : undefined;
    if (finishReason) this.lastFinishReason = finishReason;
    const toolCalls = successfulCompletion(finishReason) ? this.flushTools() : [];
    const text = typeof delta.content === "string" ? delta.content : undefined;
    const reasoning = [delta.reasoning_content, delta.reasoning]
      .find((value): value is string => typeof value === "string" && value.length > 0);
    const usage = isRecord(json.usage) ? json.usage : undefined;

    if (!text && !reasoning && !toolCalls.length && !usage && !finishReason) return undefined;
    return {
      ...(text ? { text } : {}),
      ...(reasoning ? { reasoning } : {}),
      ...(toolCalls.length ? { toolCalls } : {}),
      ...(usage ? { usage } : {}),
      ...(finishReason ? { finishReason } : {}),
    };
  }

  private collectTools(value: unknown): void {
    if (!Array.isArray(value)) return;
    for (const raw of value) {
      if (!isRecord(raw)) continue;
      const index = typeof raw.index === "number" ? raw.index : undefined;
      const id = typeof raw.id === "string" && raw.id ? raw.id : undefined;
      if (id && this.completedIds.has(id)) continue;
      const indexed = index === undefined ? undefined : this.toolIndexes.get(index);
      const identified = id ? this.toolIds.get(id) : undefined;
      if (indexed && identified && indexed !== identified) {
        throw new Error("Poolside returned conflicting tool-call identities");
      }
      let current = indexed ?? identified;
      if (!current && index === undefined && !id && this.pendingTools.size === 1) {
        current = this.pendingTools.values().next().value;
      }
      if (!current) {
        current = { id: "", name: "", arguments: "" };
        this.pendingTools.add(current);
      }
      if (index !== undefined) this.toolIndexes.set(index, current);
      if (id) {
        current.id = id;
        this.toolIds.set(id, current);
      }
      const fn = isRecord(raw.function) ? raw.function : undefined;
      if (typeof fn?.name === "string" && fn.name !== current.name) current.name += fn.name;
      if (typeof fn?.arguments === "string") current.arguments += fn.arguments;
    }
  }

  private flushTools(): PendingToolCall[] {
    const tools = [...this.pendingTools].map((tool) => {
      if (!tool.name) throw new Error("Poolside response stream ended with an unnamed tool call");
      return completeToolCall(tool);
    });
    for (const [id] of this.toolIds) this.completedIds.add(id);
    this.pendingTools.clear();
    this.toolIndexes.clear();
    this.toolIds.clear();
    return tools;
  }
}

export function validateStreamCompletion(finishReason: string | undefined): void {
  if (finishReason === "stop" || finishReason === "tool_calls" || finishReason === "function_call") return;
  if (!finishReason) throw new Error("Poolside response stream ended before a completion reason was received");
  if (finishReason === "length") throw new Error("Poolside response reached its output token limit before completing");
  if (finishReason === "content_filter") throw new Error("Poolside stopped the response because of its content filter");
  throw new Error(`Poolside response ended with finish reason: ${finishReason}`);
}

function completeToolCall(tool: PendingToolCall): PendingToolCall {
  const args = tool.arguments.trim() || "{}";
  try {
    JSON.parse(args);
  } catch {
    throw new Error(`Poolside response stream ended with incomplete arguments for tool ${tool.name}`);
  }
  return { ...tool, arguments: args };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function successfulCompletion(reason: string | undefined): boolean {
  return reason === "stop" || reason === "tool_calls" || reason === "function_call";
}
