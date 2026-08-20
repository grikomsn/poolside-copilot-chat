import assert from "node:assert/strict";
import test from "node:test";
import { API_BASE, POOLSIDE_ENDPOINTS, extensionUserAgent, poolsideHeaders } from "./protocol";

test("keeps Poolside endpoints and request identity centralized", () => {
  assert.equal(POOLSIDE_ENDPOINTS.models, `${API_BASE}/models`);
  assert.equal(POOLSIDE_ENDPOINTS.chat, `${API_BASE}/chat/completions`);
  assert.equal(extensionUserAgent("1.2.3", "1.125.0"), "poolside-copilot-chat/1.2.3 VSCode/1.125.0");
  assert.deepEqual(poolsideHeaders("secret", "application/json", "agent"), {
    Authorization: "Bearer secret",
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "agent",
  });
});
