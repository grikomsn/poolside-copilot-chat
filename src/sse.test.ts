import assert from "node:assert/strict";
import test from "node:test";
import { ChatCompletionStreamParser } from "./sse";

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
