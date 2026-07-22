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
  ]);
  assert.equal(schema.properties.reasoningEffort.default, "minimal");
  assert.equal(schema.properties.reasoningEffort.group, "navigation");
});

test("per-request effort overrides the workspace default", () => {
  assert.equal(resolveReasoningEffort({ reasoningEffort: "low" }, "medium"), "low");
  assert.equal(resolveReasoningEffort(undefined, "xhigh"), "xhigh");
});

test("invalid effort safely falls back to high", () => {
  assert.equal(resolveReasoningEffort({ reasoningEffort: "maximum" }, "minimal"), DEFAULT_REASONING_EFFORT);
  assert.equal(resolveReasoningEffort(undefined, "invalid"), DEFAULT_REASONING_EFFORT);
});

test("applies the documented OpenRouter-style reasoning object", () => {
  assert.deepEqual(applyReasoningEffort({ model: "poolside/laguna-m.1" }, "none"), {
    model: "poolside/laguna-m.1",
    reasoning: { effort: "none" },
  });
  assert.deepEqual(applyReasoningEffort({ model: "poolside/laguna-m.1" }, "xhigh"), {
    model: "poolside/laguna-m.1",
    reasoning: { effort: "xhigh" },
  });
});
