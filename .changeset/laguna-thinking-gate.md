---
"poolside-copilot-chat": patch
---

Gate the Reasoning Effort picker to thinking-capable Laguna models

Live probes (2026-10-09) measured reasoning behavior per Laguna model via `completion_tokens_details.reasoning_tokens`:

- `poolside/laguna-xs-2.1` thinks by default (reasoning tokens present) and genuinely disables with `enable_thinking: false`
- `poolside/laguna-s-2.1` never emits reasoning tokens on **any** setting — its Max/None toggle was a no-op

`laguna-s-2.1` (and any future non-thinking model) now shows no Reasoning Effort control, and its requests carry no `chat_template_kwargs` field at all. The inline-suggestions path is unchanged: it already had its own measured per-model thinking-field policy.
