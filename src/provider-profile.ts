import { credentialReference } from "./auth/auth";

export function apiKeyFromConfiguration(
  configuration: Readonly<Record<string, unknown>>,
): string | undefined {
  const value = configuration.apiKey;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function credentialRefForApiKey(apiKey: string, legacyApiKey: string | undefined): string {
  return legacyApiKey === apiKey ? "legacy" : `key-${credentialReference(apiKey)}`;
}

export function qualifiedModelId(credentialRef: string, modelId: string): string {
  return credentialRef === "legacy" ? modelId : `${credentialRef}::${modelId}`;
}
