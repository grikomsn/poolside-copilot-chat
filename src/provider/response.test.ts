import assert from "node:assert/strict";
import test from "node:test";
import type * as vscode from "vscode";
import { StreamResponseReporter, type ResponsePartConstructors } from "./response";

class TextPart { constructor(readonly value: string) {} }
class ThinkingPart { constructor(readonly value: string | string[], readonly id?: string, readonly metadata?: Record<string, unknown>) {} }
class ToolPart { constructor(readonly callId: string, readonly name: string, readonly input: object) {} }
class DataPart { constructor(readonly data: Uint8Array, readonly mimeType: string) {} }
function harness(requestId = "request", thinkingAvailable = true): { reporter: StreamResponseReporter; parts: object[]; usage: object[] } {
  const parts: object[] = [];
  const usage: object[] = [];
  const constructors = { LanguageModelTextPart: TextPart, LanguageModelThinkingPart: thinkingAvailable ? ThinkingPart : undefined,
    LanguageModelToolCallPart: ToolPart, LanguageModelDataPart: DataPart } as ResponsePartConstructors;
  return { parts, usage, reporter: new StreamResponseReporter({ report: (part: vscode.LanguageModelResponsePart2) => parts.push(part) }, constructors, (value) => usage.push(value), requestId) };
}

test("mixed reasoning, text and parallel tools keep conversation order", () => {
  const { reporter, parts } = harness();
  reporter.report({ reasoning: "Reasoning", text: "Answer", toolCalls: [
    { id: "first", name: "read", arguments: '{"file":"a"}' }, { id: "second", name: "read", arguments: '{"file":"b"}' },
  ] });
  reporter.finish();
  assert.deepEqual(parts, [new ThinkingPart("Reasoning", "poolside-thinking-request"),
    new ThinkingPart("", "poolside-thinking-request", { vscode_reasoning_done: true }),
    new TextPart("Answer"), new ToolPart("first", "read", { file: "a" }), new ToolPart("second", "read", { file: "b" })]);
});

test("usage does not close thinking; completion and cleanup close it once", () => {
  for (const terminal of [{ done: true }, { finishReason: "stop" }, {}]) {
    const { reporter, parts, usage } = harness();
    reporter.report({ reasoning: "First" });
    reporter.report({ usage: { prompt_tokens: 2, completion_tokens: 3 } });
    reporter.report({ reasoning: "Second" });
    reporter.report(terminal);
    reporter.finish(); reporter.finish();
    assert.equal(usage.length, 1);
    assert.equal(parts.filter((part) => part instanceof ThinkingPart && part.metadata?.vscode_reasoning_done).length, 1);
    assert.equal(parts.filter((part) => part instanceof DataPart).length, 1);
  }
});

test("missing tool IDs are unique within and across requests", () => {
  const first = harness("first"); const second = harness("second");
  const event = { toolCalls: [{ id: "", name: "read", arguments: "{}" }, { id: "", name: "read", arguments: "{}" }] };
  first.reporter.report(event); second.reporter.report(event);
  const ids = [...first.parts, ...second.parts].map((part) => (part as ToolPart).callId);
  assert.equal(new Set(ids).size, 4);
});

test("hosts without thinking parts still receive visible output", () => {
  const { reporter, parts } = harness("request", false);
  reporter.report({ reasoning: "Hidden", text: "Answer" }); reporter.finish();
  assert.deepEqual(parts, [new TextPart("Answer")]);
});

test("usage events during thinking wait for the segment close so deltas stay mergeable", () => {
  const { reporter, parts, usage } = harness();
  reporter.report({ reasoning: "Son" });
  reporter.report({ usage: { prompt_tokens: 10, completion_tokens: 4 } });
  reporter.report({ reasoning: "ar still flags a" });
  reporter.report({ usage: { prompt_tokens: 20, completion_tokens: 9 } });
  reporter.report({ reasoning: " regex" });
  reporter.report({ text: "answer" });
  reporter.finish();
  // Copilot Chat merges a thinking delta only when the previous part is a
  // non-empty thinking part; interleaved usage data parts would split the
  // reasoning into one bubble per delta.
  assert.deepEqual(parts.map((part) => (part as object).constructor.name),
    ["ThinkingPart", "ThinkingPart", "ThinkingPart", "ThinkingPart", "DataPart", "DataPart", "TextPart"]);
  assert.deepEqual(parts.slice(0, 3).map((part) => (part as ThinkingPart).value), ["Son", "ar still flags a", " regex"]);
  assert.deepEqual((parts[3] as ThinkingPart).metadata, { vscode_reasoning_done: true });
  assert.equal(usage.length, 2);
  const data = parts.filter((part): part is DataPart => part instanceof DataPart);
  assert.deepEqual(data.map((part) => JSON.parse(new TextDecoder().decode(part.data)).completion_tokens), [4, 9]);
});
