# Development and releases

## Local workflow

```bash
npm install
npm test
npm run package
```

Tests are colocated with the modules they cover under `src/auth/`, `src/models/`, `src/transport/`, and `src/usage/`. `npm test` performs a clean compile and runs credential-storage, provider-configuration, model-filtering, stream-parser, protocol, and usage tests. `npm run package` validates the project and creates an installable VSIX.

Install the local build with:

```bash
code --install-extension poolside-copilot-chat-<version>.vsix --force
```

For a live API check, put `POOLSIDE_API_KEY` in an ignored local `.env` file or your shell environment. Never commit credentials or paste them into an issue.

## Release workflow

User-visible pull requests normally include a Changeset:

```bash
npm run changeset
```

Changesets maintains a version pull request on `main`. Merging that pull request publishes the VSIX to the Visual Studio Marketplace and attaches the same artifact to a GitHub release. The release workflow skips an existing version tag, preventing duplicate publication.

The packaged extension contains compiled runtime files, Marketplace metadata, the changelog, license, README, and icon. Source, tests, maps, repository automation, project documentation, secrets, and local build artifacts are excluded by `.vscodeignore`.

## References

- [Poolside API overview](https://docs.poolside.ai/api/overview)
- [OpenAI-compatible API examples](https://docs.poolside.ai/api/openai-api-examples)
- [Supported Poolside models](https://docs.poolside.ai/get-started/supported-models)
