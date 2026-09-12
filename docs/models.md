# Models

The extension discovers hosted-Poolside Laguna models from
`https://inference.poolside.ai/v1/models`. Each model entry carries its own
context window and maximum output length, which are surfaced in the Copilot
Chat model picker.

A bundled fallback snapshot keeps model selection functional when no API key is
configured or during transient catalog failures. Live discovery results remain
authoritative whenever available.

## Models

The hosted catalog currently exposes two Laguna models:

- **`poolside/laguna-s-2.1`** — the larger-context model (1M-token context).
- **`poolside/laguna-xs-2.1`** — the fast, low-latency model (256K-token
  context), used for inline suggestions by default.

See the [Poolside Platform](https://platform.poolside.ai) for the current
catalog.

## Reasoning efforts

Poolside-hosted inference supports two thinking modes: **`max`** (thinking
enabled, the default) and **`none`** (thinking disabled). The Copilot Chat
thinking picker offers exactly these two values. The workspace default
(`poolsideCopilot.reasoningEffort`) applies unless a per-request picker
selection overrides it.

## Context window

Each model entry exposes a **Context Window** control in the Copilot Chat model
picker (`src/models/options.ts`). The options are Auto (the default), fixed 64K,
128K, and 200K tiers that fit below the model's registered input limit, and
Maximum. See [Setup](setup.md) for details.
