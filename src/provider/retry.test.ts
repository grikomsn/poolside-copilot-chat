import assert from "node:assert/strict";
import test from "node:test";
import { isTransientNetworkError, isTransientServerError, retryDelayMs } from "./retry";
test("retries documented rate-limit, gateway, and availability failures", () => {
  assert.equal(isTransientServerError(429), true);
  assert.equal(isTransientServerError(502), true);
  assert.equal(isTransientServerError(503), true);
  assert.equal(isTransientServerError(504), true);
  assert.equal(isTransientServerError(500), false);
  assert.equal(isTransientServerError(402), false);
});
test("recognizes transient network errors but not cancellation", () => {
  assert.equal(isTransientNetworkError(new TypeError("fetch failed", { cause: new Error("ECONNRESET") })), true);
  assert.equal(isTransientNetworkError(new DOMException("Aborted", "AbortError")), false);
});
test("uses bounded backoff and Retry-After seconds", () => {
  assert.deepEqual(
    [0, 1, 2, 8].map((attempt) => retryDelayMs(attempt)),
    [250, 500, 1_000, 2_000],
  );
  assert.equal(retryDelayMs(0, "3"), 3_000);
  assert.equal(retryDelayMs(0, "99"), 5_000);
});
