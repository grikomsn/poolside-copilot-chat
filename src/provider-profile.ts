import { nativeEntryId } from "./auth/auth";

export function qualifiedModelId(entryId: string, modelId: string): string {
  return `${nativeEntryId({ entryId })}::${modelId}`;
}
