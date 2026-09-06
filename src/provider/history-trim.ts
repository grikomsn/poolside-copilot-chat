/** Token estimation and oldest-turn trimming for opted-in context caps. */

import type { ApiMessage } from "./messages";

/** Result of trimming a request message list against a context cap. */
export interface HistoryTrimResult {
  readonly items: readonly ApiMessage[];
  readonly removedItems: number;
  readonly estimatedTokens: number;
}

/** Matches the extension's chars-per-token counting heuristic. */
const CHARS_PER_TOKEN = 4;

interface ItemUnit {
  readonly start: number;
  readonly end: number;
  readonly tokens: number;
}

/** Estimates the token weight of one converted chat message. */
export function estimateMessageTokens(message: ApiMessage): number {
  let tokens = textTokens(message.content ?? "");
  for (const call of message.tool_calls ?? []) {
    tokens += Math.max(1, textTokens(`${call.function.name}${call.function.arguments}`));
  }
  return Math.max(1, tokens);
}

/**
 * Drops the oldest conversation turns from converted messages so the estimated
 * payload fits an opted-in context cap. Units are bounded by user messages
 * with no outstanding tool calls, so tool calls and results are never split,
 * and the first and current messages always survive.
 *
 * @example
 * ```ts
 * const result = trimHistoryToFit(convertedMessages, contextCapTokens);
 * ```
 */
export function trimHistoryToFit(messages: readonly ApiMessage[], budgetTokens: number): HistoryTrimResult {
  const itemTokens = messages.map((message) => estimateMessageTokens(message));
  const units = buildItemUnits(messages, itemTokens);
  const total = units.reduce((sum, unit) => sum + unit.tokens, 0);
  if (budgetTokens <= 0 || units.length < 3 || total <= budgetTokens) {
    return { items: messages, removedItems: 0, estimatedTokens: total };
  }
  // Drop the smallest prefix of middle units that fits, keeping the newest history.
  let droppedTokens = 0;
  let dropUpToUnit = 1;
  for (let unit = 1; unit <= units.length - 2; unit++) {
    droppedTokens += units[unit].tokens;
    dropUpToUnit = unit;
    if (total - droppedTokens <= budgetTokens) break;
  }
  const dropStart = units[1].start;
  const dropEnd = units[dropUpToUnit].end;
  return {
    items: [...messages.slice(0, dropStart), ...messages.slice(dropEnd + 1)],
    removedItems: dropEnd - dropStart + 1,
    estimatedTokens: total - droppedTokens,
  };
}

/** Groups messages into turn units bounded by user messages with settled tool calls. */
function buildItemUnits(messages: readonly ApiMessage[], itemTokens: readonly number[]): ItemUnit[] {
  const units: ItemUnit[] = [];
  let start = 0;
  const pendingCalls = new Set<string>();
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    const boundary = index > start && pendingCalls.size === 0 && message.role === "user";
    if (boundary) {
      units.push({
        start,
        end: index - 1,
        tokens: itemTokens.slice(start, index).reduce((sum, tokens) => sum + tokens, 0),
      });
      start = index;
    }
    for (const call of message.tool_calls ?? []) pendingCalls.add(call.id);
    if (message.role === "tool" && typeof message.tool_call_id === "string") pendingCalls.delete(message.tool_call_id);
  }
  units.push({
    start,
    end: messages.length - 1,
    tokens: itemTokens.slice(start).reduce((sum, tokens) => sum + tokens, 0),
  });
  return units;
}

function textTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
