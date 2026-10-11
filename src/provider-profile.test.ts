import assert from "node:assert/strict";
import test from "node:test";
import { providerModelId } from "./provider-profile";

test("model ids are the raw hosted ids without entry qualification", () => {
  assert.equal(providerModelId("poolside/laguna-xs-2.1"), "poolside/laguna-xs-2.1");
  assert.equal(providerModelId("model"), "model");
});
