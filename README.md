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
- Credentials managed by VS Code native secret provider configuration
- Multiple Poolside API-key entries in VS Code's Manage Language Models flow
- Live hosted-model discovery with sensible Laguna fallbacks
- Streaming text and model reasoning
- Configurable reasoning effort in the Copilot model picker (`max` for thinking on, `none` for off)
- Agent mode function-tool calls
- Native VS Code context-window accounting from Poolside usage data
- No proxy, bundled server, or third-party relay

## Quick start

1. Install [Poolside for GitHub Copilot Chat](https://marketplace.visualstudio.com/items?itemName=grikomsn.poolside-copilot-chat). You need VS Code 1.125 or newer and GitHub Copilot Chat.
2. Create a developer API key in [Poolside Platform](https://platform.poolside.ai/).
3. Open Copilot Chat, select **Manage Models**, add a **Poolside** provider entry, and enter a unique `entryId` (for example `work`) and your API key. VS Code stores the provider credential securely and Poolside model discovery checks it when loading models.
4. Choose an available Laguna model.

To use more than one Poolside account or API key, add another **Poolside** entry in **Manage Language Models** with a different `entryId` and provide its API key. Display names do not identify credentials; the entry ID stays stable when rotating a key.

Use **Poolside: Manage Connection** to select an entry for management, test it, refresh its models, choose an inline entry, inspect logs or open diagnostics. Set `poolsideCopilot.inlineSuggestionsEntry` explicitly before enabling inline suggestions. Blank or unavailable selections send no inline request.

Choose **Max** or **None** from the thinking control in Copilot Chat. Poolside-hosted inference defaults to **Max**; the selection applies to that request and overrides the `poolsideCopilot.reasoningEffort` workspace default.

Poolside's hosted Laguna models are currently text-only. Image attachments are disabled; prompts, tool definitions, tool results, and conversation context selected by Copilot Chat are sent directly to Poolside for inference.

## Major release setup

The major release requires native entries with explicit IDs. Command-managed key commands and fallback credentials have been removed. Re-enter keys in **Manage Language Models**, assign a different `entryId` to each entry, and select its models again. No legacy secret or model-ID migration is performed. Keep `entryId` unchanged for later key rotations; stale model handles are rejected until VS Code reloads their current configuration.

Keys are available only after VS Code provisions their entry. After a restart, open the model picker or refresh the native entry before using management or completion commands. Use **Poolside: Forget Loaded Entry** to revoke its cached binding and persist an alias-only block through rediscovery and restart. **Poolside: Restore Forgotten Entry** explicitly allows fresh provisioning again; it never recovers a cached key. Delete the native entry in **Manage Language Models** to remove its VS Code-owned credential. Required entry IDs must be unique; reusing one ID represents the same entry’s replacement.

## Documentation

- [Setup, settings, and troubleshooting](https://github.com/grikomsn/poolside-copilot-chat/blob/main/docs/setup.md)
- [Models and pricing](https://github.com/grikomsn/poolside-copilot-chat/blob/main/docs/models.md)
- [API key and security model](https://github.com/grikomsn/poolside-copilot-chat/blob/main/docs/security.md)
- [Development and releases](https://github.com/grikomsn/poolside-copilot-chat/blob/main/docs/development.md)

## Related projects

- [Grok for GitHub Copilot Chat](https://github.com/grikomsn/grok-copilot-chat) — Use xAI Grok models directly from the GitHub Copilot Chat model picker.
- [Codex Bridge for Copilot Chat](https://github.com/grikomsn/openai-oauth-copilot-chat) — Use OpenAI Codex models in Copilot Chat with a ChatGPT Plus or Pro subscription.
- [Ollama Cloud for GitHub Copilot Chat](https://github.com/grikomsn/ollama-cloud-copilot-chat) — Use Ollama Cloud models with native thinking and tool support.
- [OpenCode for GitHub Copilot Chat](https://github.com/grikomsn/opencode-copilot-chat) — Use OpenCode Zen, Go, and Console models from the model picker.

Unofficial project; not affiliated with Poolside, GitHub, or Microsoft. Poolside account limits and charges still apply. Licensed under [MIT](LICENSE).
