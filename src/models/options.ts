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

export function buildModelConfigurationSchema(
  defaultEffort: ReasoningEffort = DEFAULT_REASONING_EFFORT,
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
