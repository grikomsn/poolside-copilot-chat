import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_REASONING_EFFORT,
  REASONING_EFFORTS,
  applyReasoningEffort,
  buildModelConfigurationSchema,
  resolveReasoningEffort,
} from "./options";

test("exposes Poolside-hosted thinking modes in a native model-picker control", () => {
  const schema = buildModelConfigurationSchema("max");
  assert.deepEqual(schema.properties.reasoningEffort.enum, REASONING_EFFORTS);
  assert.deepEqual(schema.properties.reasoningEffort.enumItemLabels, ["Max", "None"]);
  assert.equal(schema.properties.reasoningEffort.default, "max");
  assert.equal(schema.properties.reasoningEffort.group, "navigation");
});

test("per-request effort overrides the workspace default", () => {
  assert.equal(resolveReasoningEffort({ reasoningEffort: "none" }, "max"), "none");
  assert.equal(resolveReasoningEffort({ thinkingEffort: "none" }, "max"), "none");
  assert.equal(resolveReasoningEffort(undefined, "none"), "none");
  assert.equal(resolveReasoningEffort({ reasoningEffort: "max" }, "none"), "max");
});

test("unsupported effort safely falls back to max", () => {
  assert.equal(resolveReasoningEffort({ reasoningEffort: "high" }, "none"), DEFAULT_REASONING_EFFORT);
  assert.equal(resolveReasoningEffort(undefined, "invalid"), DEFAULT_REASONING_EFFORT);
});

test("applies Poolside's native thinking toggle", () => {
  assert.deepEqual(applyReasoningEffort({ model: "poolside/laguna-m.1" }, "none"), {
    model: "poolside/laguna-m.1",
    chat_template_kwargs: { enable_thinking: false },
  });
  assert.deepEqual(applyReasoningEffort({ model: "poolside/laguna-m.1" }, "max"), {
    model: "poolside/laguna-m.1",
    chat_template_kwargs: { enable_thinking: true },
  });
});
