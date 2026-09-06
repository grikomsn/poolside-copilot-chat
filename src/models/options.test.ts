import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_REASONING_EFFORT,
  REASONING_EFFORTS,
  applyReasoningEffort,
  buildModelConfigurationSchema,
  contextSizeOptions,
  resolveContextCap,
  resolveContextSize,
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

test("offers context tiers below the registered input limit", () => {
  assert.deepEqual(contextSizeOptions(1_048_576)?.map((option) => option.value), [0, 65_536, 131_072, 200_000, 1_048_576]);
  assert.deepEqual(contextSizeOptions(1_048_576)?.map((option) => option.label), ["Auto", "64K", "128K", "200K", "Maximum"]);
  assert.equal(contextSizeOptions(65_536), undefined);
  assert.equal(contextSizeOptions(32_000), undefined);
});

test("resolves the effective context cap from the selected tier", () => {
  assert.equal(resolveContextCap(131_072, 1_048_576), 131_072);
  assert.equal(resolveContextCap(1_500_000, 1_048_576), undefined);
  assert.equal(resolveContextCap(0, 1_048_576), undefined);
  assert.equal(resolveContextCap(65_536, 65_536), undefined);
});

test("reads the context size from picker configuration", () => {
  assert.equal(resolveContextSize({ contextSize: 131_072 }), 131_072);
  assert.equal(resolveContextSize({ contextSize: 0 }), 0);
  assert.equal(resolveContextSize({ contextSize: "131072" }), 0);
  assert.equal(resolveContextSize(undefined), 0);
});

test("exposes the Context Window control alongside thinking modes", () => {
  const schema = buildModelConfigurationSchema("max", contextSizeOptions(1_048_576));
  assert.deepEqual(schema.properties.reasoningEffort.enum, REASONING_EFFORTS);
  assert.deepEqual(schema.properties.contextSize.enum, [0, 65_536, 131_072, 200_000, 1_048_576]);
  assert.equal(schema.properties.contextSize.default, 0);
  assert.equal(schema.properties.contextSize.group, "navigation");

  const plain = buildModelConfigurationSchema("max");
  assert.equal("contextSize" in plain.properties, false);
});
