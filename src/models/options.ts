export const REASONING_EFFORTS = [
  "max",
  "none",
] as const;

export type ReasoningEffort = typeof REASONING_EFFORTS[number];

export const DEFAULT_REASONING_EFFORT: ReasoningEffort = "max";

export function resolveReasoningEffort(
  requestConfiguration: Readonly<Record<string, unknown>> | undefined,
  workspaceDefault: unknown,
): ReasoningEffort {
  const requested = stringOption(requestConfiguration, "reasoningEffort")
    ?? stringOption(requestConfiguration, "thinkingEffort")
    ?? (typeof workspaceDefault === "string" ? workspaceDefault : undefined);
  return isReasoningEffort(requested) ? requested : DEFAULT_REASONING_EFFORT;
}

/** A selectable context window tier shown on a model's picker configuration. */
export interface ContextSizeOption {
  /** Context cap in input tokens; 0 selects the model's default handling. */
  readonly value: number;
  /** Short picker label, e.g. "Auto", "128K", or "Maximum". */
  readonly label: string;
  /** Picker description for the tier. */
  readonly description: string;
}

/** Fixed context tiers offered below a model's registered input limit. */
const CONTEXT_SIZE_TIERS: readonly { value: number; label: string }[] = [
  { value: 65_536, label: "64K" },
  { value: 131_072, label: "128K" },
  { value: 200_000, label: "200K" },
];

/** Builds the context window tiers offered for a model's input limit; undefined when no tier fits. */
export function contextSizeOptions(maxInputTokens: number): ContextSizeOption[] | undefined {
  if (!Number.isFinite(maxInputTokens) || maxInputTokens <= CONTEXT_SIZE_TIERS[0].value) return undefined;
  const tiers = CONTEXT_SIZE_TIERS.filter((tier) => tier.value < maxInputTokens);
  if (!tiers.length) return undefined;
  return [
    { value: 0, label: "Auto", description: "Default context handling for this model." },
    ...tiers.map((tier) => ({
      value: tier.value,
      label: tier.label,
      description: `Keep the conversation under ${tier.label} input tokens.`,
    })),
    {
      value: maxInputTokens,
      label: "Maximum",
      description: "Use the model's full available input limit.",
    },
  ];
}

/** Resolves the effective context cap for a request; Auto and Maximum return undefined. */
export function resolveContextCap(contextSize: number, maxInputTokens: number): number | undefined {
  if (!Number.isFinite(contextSize) || contextSize <= 0) return undefined;
  if (!Number.isFinite(maxInputTokens) || maxInputTokens <= 0) return undefined;
  const cap = Math.min(Math.floor(contextSize), maxInputTokens);
  return cap < maxInputTokens ? cap : undefined;
}

/** Reads the opted-in context size from picker configuration; 0 keeps the model's default handling. */
export function resolveContextSize(requestConfiguration: Readonly<Record<string, unknown>> | undefined): number {
  const value = requestConfiguration?.contextSize;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function buildModelConfigurationSchema(
  defaultEffort: ReasoningEffort = DEFAULT_REASONING_EFFORT,
  contextOptions?: readonly ContextSizeOption[],
): {
  type: "object";
  properties: Record<string, Record<string, unknown>>;
} {
  return {
    type: "object",
    properties: {
      reasoningEffort: {
        type: "string",
        title: "Reasoning Effort",
        enum: [...REASONING_EFFORTS],
        enumItemLabels: REASONING_EFFORTS.map(formatEffortLabel),
        enumDescriptions: REASONING_EFFORTS.map(effortDescription),
        default: defaultEffort,
        group: "navigation",
      },
      ...(contextOptions?.length ? {
        contextSize: {
          type: "number",
          title: "Context Window",
          enum: contextOptions.map((option) => option.value),
          enumItemLabels: contextOptions.map((option) => option.label),
          enumDescriptions: contextOptions.map((option) => option.description),
          default: 0,
          group: "navigation",
        },
      } : {}),
    },
  };
}

export function applyReasoningEffort(
  body: Readonly<Record<string, unknown>>,
  effort: ReasoningEffort,
): Record<string, unknown> {
  // Poolside-hosted inference offers `max` and `none`: native thinking is
  // enabled by default for `max` and disabled with this request-level switch.
  return {
    ...body,
    chat_template_kwargs: { enable_thinking: effort === "max" },
  };
}

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === "string" && REASONING_EFFORTS.includes(value as ReasoningEffort);
}

function stringOption(value: Readonly<Record<string, unknown>> | undefined, key: string): string | undefined {
  return typeof value?.[key] === "string" ? value[key] as string : undefined;
}

function formatEffortLabel(value: ReasoningEffort): string {
  return value === "max" ? "Max" : "None";
}

function effortDescription(value: ReasoningEffort): string {
  switch (value) {
    case "max": return "Enable Poolside thinking (default)";
    case "none": return "Disable Poolside thinking";
  }
}
