import assert from "node:assert/strict";
import test from "node:test";
import { qualifiedModelId } from "./provider-profile";
import { NativeEntries } from "./auth/auth";

test("entry model IDs stay stable across key rotation and separate equal display names", () => {
  const entries = new NativeEntries();
  const first = entries.register({ entryId: "work", name: "Same name", apiKey: "synthetic-first" });
  const personal = entries.register({ entryId: "personal", name: "Same name", apiKey: "synthetic-personal" });
  const rotated = entries.register({ entryId: "work", name: "Renamed", apiKey: "synthetic-rotated" });
  assert.equal(qualifiedModelId(first.entryId, "model"), qualifiedModelId(rotated.entryId, "model"));
  assert.notEqual(qualifiedModelId(first.entryId, "model"), qualifiedModelId(personal.entryId, "model"));
  assert.throws(() => qualifiedModelId("", "model"));
});
