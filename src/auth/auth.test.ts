import assert from "node:assert/strict";
import test from "node:test";
import { NativeEntries, nativeEntryId, credentialReference } from "./auth";

test("requires distinct explicit IDs without normalizing display names", () => {
  assert.equal(nativeEntryId({ entryId: "work.a", name: "A B" }), "work.a");
  assert.equal(nativeEntryId({ entryId: "work-b", name: "A-B" }), "work-b");
  for (const entryId of [undefined, "A B", "A-B", "", "x".repeat(65)]) assert.throws(() => nativeEntryId({ entryId }));
});

test("rotation revokes old handles including rotation back to the same key", () => {
  const entries = new NativeEntries();
  const first = entries.register({ entryId: "work", apiKey: "synthetic-first" });
  entries.register({ entryId: "personal", apiKey: "synthetic-personal" });
  const rotated = entries.register({ entryId: "work", apiKey: "synthetic-rotated" });
  assert.equal(first.entryId, rotated.entryId);
  assert.notEqual(first.credentialRef, rotated.credentialRef);
  assert.equal(entries.matches(first.entryId, first.credentialRef, first.generation), false);
  assert.equal(entries.keyForCredential(first.credentialRef), undefined);
  assert.equal(entries.keyForEntry("work"), "synthetic-rotated");
  assert.equal(entries.keyForEntry("personal"), "synthetic-personal");
  const restored = entries.register({ entryId: "work", apiKey: "synthetic-first" });
  assert.equal(restored.credentialRef, first.credentialRef);
  assert.equal(entries.matches(first.entryId, first.credentialRef, first.generation), false);
  assert.equal(entries.matches(restored.entryId, restored.credentialRef, restored.generation), true);
});

test("missing configured keys revoke the entry instead of reusing a cached key", () => {
  const entries = new NativeEntries();
  const first = entries.register({ entryId: "work", apiKey: "synthetic-first" });
  assert.throws(() => entries.register({ entryId: "work", apiKey: "" }));
  assert.equal(entries.matches(first.entryId, first.credentialRef, first.generation), false);
  assert.equal(entries.keyForEntry("work"), undefined);
  assert.equal(entries.keyForEntry("missing"), undefined);
});

test("shared credentials survive one removal and expire after the last removal", async () => {
  const entries = new NativeEntries();
  const first = entries.register({ entryId: "first", apiKey: " shared " });
  const second = entries.register({ entryId: "second", apiKey: "shared" });
  assert.equal(first.credentialRef, second.credentialRef);
  await entries.forget("first");
  assert.equal(entries.keyForCredential(first.credentialRef), "shared");
  assert.equal(entries.matches(first.entryId, first.credentialRef, first.generation), false);
  assert.equal(entries.matches(second.entryId, second.credentialRef, second.generation), true);
  await entries.forget("second");
  assert.equal(entries.keyForCredential(first.credentialRef), undefined);
  assert.deepEqual(entries.list(), []);
  assert.equal(new NativeEntries().keyForEntry("second"), undefined);
  assert.match(credentialReference("key"), /^[a-f0-9]{16}$/);
});

test("forgotten IDs stay revoked through rediscovery and restart until explicitly restored", async () => {
  const values = new Map<string, unknown>();
  const state = { get: <T>(key: string): T | undefined => values.get(key) as T | undefined,
    update: async (key: string, ids: readonly string[]): Promise<void> => { values.set(key, [...ids]); } };
  const entries = new NativeEntries(state);
  entries.register({ entryId: "work", apiKey: "synthetic-work" });
  await entries.forget("work");
  assert.throws(() => entries.register({ entryId: "work", apiKey: "synthetic-work" }), /forgotten/);
  assert.equal(entries.keyForEntry("work"), undefined);
  const restarted = new NativeEntries(state);
  assert.deepEqual(restarted.listForgotten(), ["work"]);
  assert.throws(() => restarted.register({ entryId: "work", apiKey: "synthetic-work" }), /forgotten/);
  await restarted.restore("work");
  assert.equal(restarted.keyForEntry("work"), undefined);
  const fresh = restarted.register({ entryId: "work", apiKey: "synthetic-work" });
  assert.equal(restarted.matches(fresh.entryId, fresh.credentialRef, fresh.generation), true);
  assert.deepEqual(new NativeEntries(state).listForgotten(), []);
  assert.deepEqual([...values.values()], [[]], "Only alias tombstones are persisted");
});

test("concurrent forget operations serialize alias-only persistence", async () => {
  let saved: readonly string[] = [];
  const entries = new NativeEntries({ get: () => undefined,
    update: async (_key, ids) => { await Promise.resolve(); saved = [...ids]; } });
  await Promise.all([entries.forget("work"), entries.forget("personal")]);
  assert.deepEqual(saved, ["personal", "work"]);
});
