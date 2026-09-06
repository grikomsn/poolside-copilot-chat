/**
 * Prompt construction for the Poolside chat-completions completion engine.
 *
 * Poolside exposes no FIM endpoint, so fill-in-the-middle is emulated with
 * FIM delimiter tokens inline in a single user message over the fixed
 * `/chat/completions` endpoint. Thinking-off handling follows the live
 * benchmark (2026-09-06): `laguna-xs-2.1` completes fastest and correctly with
 * no thinking field at all — sending `chat_template_kwargs.enable_thinking`
 * there perturbs output quality — while `laguna-s-2.1` measured clean with the
 * request-level thinking switch. Unknown models send no field, mirroring xs.
 *
 * Pure and unit-tested.
 */

export interface CompletionPrompt {
  readonly messages: ReadonlyArray<{ role: string; content: string }>;
  /** Extra body fields required by the selected model (e.g. thinking switch). */
  readonly extra: Readonly<Record<string, unknown>>;
}

export const COMPLETION_SYSTEM_PROMPT = "Return only the missing code at the cursor. No explanations, no markdown.";

const FIM = { prefix: "<|fim_prefix|>", suffix: "<|fim_suffix|>", middle: "<|fim_middle|>" } as const;

/** Whether a model id measured clean with the explicit thinking-off switch. */
export function wantsThinkingSwitch(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return /laguna-s-\d/.test(id);
}

export function buildCompletionPrompt(prefix: string, suffix: string, modelId: string): CompletionPrompt {
  const extra: Record<string, unknown> = {};
  if (wantsThinkingSwitch(modelId)) {
    // Poolside's request-level thinking switch; measured correct on laguna-s.
    extra.chat_template_kwargs = { enable_thinking: false };
  }
  return {
    messages: [
      { role: "system", content: COMPLETION_SYSTEM_PROMPT },
      { role: "user", content: `${FIM.prefix}${prefix}${FIM.suffix}${suffix}${FIM.middle}` },
    ],
    extra,
  };
}

/**
 * Remove special-token artifacts from a suggestion. Models occasionally echo
 * the injected FIM delimiters (`<|fim_prefix|>`…) or tokenizer specials such
 * as `<|file_separator|>` into their visible stream; ghost text must never
 * show them. Only token-shaped `<|word|>` strings are removed, so shell- or
 * OCaml-style `<|` operators without a matching `|>` pair survive untouched.
 * Pure and unit-tested.
 */
const SPECIAL_TOKEN_PATTERN = /<\|[A-Za-z0-9_.-]{1,48}\|>/g;

export function stripSpecialTokens(text: string): string {
  return text.replace(SPECIAL_TOKEN_PATTERN, "");
}
