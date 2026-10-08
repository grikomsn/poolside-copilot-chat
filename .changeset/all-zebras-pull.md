---
"poolside-copilot-chat": major
---

Require native VS Code provider entries with a unique `entryId` and VS Code-owned API key. Remove command-managed API-key commands and fallback credentials, qualify model IDs by stable entry IDs, reject stale handles after key rotation or removal, and scope catalogs to the current credential. Select management and completion entries explicitly; no available-key fallback or legacy migration is performed.

Keep streamed reasoning before visible output, close thinking at text/tool/completion boundaries and during cleanup, and use request-scoped IDs for tools missing upstream IDs. Preserve fragmented parallel tool arguments across index/ID aliases and split CRLF chunks, reject incomplete/truncated streams, and release response readers on completion, errors and cancellation.

Persist only forgotten entry IDs to prevent discovery or restart from reviving revoked credentials; restore entries explicitly before fresh VS Code provisioning.
