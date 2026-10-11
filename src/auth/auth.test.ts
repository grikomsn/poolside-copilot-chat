import assert from "node:assert/strict";
import test from "node:test";
import { Credentials, apiKeyFromConfiguration, credentialReference } from "./auth";

test("extracts a trimmed API key from entry configuration", () => {
  assert.equal(apiKeyFromConfiguration({ apiKey: " synthetic " }), "synthetic");
  assert.throws(() => apiKeyFromConfiguration({}), /Manage Language Models/);
  assert.throws(() => apiKeyFromConfiguration({ apiKey: "   " }), /Manage Language Models/);
  assert.throws(() => apiKeyFromConfiguration({ apiKey: 42 }), /Manage Language Models/);
});

test("credentials register once per distinct key and share fingerprints", () => {
  const credentials = new Credentials();
  const first = credentials.register("synthetic-first");
  const second = credentials.register("synthetic-second");
  const shared = credentials.register(" shared ");
  const sameShared = credentials.register("shared");
  assert.notEqual(first, second);
  assert.equal(shared, sameShared);
  assert.equal(credentials.keyForCredential(shared), "shared");
  assert.match(shared, /^[a-f0-9]{16}$/);
  assert.match(credentialReference("key"), /^[a-f0-9]{16}$/);
});

test("has and keyForCredential resolve only provisioned keys", () => {
  const credentials = new Credentials();
  const ref = credentials.register("synthetic-first");
  assert.equal(credentials.has(ref), true);
  assert.equal(credentials.has("deadbeef"), false);
  assert.equal(credentials.keyForCredential("deadbeef"), undefined);
});

test("activeApiKey prefers the most recently provisioned key", async () => {
  const credentials = new Credentials();
  assert.equal(credentials.activeApiKey(), undefined);
  credentials.register("synthetic-first");
  await new Promise((resolve) => setTimeout(resolve, 5));
  credentials.register("synthetic-second");
  assert.equal(credentials.activeApiKey(), "synthetic-second");
});
