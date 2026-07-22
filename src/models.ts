export const FALLBACK_MODELS = [
  "poolside/laguna-m.1",
  "poolside/laguna-xs-2.1",
  "poolside/laguna-s-2.1",
] as const;

export const MAX_INPUT_TOKENS = 256_000;
export const DEFAULT_MAX_OUTPUT_TOKENS = 32_768;

const PREFERRED_ORDER = new Map<string, number>(
  FALLBACK_MODELS.map((id, index) => [id, index]),
);

export function isPoolsideChatModel(id: string): boolean {
  const value = id.toLowerCase();
  return value.startsWith("poolside/")
    && !/(?:^|[-/])(point|embed(?:ding)?s?|image|video|audio|voice)(?:[-/.]|$)/.test(value);
}

export function orderModels(ids: readonly string[]): string[] {
  return [...new Set(ids)]
    .filter(isPoolsideChatModel)
    .sort((left, right) => {
      const leftRank = PREFERRED_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = PREFERRED_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank || left.localeCompare(right);
    });
}

export function formatModelName(id: string): string {
  return id
    .replace(/^poolside\//i, "")
    .split("-")
    .map((part) => {
      if (/^(xs|s|m)(?:\.|$)/i.test(part)) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}
