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

/** Secrets are supplied by VS Code during provisioning and stay in memory here. */
export class NativeEntries {
  private readonly entries = new Map<string, string>();
  private readonly keys = new Map<string, string>();
  private readonly generations = new Map<string, number>();

  register(configuration: Readonly<Record<string, unknown>>): { entryId: string; credentialRef: string; generation: number } {
    const entryId = nativeEntryId(configuration);
    const apiKey = typeof configuration.apiKey === "string" ? configuration.apiKey.trim() : "";
    if (!apiKey) {
      this.forget(entryId);
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

  forget(entryId: string): void {
    const ref = this.entries.get(entryId);
    this.entries.delete(entryId);
    this.generations.set(entryId, (this.generations.get(entryId) ?? 0) + 1);
    if (ref) this.prune(ref);
  }

  private prune(credentialRef: string): void {
    if (![...this.entries.values()].includes(credentialRef)) this.keys.delete(credentialRef);
  }
}
