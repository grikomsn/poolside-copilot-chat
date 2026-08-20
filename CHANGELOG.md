# Changelog

## 0.1.0

### Minor Changes

- 6c4a076: Add native API-key provider entries so multiple Poolside accounts can be configured independently in Manage Language Models. Legacy Secret Storage commands remain supported, and model discovery is isolated per provider entry. Align request timeout, stream-idle timeout, catalog-cache, and advertised output-limit settings with the sibling providers.
- 6c4a076: Add `max` to the reasoning-effort options in the Copilot model picker and workspace settings. The `max` value requests the highest available reasoning budget and matches Laguna S 2.1's supported thinking modes (off/max). When reasoning effort is set to `none`, the request body now also includes `chat_template_kwargs.enable_thinking` set to `false`, which is the Poolside Platform API's native mechanism for disabling thinking. The OpenRouter-style `reasoning: { effort }` field is still sent for OpenRouter-compatible providers. The `xhigh` description is updated from "highest" to "very high" to reflect `max` as the top level.

## 0.0.3

### Patch Changes

- 8861e79: Use per-model Poolside context and output-token metadata, including upstream `/models` limits when available, for more accurate Copilot model information.

## 0.0.2

### Patch Changes

- 32fbdad: Add configurable Poolside reasoning effort in the Copilot model picker and workspace settings.

## 0.0.1

- Add the Poolside hosted-model provider for GitHub Copilot Chat.
- Validate and store user API keys with VS Code Secret Storage.
- Discover Laguna models from the Poolside Platform API.
- Stream text, reasoning, token usage, and function-tool calls.
- Add connection management, diagnostics, documentation, tests, CI, Changesets, and Marketplace packaging.
