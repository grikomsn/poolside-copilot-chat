# Setup and usage

## Requirements

- Visual Studio Code 1.125 or newer
- GitHub Copilot Chat installed and signed in
- A Poolside Platform developer API key

A paid Copilot plan is not required for a bring-your-own-key language model provider.

## Install and connect

1. Install the extension from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=grikomsn.poolside-copilot-chat).
2. Create a key in [Poolside Platform](https://platform.poolside.ai/).
3. Run **Poolside: Configure API Key** from the Command Palette and paste the key.
4. In Copilot Chat, open the model picker, select **Manage Models**, and enable **Poolside**.
5. Select an available Laguna model.

The extension validates the key with `https://inference.poolside.ai/v1/models` before saving it. The model list is refreshed from the same API, so models added to or removed from your Poolside account are reflected automatically.

## Commands

| Command | Purpose |
| --- | --- |
| **Poolside: Manage Connection** | Test, refresh, replace or remove the key, show logs, or open diagnostics |
| **Poolside: Configure API Key** | Validate and securely save a Poolside Platform API key |
| **Poolside: Remove API Key** | Delete the key from VS Code Secret Storage |
| **Poolside: Refresh Models** | Fetch the current hosted-model list |
| **Poolside: Test Connection** | Send a small live inference request |
| **Poolside: Open API Keys** | Open Poolside Platform |
| **Poolside: Show Diagnostics** | Show the VS Code version, endpoint, credential state, and registered models |

## Settings

| Setting | Default | Purpose |
| --- | ---: | --- |
| `poolsideCopilot.maxOutputTokens` | `32768` | Maximum output tokens requested from Poolside |
| `poolsideCopilot.requestTimeoutSeconds` | `600` | Inference request timeout in seconds |
| `poolsideCopilot.debugLogging` | `false` | Log request, stream, usage, and model-discovery metadata to the Poolside output channel |

Prompts and API keys are never intentionally written to the output channel.

## Troubleshooting

- **No Poolside models in the picker:** enable **Poolside** under **Manage Models**, then run **Poolside: Refresh Models**.
- **The API key is rejected:** create a fresh key in Poolside Platform and run **Poolside: Configure API Key** again.
- **A request times out:** increase `poolsideCopilot.requestTimeoutSeconds`; agentic coding requests can run longer than ordinary chat.
- **An image is rejected:** hosted Laguna models are text-only. Remove image attachments and retry.
- **Need a diagnostic snapshot:** run **Poolside: Show Diagnostics** and include the report when filing an issue. The report never includes the API key.
