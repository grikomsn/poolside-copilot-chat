import assert from "node:assert/strict";
import test from "node:test";
import { applyReasoningEffort, buildModelConfigurationSchema, contextSizeOptions, resolveReasoningEffort } from "./options";

// VS Code 1.141 reads reasoningEffort, then filters through its agent-host tiers.
const SDK_EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]);

test("Copilot SDK BYOK discovers Poolside's thinking switch alongside Context Window", () => {
  for (const context of [undefined, contextSizeOptions(1_048_576)]) {
    const schema = buildModelConfigurationSchema("max", context);
    const effortSchema = schema.properties.reasoningEffort;
    assert.ok(effortSchema, "BYOK requires reasoningEffort");
    const bridged = (effortSchema.enum as unknown[]).filter((value): value is string => typeof value === "string");
    assert.deepEqual(bridged.filter((effort) => SDK_EFFORTS.has(effort)), ["max", "none"]);
    assert.equal(effortSchema.default, "max");
    assert.equal(buildModelConfigurationSchema("max", context, false).properties.reasoningEffort, undefined);
  }
});

test("Copilot SDK effort selections control Poolside's native enable_thinking field", () => {
  const schema = buildModelConfigurationSchema("max", contextSizeOptions(1_048_576));
  const bridged = (schema.properties.reasoningEffort.enum as unknown[]).filter((value): value is string => typeof value === "string");
  for (const selected of bridged.filter((effort) => SDK_EFFORTS.has(effort))) {
    const effort = resolveReasoningEffort({ reasoningEffort: selected }, selected === "max" ? "none" : "max");
    assert.equal(effort, selected);
    assert.deepEqual(applyReasoningEffort({ model: "poolside/laguna-xs-2.1" }, effort), {
      model: "poolside/laguna-xs-2.1", chat_template_kwargs: { enable_thinking: selected === "max" },
    });
    assert.deepEqual(applyReasoningEffort({ model: "poolside/laguna-s-2.1" }, effort), { model: "poolside/laguna-s-2.1" });
  }
});
