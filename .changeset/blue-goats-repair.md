---
"poolside-copilot-chat": patch
---

Fix Auto context size being interpreted as zero input tokens by VS Code, collapsing the context indicator to the output reserve and triggering premature compaction.

Reserve the default 32K response budget for Poolside instead of subtracting its entire 262K output capability, which left Laguna M and XS with one input token.
