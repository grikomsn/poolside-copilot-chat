---
"poolside-copilot-chat": major
---

Native entries no longer require an `entryId`: the group name you type in Manage Language Models is the entry's identity, and only the API key is prompted. Model IDs are no longer qualified per entry (the editor namespaces them per entry group), so saved model selections must be rechosen once after upgrading. Forget/restore and entry-selection commands and settings were removed; management commands and inline completions use the most recently provisioned entry key.
