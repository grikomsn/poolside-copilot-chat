import assert from "node:assert/strict";
import test from "node:test";
import { buildCompletionPrompt, COMPLETION_SYSTEM_PROMPT, stripSpecialTokens, wantsThinkingSwitch } from "./prompt";

test("emulates fill-in-the-middle with FIM tokens", () => {
  const prompt = buildCompletionPrompt("before", "after", "poolside/laguna-xs-2.1");
  assert.equal(prompt.messages[0]?.content, COMPLETION_SYSTEM_PROMPT);
  assert.equal(
    prompt.messages[1]?.content,
    "<|fim_prefix|>before<|fim_suffix|>after<|fim_middle|>",
  );
});

test("laguna-xs sends no thinking field (measured cleanest and fastest)", () => {
  const prompt = buildCompletionPrompt("a", "b", "poolside/laguna-xs-2.1");
  assert.deepEqual(prompt.extra, {});
});

test("laguna-s sends the request-level thinking-off switch", () => {
  const prompt = buildCompletionPrompt("a", "b", "poolside/laguna-s-2.1");
  assert.deepEqual(prompt.extra, { chat_template_kwargs: { enable_thinking: false } });
});

test("unknown models send no thinking field, mirroring xs", () => {
  assert.deepEqual(buildCompletionPrompt("a", "b", "poolside/laguna-m.1").extra, {});
});

test("maps model ids to the thinking-switch decision", () => {
  assert.equal(wantsThinkingSwitch("poolside/laguna-s-2.1"), true);
  assert.equal(wantsThinkingSwitch("poolside/laguna-xs-2.1"), false);
  assert.equal(wantsThinkingSwitch("poolside/laguna-m.1"), false);
});

test("strips echoed special tokens from suggestions", () => {
  assert.equal(stripSpecialTokens("<|file_separator|>    out.append(x)"), "    out.append(x)");
  assert.equal(stripSpecialTokens("    out.append(x)<|fim_middle|>"), "    out.append(x)");
  assert.equal(stripSpecialTokens("<|fim_prefix|>a<|fim_suffix|>b<|fim_middle|>c"), "abc");
  assert.equal(stripSpecialTokens("    out.append(x)"), "    out.append(x)");
  assert.equal(stripSpecialTokens("echo <| b; # no closing pair"), "echo <| b; # no closing pair");
  assert.equal(stripSpecialTokens("<|file_separator|>"), "");
});
