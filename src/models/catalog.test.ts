import assert from "node:assert/strict";
import test from "node:test";
import {
  advertisedModelLimits,
  FALLBACK_MODELS,
  formatModelName,
  formatTokenLimit,
  getModelMetadata,
  isPoolsideChatModel,
  orderModelMetadata,
  orderModels,
  resolveMaxOutputTokens,
} from "./catalog";

test("recognizes Poolside chat models and excludes non-chat families", () => {
  assert.equal(isPoolsideChatModel("poolside/laguna-m.1"), true);
  assert.equal(isPoolsideChatModel("poolside/laguna-xs-2.1"), true);
  assert.equal(isPoolsideChatModel("poolside/point"), false);
  assert.equal(isPoolsideChatModel("poolside/text-embedding"), false);
  assert.equal(isPoolsideChatModel("other/laguna"), false);
});

test("orders documented hosted models before unknown future models", () => {
  assert.deepEqual(orderModels([
    "poolside/future-chat",
    "poolside/laguna-s-2.1",
    "poolside/laguna-m.1",
    "poolside/laguna-m.1",
  ]), [
    FALLBACK_MODELS[1],
    "poolside/future-chat",
    "poolside/laguna-m.1",
  ]);
});

test("collapses casing-only API aliases before VS Code renders their names", () => {
  assert.deepEqual(orderModels([
    "poolside/Laguna-S-2.1",
    "poolside/laguna-s-2.1",
    "poolside/Laguna-XS-2.1",
    "poolside/laguna-xs-2.1",
  ]), [
    "poolside/laguna-xs-2.1",
    "poolside/laguna-s-2.1",
  ]);
});

test("formats hosted model IDs for the VS Code picker", () => {
  assert.equal(formatModelName("poolside/laguna-m.1"), "Laguna M.1");
  assert.equal(formatModelName("poolside/laguna-xs-2.1"), "Laguna XS 2.1");
  assert.equal(formatModelName("poolside/laguna-s-2.1"), "Laguna S 2.1");
});

test("provides current per-model Laguna fallback metadata", () => {
  assert.deepEqual(getModelMetadata("poolside/laguna-xs-2.1"), {
    id: "poolside/laguna-xs-2.1",
    version: "2.1",
    contextLength: 262_144,
    maxOutputTokens: 262_144,
  });
  assert.deepEqual(getModelMetadata("poolside/laguna-s-2.1"), {
    id: "poolside/laguna-s-2.1",
    version: "2.1",
    contextLength: 1_048_576,
    maxOutputTokens: 262_144,
  });
  assert.equal(formatTokenLimit(1_048_576), "1M");
  assert.equal(formatTokenLimit(262_144), "256K");
});

test("uses exactly the live catalog and enriches its advertised limits", () => {
  assert.deepEqual(orderModelMetadata([
    { id: "poolside/Laguna-S-2.1", context_length: 262_144, max_completion_tokens: 65_536 },
    { id: "poolside/laguna-s-2.1", context_length: 1_048_576 },
    { id: "poolside/laguna-xs-2.1", context_length: 262_144 },
    { id: "poolside/image-model", context_length: 1_000_000 },
    { id: "poolside/laguna-xs-2.1", context_length: 1_000_000 },
  ]), [
    {
      id: "poolside/laguna-xs-2.1",
      version: "2.1",
      contextLength: 262_144,
      maxOutputTokens: 262_144,
    },
    {
      id: "poolside/laguna-s-2.1",
      version: "2.1",
      contextLength: 262_144,
      maxOutputTokens: 65_536,
    },
  ]);
});

test("uses the selected catalog limit for default and explicit output settings", () => {
  assert.equal(resolveMaxOutputTokens(0, 65_536), 65_536);
  assert.equal(resolveMaxOutputTokens(100_000, 65_536), 65_536);
  assert.equal(resolveMaxOutputTokens(32_000, 65_536), 32_000);
});

test("keeps useful input and response budgets for every Laguna model", () => {
  for (const contextLength of [262_144, 1_048_576]) {
    const limits = advertisedModelLimits({ contextLength, maxOutputTokens: 262_144 });
    assert.equal(limits.maxInputTokens, contextLength - 32_768);
    assert.equal(limits.maxOutputTokens, 32_768);
    const huge = advertisedModelLimits({ contextLength, maxOutputTokens: 262_144 }, 1_000_000);
    assert.equal(huge.maxInputTokens + huge.maxOutputTokens, contextLength);
    assert.ok(huge.maxInputTokens >= 1);
  }
});

test("every supported fallback has room for conversation and a bounded response", () => {
  for (const id of FALLBACK_MODELS) {
    const metadata = getModelMetadata(id);
    const limits = advertisedModelLimits(metadata);
    assert.ok(limits.maxInputTokens > 32_768, id);
    assert.ok(limits.maxOutputTokens > 0 && limits.maxOutputTokens <= 32_768, id);
    assert.equal(limits.maxInputTokens + limits.maxOutputTokens, metadata.contextLength, id);
  }
});
