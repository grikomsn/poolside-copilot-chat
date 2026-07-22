import assert from "node:assert/strict";
import test from "node:test";
import { FALLBACK_MODELS, formatModelName, isPoolsideChatModel, orderModels } from "./models";

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
