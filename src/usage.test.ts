import assert from "node:assert/strict";
import test from "node:test";
import { toProviderUsagePayload } from "./usage";

test("normalizes Poolside OpenAI-compatible usage for VS Code", () => {
  assert.deepEqual(toProviderUsagePayload({
    prompt_tokens: 140,
    completion_tokens: 2,
    total_tokens: 142,
    prompt_tokens_details: { cached_tokens: 64 },
    completion_tokens_details: { reasoning_tokens: 1 },
  }), {
    prompt_tokens: 140,
    completion_tokens: 2,
    total_tokens: 142,
    prompt_tokens_details: { cached_tokens: 64 },
    completion_tokens_details: { reasoning_tokens: 1 },
  });
});

test("accepts alternate token names and derives totals", () => {
  assert.deepEqual(toProviderUsagePayload({ input_tokens: 8, output_tokens: 3 }), {
    prompt_tokens: 8,
    completion_tokens: 3,
    total_tokens: 11,
  });
});
