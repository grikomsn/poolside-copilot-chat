---
"poolside-copilot-chat": patch
---

Align the bundled Laguna fallback metadata with the live hosted catalog, verified on 2026-09-28: both `poolside/laguna-s-2.1` and `poolside/laguna-xs-2.1` serve a 256K-token context and 32K max completion tokens, so the picker's offline metadata no longer overstates a 1M context or 262K output. Live discovery remains authoritative whenever available.