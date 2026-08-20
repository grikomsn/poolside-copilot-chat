<p align="center">
  <img src="https://raw.githubusercontent.com/grikomsn/poolside-copilot-chat/main/assets/cover.jpg" alt="Poolside and GitHub Copilot" width="960">
</p>

<h1 align="center">Poolside for GitHub Copilot Chat</h1>

<p align="center">Use hosted Poolside coding models directly from the GitHub Copilot Chat model picker in Visual Studio Code.</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=grikomsn.poolside-copilot-chat"><img src="https://img.shields.io/visual-studio-marketplace/v/grikomsn.poolside-copilot-chat?style=flat-square&logo=visualstudiocode&label=Marketplace" alt="Visual Studio Marketplace version"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=grikomsn.poolside-copilot-chat"><img src="https://img.shields.io/visual-studio-marketplace/i/grikomsn.poolside-copilot-chat?style=flat-square&label=Installs" alt="Visual Studio Marketplace installs"></a>
  <a href="https://github.com/grikomsn/poolside-copilot-chat/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/grikomsn/poolside-copilot-chat/ci.yml?branch=main&style=flat-square&label=CI" alt="CI status"></a>
  <a href="https://github.com/grikomsn/poolside-copilot-chat/blob/main/LICENSE"><img src="https://img.shields.io/github/license/grikomsn/poolside-copilot-chat?style=flat-square" alt="MIT license"></a>
</p>

This extension is a native VS Code `LanguageModelChatProvider`. It validates a user-supplied Poolside Platform API key, discovers the hosted models available to that key, and streams responses from `inference.poolside.ai` into Copilot Chat without a local proxy.

## Highlights

- Direct, first-class Poolside Platform integration
- Credentials managed by VS Code Secret Storage or provider configuration
- Multiple Poolside API-key entries in VS Code's Manage Language Models flow
- Live hosted-model discovery with sensible Laguna fallbacks
- Streaming text and model reasoning
- Configurable reasoning effort in the Copilot model picker (`none`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`)
- Agent mode function-tool calls
- Native VS Code context-window accounting from Poolside usage data
- No proxy, bundled server, or third-party relay

## Quick start

1. Install [Poolside for GitHub Copilot Chat](https://marketplace.visualstudio.com/items?itemName=grikomsn.poolside-copilot-chat). You need VS Code 1.125 or newer and GitHub Copilot Chat.
2. Create a developer API key in [Poolside Platform](https://platform.poolside.ai/).
3. Open Copilot Chat, select **Manage Models**, add a **Poolside** provider entry, and enter your API key. VS Code stores the provider credential securely and Poolside model discovery checks it when loading models.
4. Choose an available Laguna model.

To use more than one Poolside account or API key, add another **Poolside** entry in **Manage Language Models** and provide its API key. Each entry is isolated to its own model list and request credential.

Use **Poolside: Manage Connection** to test the legacy command-managed key, refresh hosted models, replace or remove it, inspect logs, or create a diagnostic snapshot. **Poolside: Configure API Key** remains available for that legacy command workflow.

Choose a reasoning level from the model configuration control in Copilot Chat. The selection applies to that request and overrides the `poolsideCopilot.reasoningEffort` workspace default. Legacy `thinkingEffort` request values remain accepted for compatibility.

Poolside's hosted Laguna models are currently text-only. Image attachments are disabled; prompts, tool definitions, tool results, and conversation context selected by Copilot Chat are sent directly to Poolside for inference.

## Documentation

- [Setup, settings, and troubleshooting](https://github.com/grikomsn/poolside-copilot-chat/blob/main/docs/setup.md)
- [API key and security model](https://github.com/grikomsn/poolside-copilot-chat/blob/main/docs/security.md)
- [Development and releases](https://github.com/grikomsn/poolside-copilot-chat/blob/main/docs/development.md)

## Related projects

- [Grok for GitHub Copilot Chat](https://github.com/grikomsn/grok-copilot-chat) — Use xAI Grok models directly from the GitHub Copilot Chat model picker.
- [Codex Bridge for Copilot Chat](https://github.com/grikomsn/openai-oauth-copilot-chat) — Use OpenAI Codex models in Copilot Chat with a ChatGPT Plus or Pro subscription.
- [Ollama Cloud for GitHub Copilot Chat](https://github.com/grikomsn/ollama-cloud-copilot-chat) — Use Ollama Cloud models with native thinking and tool support.
- [OpenCode for GitHub Copilot Chat](https://github.com/grikomsn/opencode-copilot-chat) — Use OpenCode Zen, Go, and Console models from the model picker.

Unofficial project; not affiliated with Poolside, GitHub, or Microsoft. Poolside account limits and charges still apply. Licensed under [MIT](LICENSE).
