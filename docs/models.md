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

- **`poolside/laguna-s-2.1`** — the capable reasoning model (256K-token
  context as served by the hosted API).
- **`poolside/laguna-xs-2.1`** — the fast, low-latency model (256K-token
  context), used for inline suggestions by default.

Both models advertise 32K max completion tokens in the hosted catalog.

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

## Copilot SDK sessions

The **Copilot** session runtime uses a separate model-discovery path from
ordinary **Local** chat. Its BYOK bridge discovers effort options specifically
from `configurationSchema.properties.reasoningEffort`. Keep that property
separate from Context Window and other controls, with the model's supported
values and a default from that list.

In VS Code 1.141, the SDK picker further restricts efforts to `none`, `minimal`,
`low`, `medium`, `high`, `xhigh`, `max`, and `ultra`. Each model exposes only the
intersection with its own supported list. The extension continues translating
selected efforts to the provider's native request fields.

Poolside's `max` and `none` choices both survive the SDK filter and map to
its native thinking toggle. Models without a supported thinking switch retain
no effort control. Use Local chat for the extension's Context Window control;
the SDK picker does not expose it.

After installing an extension update, restart VS Code or reload every open
window so the shared BYOK bridge receives fresh model metadata.

References: [VS Code BYOK discovery](https://github.com/microsoft/vscode/blob/2a59476c9bfcb90b3ddc372c36762471b7dfad1c/src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostByokLmHandler.ts),
[SDK Thinking Level filtering](https://github.com/microsoft/vscode/blob/2a59476c9bfcb90b3ddc372c36762471b7dfad1c/src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L2757),
and [accepted agent-host effort tiers](https://github.com/microsoft/vscode/blob/2a59476c9bfcb90b3ddc372c36762471b7dfad1c/src/vs/platform/agentHost/common/reasoningEffort.ts).
