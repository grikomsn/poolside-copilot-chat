# Repository guidance

## Scope and setup

- These instructions apply to the entire repository.
- This is a TypeScript VS Code `LanguageModelChatProvider`. Use Node.js 22+ and npm; `package-lock.json` is authoritative.
- Install from a clean checkout with `npm ci`.

## Code map

- `src/extension.ts`: activation and dependency wiring.
- `src/commands/commands.ts`: user-facing commands, connection UI, and diagnostics.
- `src/auth/auth.ts`: API-key Secret Storage and credential references.
- `src/provider.ts`: VS Code provider integration, model-entry credentials, request conversion, and response reporting.
- `src/models/catalog.ts`: hosted-model filtering, fallbacks, and display metadata.
- `src/models/options.ts`: reasoning-effort schema, precedence, and Poolside request payload translation.
- `src/transport/protocol.ts`: fixed endpoints, request identity, and headers.
- `src/transport/sse.ts`: incremental SSE parsing into text, reasoning, tool-call, and usage events.
- `src/usage/domain.ts`: provider usage normalization for VS Code.
- Tests are colocated as `src/**/*.test.ts`; `out/` and `*.vsix` are generated artifacts.

## Commands

- `npm run compile` — clean and type-check into `out/`.
- `npm test` or `npm run check` — compile and run all Node test files.
- `npm run package` — validate and build the installable VSIX.
- `npm run watch` — compile continuously; press F5 with the repository launch configuration for an Extension Development Host.

## Working agreements

- Keep changes focused and follow the existing strict TypeScript style: explicit public types, small helpers, double quotes, and two-space indentation.
- Add or update colocated `node:test` coverage for behavior changes. Network paths must use injected fakes rather than live services.
- Preserve native VS Code provider-entry configuration: each API-key entry must use only its configured key, and the legacy Secret Storage key remains an explicit command-managed fallback.
- Keep API keys in VS Code Secret Storage or VS Code-managed provider configuration. Never log or commit keys, private prompts, captured responses, or account data.
- Requests must use the fixed Poolside endpoint and user agent from `src/transport/protocol.ts`; never redirect credentials through a workspace-configurable endpoint.
- Treat Poolside and OpenAI-compatible response behavior as an undocumented integration surface. Parse defensively and keep protocol-specific behavior covered by tests.
- When commands, settings, models, security behavior, or user workflows change, keep `package.json`, tests, documentation, and Changesets synchronized.
- Do not commit generated `out/`, source maps, VSIX files, logs, or unrelated formatting/dependency churn.

## Before handing off

- Run the narrowest relevant test while iterating, then `npm run check`.
- Also run `npm run package` for manifest, packaging, or release-facing changes. Live authentication checks belong in the Extension Development Host.
- Add a Changeset with `npm run changeset` for user-visible published-extension changes. Documentation, tests, and repository-maintenance-only changes do not require one.
