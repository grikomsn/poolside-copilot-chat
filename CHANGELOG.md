# Changelog

## 1.0.0

### Major Changes

- 5f78851: Require native VS Code provider entries with a unique `entryId` and VS Code-owned API key. Remove command-managed API-key commands and fallback credentials, qualify model IDs by stable entry IDs, reject stale handles after key rotation or removal, and scope catalogs to the current credential. Select management and completion entries explicitly; no available-key fallback or legacy migration is performed.

  Keep streamed reasoning before visible output, close thinking at text/tool/completion boundaries and during cleanup, and use request-scoped IDs for tools missing upstream IDs. Preserve fragmented parallel tool arguments across index/ID aliases and split CRLF chunks, reject incomplete/truncated streams, and release response readers on completion, errors and cancellation.

  Persist only forgotten entry IDs to prevent discovery or restart from reviving revoked credentials; restore entries explicitly before fresh VS Code provisioning.

## 0.3.1

### Patch Changes

- e7aaf89: Align the bundled Laguna fallback metadata with the live hosted catalog, verified on 2026-09-28: both `poolside/laguna-s-2.1` and `poolside/laguna-xs-2.1` serve a 256K-token context and 32K max completion tokens, so the picker's offline metadata no longer overstates a 1M context or 262K output. Live discovery remains authoritative whenever available.

## 0.3.0

### Minor Changes

- b77d81d: Adds a Context Window picker control (Auto, 64K, 128K, 200K, Maximum) that caps how much conversation history each request sends, clamped to the model's registered input limit.

### Patch Changes

- b77d81d: Fix Auto context size being interpreted as zero input tokens by VS Code, collapsing the context indicator to the output reserve and triggering premature compaction.

  Reserve the default 32K response budget for Poolside instead of subtracting its entire 262K output capability, which could leave a model with only one input token.

- b77d81d: Report each model's `maxInputTokens` as context minus the output budget so the picker's context window matches the model's real usable input.

## 0.2.0

### Minor Changes

- 0e6f18a: Add experimental, opt-in inline code suggestions (ghost text) powered by Poolside-hosted Laguna models. Enable with `poolsideCopilot.inlineSuggestions` and choose the model (`inlineSuggestionsModel`, default `poolside/laguna-xs-2.1`; live-measured 396ms TTFB with zero hidden reasoning and no thinking field, while `laguna-s-2.1` receives the request-level thinking-off switch). A new **Poolside: Set Inline Suggestions Model** command (also in the Manage menu) lists compatible models with measured badges; a custom model id remains enterable. Debounce, timeout, token budget, and context windows are configurable. The Copilot Chat prompt box is excluded unless separately enabled, and document context is never logged.

## 0.1.2

### Patch Changes

- 0e360f5: Validate streamed completion reasons and reject incomplete tool arguments before they reach Copilot Chat.

## 0.1.1

### Patch Changes

- 123886d: Show every documented Laguna model, align thinking controls and output-token limits with Poolside-hosted inference, and collapse casing-only catalog aliases in the VS Code picker.

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
