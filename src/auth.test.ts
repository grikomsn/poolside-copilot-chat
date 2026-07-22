import assert from "node:assert/strict";
import test from "node:test";
import { API_KEY_SECRET, PoolsideAuth, type SecretStore } from "./auth";

class MemorySecrets implements SecretStore {
  readonly values = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    return this.values.get(key);
  }

  async store(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

test("stores trimmed API keys and clears them", async () => {
  const secrets = new MemorySecrets();
  const auth = new PoolsideAuth(secrets);

  assert.equal(await auth.hasApiKey(), false);
  await auth.storeApiKey("  poolside-secret  ");
  assert.equal(secrets.values.get(API_KEY_SECRET), "poolside-secret");
  assert.equal(await auth.getApiKey(), "poolside-secret");
  assert.equal(await auth.hasApiKey(), true);

  await auth.clearApiKey();
  assert.equal(await auth.getApiKey(), undefined);
});

test("rejects empty API keys", async () => {
  const auth = new PoolsideAuth(new MemorySecrets());
  await assert.rejects(() => auth.storeApiKey(" \n "), /cannot be empty/);
});
