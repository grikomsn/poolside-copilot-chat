# API key and security

## Credential storage

Command-managed Poolside API keys are stored in VS Code `SecretStorage`; provider-entry keys are supplied through VS Code's secret provider configuration. They are not written to workspace settings, files, extension logs, or this repository. A key is validated against the hosted model-list endpoint before it is used for model discovery.

Use **Poolside: Remove API Key** to delete the saved credential. Replacing a key validates the replacement before overwriting the existing secret.

Provider entries created through **Manage Language Models** receive their API key through VS Code's provider configuration and are kept separate from the legacy command-managed key. A short one-way fingerprint is used in memory only to distinguish entries; the key itself is never used as a model identifier or log value.

## Network destination

The extension sends requests directly to:

- `https://inference.poolside.ai/v1/models` for hosted-model discovery and key validation
- `https://inference.poolside.ai/v1/chat/completions` for model responses

There is no local proxy or project-operated relay. Prompts, conversation context, tool definitions, and tool results selected by Copilot Chat are sent to Poolside as part of chat-completion requests.

The inference base URL is fixed in the extension instead of being workspace-configurable. This prevents an untrusted workspace setting from redirecting the saved API key to another server.

## Inline completions

When `poolsideCopilot.inlineSuggestions` is enabled, each suggestion sends a bounded window of the current document (a fixed number of lines before the cursor and a bounded suffix after it) plus the stored API key to the same `/chat/completions` endpoint. Upstream error bodies are never surfaced or logged because they can echo prompt context, and suggestion text flows only into the editor's ghost text. The feature is disabled by default.

## Logging

Debug logging is disabled by default. When enabled, the Poolside output channel records model discovery, request metadata, token usage, and errors; it does not intentionally log prompts or API keys.

Report vulnerabilities according to the [security policy](https://github.com/grikomsn/poolside-copilot-chat/security/policy) or email [security@nibras.co](mailto:security@nibras.co). Do not disclose credentials, sensitive prompts, or vulnerability details in a public issue.
