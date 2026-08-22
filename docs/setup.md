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
| `poolsideCopilot.maxOutputTokens` | `0` | Maximum output tokens requested from Poolside; `0` uses the selected model's advertised maximum |
| `poolsideCopilot.requestTimeoutSeconds` | `600` | Inference request timeout in seconds |
| `poolsideCopilot.streamIdleTimeoutSeconds` | `120` | Maximum time without streamed response data before aborting |
| `poolsideCopilot.catalogCacheMinutes` | `5` | How long the hosted-model catalog is reused before refreshing |
| `poolsideCopilot.debugLogging` | `false` | Log request, stream, usage, and model-discovery metadata to the Poolside output channel |

Prompts and API keys are never intentionally written to the output channel.

## Troubleshooting

- **No Poolside models in the picker:** enable **Poolside** under **Manage Models**, then run **Poolside: Refresh Models**.
- **The API key is rejected:** create a fresh key in Poolside Platform and run **Poolside: Configure API Key** again.
- **A request times out:** increase `poolsideCopilot.requestTimeoutSeconds`; agentic coding requests can run longer than ordinary chat.
- **An image is rejected:** hosted Laguna models are text-only. Remove image attachments and retry.
- **Need a diagnostic snapshot:** run **Poolside: Show Diagnostics** and include the report when filing an issue. The report never includes the API key.
