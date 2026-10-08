# API key and security

## Credential storage

All API keys belong to native entries in **Manage Language Models** and are supplied through VS Code's secret provider configuration. The extension holds provisioned keys in memory only; it does not read or write a command-managed key or mirror secrets into workspace settings, files, logs, or global state.

Every entry requires a unique `entryId` (1–64 lowercase letters, numbers, dots, underscores or hyphens). Use separate IDs for separate native entries, even if they share a display name. Keep the ID when rotating a key so model selections remain stable. Catalogs and request credentials are scoped by a one-way key fingerprint; model handles also carry an entry generation and are rejected after rotation or removal. Entries sharing the same API key share its credential scope.

Delete or update credentials through **Manage Language Models**. **Poolside: Forget Loaded Entry** revokes the in-memory binding and persists its ID in an alias-only block list, preventing automatic rediscovery or restart from reviving credentials. **Poolside: Restore Forgotten Entry** removes that block and lets VS Code provision a fresh binding. Only forgotten IDs are persisted; no credentials or key fingerprints enter this block list. After a restart, entries become available when VS Code provisions them again. Feature selectors never choose the first available key or another entry.

## Network destination

The extension sends requests directly to:

- `https://inference.poolside.ai/v1/models` for hosted-model discovery and key validation
- `https://inference.poolside.ai/v1/chat/completions` for model responses

There is no local proxy or project-operated relay. Prompts, conversation context, tool definitions, and tool results selected by Copilot Chat are sent to Poolside as part of chat-completion requests.

The inference base URL is fixed in the extension instead of being workspace-configurable. This prevents an untrusted workspace setting from redirecting the saved API key to another server.

## Inline completions

When `poolsideCopilot.inlineSuggestions` is enabled, each suggestion sends a bounded window of the current document (a fixed number of lines before the cursor and a bounded suffix after it) using the explicitly selected entry’s API key to the same `/chat/completions` endpoint. Upstream error bodies are never surfaced or logged because they can echo prompt context, and suggestion text flows only into the editor's ghost text. The feature is disabled by default.

## Logging

Debug logging is disabled by default. When enabled, the Poolside output channel records model discovery, request metadata, token usage, and errors; it does not intentionally log prompts or API keys.

Report vulnerabilities according to the [security policy](https://github.com/grikomsn/poolside-copilot-chat/security/policy) or email [security@nibras.co](mailto:security@nibras.co). Do not disclose credentials, sensitive prompts, or vulnerability details in a public issue.
