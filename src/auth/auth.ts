import { createHash } from "node:crypto";

export function credentialReference(apiKey: string): string {
  return createHash("sha256").update(apiKey.trim()).digest("hex").slice(0, 16);
}

export function nativeEntryId(configuration: Readonly<Record<string, unknown>>): string {
  const value = configuration.entryId;
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(value)) {
    throw new Error("Set a unique entryId in Manage Language Models: 1-64 lowercase letters, numbers, dots, underscores, or hyphens");
  }
  return value;
}

export interface EntryState {
  get<T>(key: string): T | undefined;
  update(key: string, value: readonly string[]): PromiseLike<void>;
}

const FORGOTTEN_ENTRIES_KEY = "poolsideCopilot.forgottenEntries.v1";

/** Secrets are supplied by VS Code during provisioning and stay in memory here. */
export class NativeEntries {
  private readonly entries = new Map<string, string>();
  private readonly keys = new Map<string, string>();
  private readonly generations = new Map<string, number>();
  private readonly forgotten = new Set<string>();
  private stateMutation: Promise<void> = Promise.resolve();

  constructor(private readonly state?: EntryState) {
    const saved = state?.get<unknown>(FORGOTTEN_ENTRIES_KEY);
    if (!Array.isArray(saved)) return;
    for (const value of saved) {
      if (typeof value === "string" && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(value)) this.forgotten.add(value);
    }
  }

  register(configuration: Readonly<Record<string, unknown>>): { entryId: string; credentialRef: string; generation: number } {
    const entryId = nativeEntryId(configuration);
    if (this.forgotten.has(entryId)) {
      throw new Error("This entry was forgotten. Use Restore Forgotten Entry in Manage Connection before loading it again.");
    }
    const apiKey = typeof configuration.apiKey === "string" ? configuration.apiKey.trim() : "";
    if (!apiKey) {
      this.revoke(entryId);
      throw new Error("Set the API key for this entry in Manage Language Models");
    }
    const previous = this.entries.get(entryId);
    const credentialRef = credentialReference(apiKey);
    const generation = previous === credentialRef
      ? this.generations.get(entryId) ?? 0
      : (this.generations.get(entryId) ?? 0) + 1;
    this.generations.set(entryId, generation);
    this.entries.set(entryId, credentialRef);
    this.keys.set(credentialRef, apiKey);
    if (previous && previous !== credentialRef) this.prune(previous);
    return { entryId, credentialRef, generation };
  }

  list(): Array<{ entryId: string; credentialRef: string }> {
    return [...this.entries].map(([entryId, credentialRef]) => ({ entryId, credentialRef }));
  }

  matches(entryId: string, credentialRef: string, generation: number): boolean {
    return this.entries.get(entryId) === credentialRef && this.generations.get(entryId) === generation;
  }

  keyForCredential(credentialRef: string): string | undefined { return this.keys.get(credentialRef); }

  keyForEntry(entryId: string): string | undefined {
    const ref = this.entries.get(nativeEntryId({ entryId }));
    return ref ? this.keys.get(ref) : undefined;
  }

  listForgotten(): string[] { return [...this.forgotten].sort(); }

  async forget(entryId: string): Promise<void> {
    nativeEntryId({ entryId });
    this.forgotten.add(entryId);
    this.revoke(entryId);
    await this.persistForgotten();
  }

  async restore(entryId: string): Promise<void> {
    nativeEntryId({ entryId });
    this.forgotten.delete(entryId);
    // Restoration allows fresh provisioning; it does not recover any cached key.
    await this.persistForgotten();
  }

  private persistForgotten(): Promise<void> {
    const ids = this.listForgotten();
    this.stateMutation = this.stateMutation.catch(() => {}).then(async () => {
      await this.state?.update(FORGOTTEN_ENTRIES_KEY, ids);
    });
    return this.stateMutation;
  }

  private revoke(entryId: string): void {
    const ref = this.entries.get(entryId);
    this.entries.delete(entryId);
    this.generations.set(entryId, (this.generations.get(entryId) ?? 0) + 1);
    if (ref) this.prune(ref);
  }

  private prune(credentialRef: string): void {
    if (![...this.entries.values()].includes(credentialRef)) this.keys.delete(credentialRef);
  }
}
