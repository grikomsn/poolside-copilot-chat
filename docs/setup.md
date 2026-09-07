# Setup and usage

## Requirements

- Visual Studio Code 1.125 or newer
- GitHub Copilot Chat installed and signed in
- A Poolside Platform developer API key

A paid Copilot plan is not required for a bring-your-own-key language model provider.

## Install and connect

1. Install the extension from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=grikomsn.poolside-copilot-chat).
2. Create a key in [Poolside Platform](https://platform.poolside.ai/).
3. In Copilot Chat, open the model picker, select **Manage Models**, add a **Poolside** provider entry, and enter the key.
4. Select an available Laguna model.

To use another Poolside account or API key, add another **Poolside** provider entry in **Manage Language Models**. API keys supplied to provider entries are managed by VS Code and are isolated from one another; the legacy **Poolside: Configure API Key** command remains available for command-driven workflows.

Provider-entry model discovery uses `https://inference.poolside.ai/v1/models`, so models added to or removed from your Poolside account are reflected automatically. The legacy **Poolside: Configure API Key** command validates the key with the same endpoint before saving it.

## Commands

| Command | Purpose |
| --- | --- |
| **Poolside: Manage Connection** | Test, refresh, replace or remove the key, show logs, or open diagnostics |
| **Poolside: Configure API Key** | Validate and securely save a Poolside Platform API key |
| **Poolside: Remove API Key** | Delete the key from VS Code Secret Storage |
| **Poolside: Refresh Models** | Fetch the current hosted-model list |
| **Poolside: Test Inference** | Send a small live inference request |
| **Poolside: Open API Keys** | Open Poolside Platform |
| **Poolside: Show Diagnostics** | Show the VS Code version, endpoint, credential state, and registered models |

## Settings

| Setting | Default | Purpose |
| --- | ---: | --- |
| `poolsideCopilot.reasoningEffort` | `max` | Default Poolside thinking mode (`max` or `none`); a Copilot model-picker selection overrides it |
| `poolsideCopilot.maxOutputTokens` | `0` | Maximum output tokens requested from Poolside; `0` reserves 32,768 output tokens; positive values are capped by the model output capability and context window |
| `poolsideCopilot.requestTimeoutSeconds` | `600` | Inference request timeout in seconds |
| `poolsideCopilot.streamIdleTimeoutSeconds` | `120` | Maximum time without streamed response data before aborting |
| `poolsideCopilot.catalogCacheMinutes` | `5` | How long the hosted-model catalog is reused before refreshing |
| `poolsideCopilot.debugLogging` | `false` | Log request, stream, usage, and model-discovery metadata to the Poolside output channel |
| `poolsideCopilot.inlineSuggestions` | `false` | Experimental ghost-text inline completions while typing |
| `poolsideCopilot.inlineSuggestionsModel` | `poolside/laguna-xs-2.1` | Model used for inline completions; `laguna-s-2.1` is an alternate |
| `poolsideCopilot.inlineSuggestionsChatInput` | `false` | Also offer suggestions inside the Copilot Chat prompt box |
| `poolsideCopilot.inlineSuggestionsDebounceMs` | `300` | Debounce between typing and a completion request |
| `poolsideCopilot.inlineSuggestionsTimeoutMs` | `3000` | Per-request completion timeout |
| `poolsideCopilot.inlineSuggestionsMaxTokens` | `128` | Tokens generated per suggestion |
| `poolsideCopilot.inlineSuggestionsPrefixLines` | `10` | Document lines sent before the cursor |
| `poolsideCopilot.inlineSuggestionsSuffixChars` | `300` | Document characters sent after the cursor |

Prompts and API keys are never intentionally written to the output channel.

## Inline suggestions

Inline code suggestions are experimental and off by default. When enabled, each suggestion sends a bounded fill-in-the-middle prompt (10 lines before the cursor, 300 characters after, both configurable) with FIM delimiter tokens to the fixed `/chat/completions` endpoint. Following the live benchmark, `laguna-xs-2.1` is requested with no thinking field (396ms TTFB, zero hidden reasoning — sending the thinking switch there perturbs output), while `laguna-s-2.1` receives `chat_template_kwargs.enable_thinking: false`. Hidden reasoning deltas are discarded engine-side, and the Copilot Chat prompt box is excluded unless `poolsideCopilot.inlineSuggestionsChatInput` is enabled. Note that `poolside/laguna-m.1` no longer exists upstream (`/v1/models` lists only xs and s); use one of those two.

**Poolside: Set Inline Suggestions Model** (also in the Manage menu) lists the compatible Laguna models with measured badges. A "Use a custom model id…" entry keeps any Poolside model id reachable. The command only writes settings, so changes apply on the next keystroke without a reload.

## Troubleshooting

- **No Poolside models in the picker:** enable **Poolside** under **Manage Models**, then run **Poolside: Refresh Models**.
- **The API key is rejected:** create a fresh key in Poolside Platform and run **Poolside: Configure API Key** again.
- **A request times out:** increase `poolsideCopilot.requestTimeoutSeconds`; agentic coding requests can run longer than ordinary chat.
- **An image is rejected:** hosted Laguna models are text-only. Remove image attachments and retry.
- **Need a diagnostic snapshot:** run **Poolside: Show Diagnostics** and include the report when filing an issue. The report never includes the API key.

## Context window size

Each model entry exposes a Context Window control in the Copilot Chat model
picker (`src/models/options.ts`). The options are Auto (the default), fixed
64K, 128K, and 200K tiers that fit below the model's registered input limit,
and Maximum. Auto and Maximum keep the default behavior.

A specific tier acts as a local upper limit: the selection is stored per model
by VS Code, never exceeds the model's registered input limit, and when the
converted messages exceed the selected tier the oldest conversation turns are
trimmed before the request is built (`src/provider/history-trim.ts`). The
first message, the current turn, and tool-call/result adjacency are always
preserved, and models without a fitting tier keep their picker unchanged.

### Context indicator compatibility

Auto uses the model's registered input budget. The context indicator shows that
input budget plus the response reserve; a numeric context tier replaces only
the input budget. Auto is stored as `"auto"`, because VS Code interprets numeric
zero as a zero-token input window. If an existing chat still shows only the
output limit after upgrading, select Auto again in its Context Window control
to replace a saved zero selection.

Context Window uses the dedicated tokens group so it remains visible beside
reasoning controls. VS Code renders only one enum property per group.
