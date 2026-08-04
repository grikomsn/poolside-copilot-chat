export const REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type ReasoningEffort = typeof REASONING_EFFORTS[number];

export const DEFAULT_REASONING_EFFORT: ReasoningEffort = "high";

export function resolveReasoningEffort(
  requestConfiguration: Readonly<Record<string, unknown>> | undefined,
  workspaceDefault: unknown,
): ReasoningEffort {
  const requested = stringOption(requestConfiguration, "reasoningEffort")
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
  // The Poolside Platform API controls thinking via chat_template_kwargs.enable_thinking
  // (a boolean on/off). The OpenRouter-style reasoning.effort field is also included so
  // the same request body works with OpenRouter-compatible providers that accept it.
  //   "none" disables thinking on the Poolside Platform (enable_thinking=false) and
  //           requests no reasoning on OpenRouter (effort="none").
  //   All other values leave thinking enabled by default (the Poolide Platform default)
  //   and pass the fine-grained effort to OpenRouter-style providers.
  const result: Record<string, unknown> = { ...body, reasoning: { effort } };
  if (effort === "none") {
    result.chat_template_kwargs = { enable_thinking: false };
  }
  return result;
}

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === "string" && REASONING_EFFORTS.includes(value as ReasoningEffort);
}

function stringOption(value: Readonly<Record<string, unknown>> | undefined, key: string): string | undefined {
  return typeof value?.[key] === "string" ? value[key] as string : undefined;
}

function formatEffortLabel(value: ReasoningEffort): string {
  if (value === "xhigh") return "Extra High";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function effortDescription(value: ReasoningEffort): string {
  switch (value) {
    case "none": return "Disable reasoning and thinking";
    case "minimal": return "Use the smallest available reasoning budget";
    case "low": return "Faster responses with lighter reasoning";
    case "medium": return "Balance response speed and reasoning depth";
    case "high": return "Use deeper reasoning for complex coding tasks";
    case "xhigh": return "Use a very high reasoning effort";
    case "max": return "Use the highest available reasoning effort";
  }
}
