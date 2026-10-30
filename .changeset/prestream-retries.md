---
"poolside-copilot-chat": patch
---

Add bounded pre-stream retries for transient HTTP statuses (429/502/503/504) and network failures, honoring Retry-After, to model discovery, connection tests, and chat requests.
