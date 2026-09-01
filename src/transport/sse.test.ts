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
