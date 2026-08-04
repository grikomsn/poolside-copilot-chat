# AGENTS.md

Applies to the entire repository.

## Project

This is a TypeScript VS Code `LanguageModelChatProvider` that connects GitHub Copilot Chat directly to the hosted Poolside OpenAI-compatible API. It has no proxy or bundled server.

Key modules:

- `src/extension.ts`: activation, commands, connection UI, and diagnostics
- `src/provider.ts`: model discovery, request conversion, inference, and response reporting
- `src/model-options.ts`: reasoning-effort schema, precedence, and API payload
- `src/sse.ts`: streaming chat-completion parser
- `src/auth.ts`: VS Code Secret Storage only
- `src/models.ts`: hosted-model filtering, fallbacks, and display names
- `src/usage.ts`: usage normalization for VS Code
- `src/vscode.proposed.*.d.ts`: local declarations for proposed VS Code APIs

Tests are colocated as `src/*.test.ts`.

## Development

- Use Node.js 22 or newer and npm.
- Install reproducibly with `npm ci` when the lockfile is current.
- Run `npm test` after behavior changes; it performs a clean TypeScript build and all tests.
- Run `npm run package` for user-visible or packaging changes. Inspect the resulting VSIX when package contents change.
- Do not commit `node_modules/`, `out/`, `.env*`, API keys, or `*.vsix` files.

## Implementation invariants

- Keep requests direct to `https://inference.poolside.ai/v1` with bearer authentication.
- Store API keys only in VS Code Secret Storage. Never log keys or prompt contents.
- Preserve cancellation, request timeouts, SSE fragmentation handling, tool calls, reasoning parts, and usage reporting.
- Reasoning effort sends an OpenRouter-style `reasoning: { effort }` field and, when effort is `none`, also sets `chat_template_kwargs.enable_thinking` to `false` for the Poolside Platform API. Supported values are `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`.
- A valid per-request `modelConfiguration.reasoningEffort` overrides the workspace default.
- Keep public settings in `package.json` aligned with runtime defaults, picker schemas, tests, README, and `docs/setup.md`.
- Keep packaged runtime code under `out/`; source, tests, maps, docs, secrets, and repository automation must remain excluded by `.vscodeignore`.

## Verification

For normal code changes:

```bash
npm test
```

For user-visible, manifest, or release changes:

```bash
npm run package
npx vsce ls
```

Live API checks may use `POOLSIDE_API_KEY` from the ignored `.env`, but must never print or persist the key. When practical, install the VSIX with `code --install-extension <file>.vsix --force`, reload VS Code, and verify the affected command or Copilot control.

## Changes and releases

- Keep each branch and PR focused; preserve unrelated worktree changes.
- Add a Changeset for user-visible behavior or configuration changes. Documentation, tests, and repository maintenance alone do not require one.
- Do not manually bump the version in a feature PR. `npm run version` consumes Changesets and updates the version/changelog in the version PR.
- Merging a version PR publishes to the Visual Studio Marketplace and creates the matching GitHub release.
- GitHub Actions may be unable to create the version PR under current repository policy. If so, create a dedicated version branch, run `npm run version` followed by `npm install --package-lock-only --ignore-scripts`, validate, and open the PR manually; do not broaden repository permissions without explicit approval.
