---
"poolside-copilot-chat": minor
---

Add experimental, opt-in inline code suggestions (ghost text) powered by Poolside-hosted Laguna models. Enable with `poolsideCopilot.inlineSuggestions` and choose the model (`inlineSuggestionsModel`, default `poolside/laguna-xs-2.1`; live-measured 396ms TTFB with zero hidden reasoning and no thinking field, while `laguna-s-2.1` receives the request-level thinking-off switch). A new **Poolside: Set Inline Suggestions Model** command (also in the Manage menu) lists compatible models with measured badges; a custom model id remains enterable. Debounce, timeout, token budget, and context windows are configurable. The Copilot Chat prompt box is excluded unless separately enabled, and document context is never logged.
