---
"poolside-copilot-chat": minor
---

Add `max` to the reasoning-effort options in the Copilot model picker and workspace settings. The `max` value requests the highest available reasoning budget and matches Laguna S 2.1's supported thinking modes (off/max). When reasoning effort is set to `none`, the request body now also includes `chat_template_kwargs.enable_thinking` set to `false`, which is the Poolside Platform API's native mechanism for disabling thinking. The OpenRouter-style `reasoning: { effort }` field is still sent for OpenRouter-compatible providers. The `xhigh` description is updated from "highest" to "very high" to reflect `max` as the top level.
