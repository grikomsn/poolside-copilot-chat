import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_REASONING_EFFORT,
  REASONING_EFFORTS,
  applyReasoningEffort,
  buildModelConfigurationSchema,
  resolveReasoningEffort,
} from "./model-options";

test("exposes every Poolside reasoning effort in a native model-picker control", () => {
  const schema = buildModelConfigurationSchema("minimal");
  assert.deepEqual(schema.properties.reasoningEffort.enum, REASONING_EFFORTS);
  assert.deepEqual(schema.properties.reasoningEffort.enumItemLabels, [
    "None",
    "Minimal",
    "Low",
    "Medium",
    "High",
    "Extra High",
    "Max",
  ]);
  assert.equal(schema.properties.reasoningEffort.default, "minimal");
  assert.equal(schema.properties.reasoningEffort.group, "navigation");
});

test("per-request effort overrides the workspace default", () => {
  assert.equal(resolveReasoningEffort({ reasoningEffort: "low" }, "medium"), "low");
  assert.equal(resolveReasoningEffort(undefined, "xhigh"), "xhigh");
  assert.equal(resolveReasoningEffort({ reasoningEffort: "max" }, "high"), "max");
});

test("invalid effort safely falls back to high", () => {
  assert.equal(resolveReasoningEffort({ reasoningEffort: "maximum" }, "minimal"), DEFAULT_REASONING_EFFORT);
  assert.equal(resolveReasoningEffort(undefined, "invalid"), DEFAULT_REASONING_EFFORT);
});

test("applies OpenRouter-style reasoning with Poolside thinking toggle", () => {
  // "none" disables thinking on the Poolside Platform and sends no reasoning on OpenRouter
  assert.deepEqual(applyReasoningEffort({ model: "poolside/laguna-m.1" }, "none"), {
    model: "poolside/laguna-m.1",
    reasoning: { effort: "none" },
    chat_template_kwargs: { enable_thinking: false },
  });
  // Non-"none" levels keep thinking enabled by default and forward the effort value
  assert.deepEqual(applyReasoningEffort({ model: "poolside/laguna-m.1" }, "xhigh"), {
    model: "poolside/laguna-m.1",
    reasoning: { effort: "xhigh" },
  });
  assert.deepEqual(applyReasoningEffort({ model: "poolside/laguna-m.1" }, "max"), {
    model: "poolside/laguna-m.1",
    reasoning: { effort: "max" },
  });
});
