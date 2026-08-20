import assert from "node:assert/strict";
import test from "node:test";
import { apiKeyFromConfiguration, credentialRefForApiKey, qualifiedModelId } from "./provider-profile";

test("normalizes native provider-entry API keys without exposing them", () => {
  assert.equal(apiKeyFromConfiguration({ apiKey: "  poolside-secret  " }), "poolside-secret");
  assert.equal(apiKeyFromConfiguration({ apiKey: "" }), undefined);
  assert.equal(apiKeyFromConfiguration({}), undefined);
});

test("keeps legacy and native provider-entry model IDs distinct", () => {
  assert.equal(credentialRefForApiKey("legacy-key", "legacy-key"), "legacy");
  const reference = credentialRefForApiKey("entry-key", "legacy-key");
  assert.match(reference, /^key-[a-f0-9]{16}$/);
  assert.equal(qualifiedModelId("legacy", "poolside/laguna-xs-2.1"), "poolside/laguna-xs-2.1");
  assert.equal(qualifiedModelId(reference, "poolside/laguna-xs-2.1"), `${reference}::poolside/laguna-xs-2.1`);
});
