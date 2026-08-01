# Changelog

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
