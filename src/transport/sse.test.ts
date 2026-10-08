import assert from "node:assert/strict";
import test from "node:test";
import { ChatCompletionStreamParser, validateStreamCompletion } from "./sse";

test("parses fragmented Poolside text, reasoning, usage, and tool calls", () => {
  const parser = new ChatCompletionStreamParser();
  const events = [
    ...parser.push('data: {"choices":[{"delta":{"reasoning_content":"think"}}]}\n'),
    ...parser.push('\ndata: {"choices":[{"delta":{"content":"Pool"}}]}\n\n'),
    ...parser.push('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"first-id","function":{"name":"get_weather","arguments":""}}]}}]}\n\n'),
    ...parser.push('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"final-id","function":{"name":null,"arguments":"{\\"city\\":\\"Jak"}}]}}]}\n\n'),
    ...parser.push('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"final-id","function":{"name":null,"arguments":"arta\\"}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":140,"completion_tokens":2}}\n\n'),
    ...parser.push("data: [DONE]\n\n"),
    ...parser.finish(),
  ];

  assert.equal(events[0].reasoning, "think");
  assert.equal(events[1].text, "Pool");
  assert.equal(events[2].toolCalls?.[0].id, "final-id");
  assert.equal(events[2].toolCalls?.[0].name, "get_weather");
  assert.deepEqual(JSON.parse(events[2].toolCalls?.[0].arguments ?? ""), { city: "Jakarta" });
  assert.equal(events[2].usage?.prompt_tokens, 140);
  assert.equal(events[3].done, true);
});

test("ignores comments and malformed event blocks", () => {
  const parser = new ChatCompletionStreamParser();
  assert.deepEqual(parser.push(": keep-alive\n\n"), []);
  assert.deepEqual(parser.push("data: not-json\n\n"), []);
  assert.deepEqual(parser.finish(), []);
});

test("rejects incomplete tool arguments and normalizes empty arguments", () => {
  const incomplete = new ChatCompletionStreamParser();
  assert.throws(
    () => incomplete.push('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"lookup","arguments":"{"}}]},"finish_reason":"tool_calls"}]}\n\n'),
    /incomplete arguments for tool lookup/,
  );

  const empty = new ChatCompletionStreamParser();
  const events = empty.push('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"now","arguments":""}}]},"finish_reason":"tool_calls"}]}\n\n');
  assert.equal(events[0].toolCalls?.[0].arguments, "{}");
});

test("validates stream completion reasons", () => {
  assert.doesNotThrow(() => validateStreamCompletion("stop"));
  assert.doesNotThrow(() => validateStreamCompletion("tool_calls"));
  assert.throws(() => validateStreamCompletion(undefined), /before a completion reason/);
  assert.throws(() => validateStreamCompletion("length"), /output token limit/);
});

test("parallel calls preserve ID-only and index-only argument fragments", () => {
  const parser = new ChatCompletionStreamParser();
  const chunk = (delta: object, finish_reason?: string): string => `data: ${JSON.stringify({ choices: [{ delta, finish_reason }] })}\n\n`;
  assert.deepEqual(parser.push(chunk({ tool_calls: [
    { index: 0, id: "first", function: { name: "read", arguments: '{"file":"' } },
    { index: 1, id: "second", function: { name: "read", arguments: '{"file":"' } },
  ] })), []);
  assert.deepEqual(parser.push(chunk({ tool_calls: [{ id: "second", function: { arguments: 'b"}' } }] })), []);
  const events = parser.push(chunk({ tool_calls: [{ index: 0, function: { arguments: 'a"}' } }] }, "tool_calls"));
  assert.deepEqual(events[0].toolCalls, [
    { id: "first", name: "read", arguments: '{"file":"a"}' },
    { id: "second", name: "read", arguments: '{"file":"b"}' },
  ]);
  assert.deepEqual(parser.push(chunk({ tool_calls: [{ id: "first", function: { name: "read", arguments: '{}' } }] }, "tool_calls"))[0]?.toolCalls, undefined);
});

test("an unfinished EOF cannot publish pending tool calls", () => {
  const parser = new ChatCompletionStreamParser();
  parser.push('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"pending","function":{"name":"read","arguments":"{}"}}]}}]}\n\n');
  assert.deepEqual(parser.finish(), []);
  assert.throws(() => validateStreamCompletion(parser.finishReason), /before a completion reason/);
});

test("normalizes CRLF after joining transport chunks and keeps EOF events", () => {
  const parser = new ChatCompletionStreamParser();
  assert.deepEqual(parser.push('data: {"choices":[{"delta":{"content":"hello"}}]}\r'), []);
  assert.deepEqual(parser.push('\n\r\n'), [{ text: "hello" }]);
  assert.deepEqual(parser.push('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}'), []);
  assert.deepEqual(parser.finish(), [{ finishReason: "stop" }]);
  assert.doesNotThrow(() => validateStreamCompletion(parser.finishReason));
});

test("truncated completions cannot publish tool calls even with a final DONE marker", () => {
  const parser = new ChatCompletionStreamParser();
  const events = parser.push('data: {"choices":[{"delta":{"tool_calls":[{"id":"call","index":0,"function":{"name":"read","arguments":"{}"}}]},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n');
  assert.equal(events.flatMap((event) => event.toolCalls ?? []).length, 0);
  assert.deepEqual(parser.finish(), []);
  assert.throws(() => validateStreamCompletion(parser.finishReason), /output token limit/);
});
