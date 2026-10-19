import assert from "node:assert/strict";
import test from "node:test";
import {
  formatUsageRows,
  formatUsageStatusBar,
  toProviderUsagePayload,
  recordRequestUsage,
  type PoolsideUsageSnapshot,
} from "./domain";

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

test("recordRequestUsage accumulates across calls and clamps cached", () => {
  let snapshot: PoolsideUsageSnapshot = {};
  snapshot = recordRequestUsage(snapshot, { prompt_tokens: 10, completion_tokens: 4, prompt_tokens_details: { cached_tokens: 20 } }, "poolside/laguna-xs-2.1", 1);
  snapshot = recordRequestUsage(snapshot, { prompt_tokens: 5, completion_tokens: 2 }, "poolside/laguna-xs-2.1", 2);
  assert.equal(snapshot.tracked?.requests, 2);
  assert.equal(snapshot.tracked?.promptTokens, 15);
  assert.equal(snapshot.tracked?.cachedTokens, 10);
  assert.equal(snapshot.lastRequest?.promptTokens, 5);
  assert.equal(snapshot.lastRequest?.cachedTokens, 0);
});

test("formatting handles empty and populated snapshots", () => {
  assert.equal(formatUsageStatusBar({}), "$(cloud) Poolside");
  const snapshot = recordRequestUsage({}, { prompt_tokens: 10, completion_tokens: 4 }, "m", 42);
  assert.match(formatUsageStatusBar(snapshot), /14 tokens/);
  const rows = formatUsageRows(snapshot);
  assert.equal(rows[0]?.kind, "tracked");
  assert.equal(rows[1]?.kind, "request");
  assert.equal(formatUsageRows({})[0]?.kind, "empty");
});
