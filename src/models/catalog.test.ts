import assert from "node:assert/strict";
import test from "node:test";
import {
  FALLBACK_MODELS,
  formatModelName,
  formatTokenLimit,
  getModelMetadata,
  isPoolsideChatModel,
  orderModelMetadata,
  orderModels,
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
    FALLBACK_MODELS[0],
    FALLBACK_MODELS[2],
    "poolside/future-chat",
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
    maxOutputTokens: 32_768,
  });
  assert.deepEqual(getModelMetadata("poolside/laguna-s-2.1"), {
    id: "poolside/laguna-s-2.1",
    version: "2.1",
    contextLength: 1_048_576,
    maxOutputTokens: 131_072,
  });
  assert.equal(formatTokenLimit(1_048_576), "1M");
  assert.equal(formatTokenLimit(262_144), "256K");
});

test("prefers upstream model limits while retaining fallback metadata", () => {
  assert.deepEqual(orderModelMetadata([
    { id: "poolside/laguna-s-2.1", context_length: 262_144, max_completion_tokens: 65_536 },
    { id: "poolside/laguna-xs-2.1", context_length: 262_144 },
    { id: "poolside/image-model", context_length: 1_000_000 },
    { id: "poolside/laguna-xs-2.1", context_length: 1_000_000 },
  ]), [
    {
      id: "poolside/laguna-xs-2.1",
      version: "2.1",
      contextLength: 262_144,
      maxOutputTokens: 32_768,
    },
    {
      id: "poolside/laguna-s-2.1",
      version: "2.1",
      contextLength: 262_144,
      maxOutputTokens: 65_536,
    },
  ]);
});
