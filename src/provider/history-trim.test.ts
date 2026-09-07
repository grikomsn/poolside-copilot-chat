import assert from "node:assert/strict";
import test from "node:test";
import { estimateMessageTokens, trimHistoryToFit } from "./history-trim";
import type { ApiMessage } from "./messages";

function userMessage(text: string): ApiMessage {
  return { role: "user", content: text };
}

function toolCallMessage(callId: string): ApiMessage {
  return {
    role: "assistant",
    content: null,
    tool_calls: [{ id: callId, type: "function", function: { name: "run", arguments: "{}" } }],
  };
}

function toolResultMessage(callId: string, content: string): ApiMessage {
  return { role: "tool", tool_call_id: callId, content };
}

test("keeps history that already fits the budget", () => {
  const messages = [userMessage("hello"), userMessage("more")];
  const result = trimHistoryToFit(messages, 10_000);

  assert.equal(result.removedItems, 0);
  assert.equal(result.items, messages);
});

test("drops the oldest turns until the estimated payload fits", () => {
  const messages = [
    userMessage("a".repeat(400)),
    userMessage("b".repeat(400)),
    userMessage("c".repeat(400)),
    userMessage("d".repeat(400)),
    userMessage("e".repeat(400)),
  ];
  const result = trimHistoryToFit(messages, 250);

  assert.equal(result.removedItems, 3);
  assert.deepEqual(result.items, [messages[0], messages[4]]);
  assert.ok(result.estimatedTokens <= 250);
});

test("keeps tool calls and their results in one dropped unit", () => {
  const messages = [
    userMessage("a".repeat(400)),
    userMessage("b".repeat(400)),
    toolCallMessage("call-1"),
    toolResultMessage("call-1", "done"),
    userMessage("c".repeat(400)),
    userMessage("d".repeat(400)),
  ];
  const result = trimHistoryToFit(messages, 310);

  assert.equal(result.removedItems, 3);
  assert.deepEqual(result.items, [messages[0], messages[4], messages[5]]);
});

test("does not split a pending tool call from its result", () => {
  const messages = [
    userMessage("a".repeat(400)),
    userMessage("b".repeat(400)),
    toolCallMessage("call-1"),
    userMessage("please continue"),
    toolResultMessage("call-1", "done"),
    userMessage("c".repeat(400)),
    userMessage("d".repeat(400)),
  ];
  const result = trimHistoryToFit(messages, 310);

  // The interleaved user text cannot become a drop boundary while the call is
  // unanswered, so the unit keeps the call, text, and result together.
  assert.equal(result.removedItems, 4);
  assert.deepEqual(result.items, [messages[0], messages[5], messages[6]]);
});

test("keeps the anchor and current turn when nothing else fits", () => {
  const messages = [userMessage("anchor"), userMessage("x".repeat(4000)), userMessage("current")];
  const result = trimHistoryToFit(messages, 10);

  assert.equal(result.removedItems, 1);
  assert.deepEqual(result.items, [messages[0], messages[2]]);
});

test("never trims single-message history and ignores non-positive budgets", () => {
  assert.equal(trimHistoryToFit([], 100).removedItems, 0);
  assert.equal(trimHistoryToFit([userMessage("only turn ".repeat(100))], 1).removedItems, 0);
  const messages = [userMessage("a"), userMessage("b"), userMessage("c")];
  const result = trimHistoryToFit(messages, 0);
  assert.equal(result.removedItems, 0);
  assert.equal(result.items, messages);
});

test("estimates messages and tool calls with the chars-per-token heuristic", () => {
  assert.equal(estimateMessageTokens(userMessage("x".repeat(40))), 10);
  assert.equal(estimateMessageTokens({ role: "assistant", content: null }), 1);
  assert.equal(estimateMessageTokens(toolCallMessage("call-1")), Math.ceil("run{}".length / 4));
  assert.equal(estimateMessageTokens(toolResultMessage("call-1", "ok")), 1);
});
