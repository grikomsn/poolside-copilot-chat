export const API_KEY_SECRET = "poolsideCopilot.apiKey";

export interface SecretStore {
  get(key: string): PromiseLike<string | undefined>;
  store(key: string, value: string): PromiseLike<void>;
  delete(key: string): PromiseLike<void>;
}

export class PoolsideAuth {
  constructor(private readonly secrets: SecretStore) {}

  async hasApiKey(): Promise<boolean> {
    return Boolean(await this.getApiKey());
  }

  async getApiKey(): Promise<string | undefined> {
    const value = await this.secrets.get(API_KEY_SECRET);
    return value?.trim() || undefined;
  }

  async storeApiKey(value: string): Promise<void> {
    const apiKey = value.trim();
    if (!apiKey) throw new Error("Poolside API key cannot be empty");
    await this.secrets.store(API_KEY_SECRET, apiKey);
  }

  async clearApiKey(): Promise<void> {
    await this.secrets.delete(API_KEY_SECRET);
  }
}
