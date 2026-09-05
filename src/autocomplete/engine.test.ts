import assert from "node:assert/strict";
import test from "node:test";
import { ChatCompletionEngine, parseSseContentDelta } from "./engine";

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

test("parses visible content and ignores reasoning-only events", () => {
  assert.equal(parseSseContentDelta(JSON.stringify({ choices: [{ delta: { content: "code" } }] })), "code");
  assert.equal(parseSseContentDelta(JSON.stringify({ choices: [{ text: "legacy" }] })), "legacy");
  assert.equal(parseSseContentDelta(JSON.stringify({ choices: [{ delta: { reasoning_content: "secret" } }] })), "");
  assert.equal(parseSseContentDelta("not json"), "");
  assert.equal(parseSseContentDelta(JSON.stringify({ choices: [] })), "");
});

test("streams a completion; xs requests carry no thinking field", async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const engine = new ChatCompletionEngine({
    url: "https://inference.poolside.ai/v1/chat/completions",
    headers: { Authorization: "Bearer test-key" },
    timeoutMs: 1_000,
    fetcher: async (url, init) => {
      requests.push({ url: String(url), init: init ?? {} });
      return sseResponse([
        `data: ${JSON.stringify({ choices: [{ delta: { content: "lo = min(row)" } }] })}\n\n`,
        "data: [DONE]\n\n",
      ]);
    },
  });
  const result = await engine.complete(
    { prefix: "p", suffix: "s", modelId: "poolside/laguna-xs-2.1", maxTokens: 128 },
    new AbortController().signal,
  );
  assert.equal(result.text, "lo = min(row)");
  const body = JSON.parse(String(requests[0]?.init.body)) as {
    model: string;
    stream: boolean;
    max_tokens: number;
    temperature: number;
    chat_template_kwargs?: unknown;
  };
  assert.equal(requests[0]?.url, "https://inference.poolside.ai/v1/chat/completions");
  assert.equal(body.model, "poolside/laguna-xs-2.1");
  assert.equal(body.stream, true);
  assert.equal(body.max_tokens, 128);
  assert.equal(body.temperature, 0);
  assert.equal(body.chat_template_kwargs, undefined);
  const headers = requests[0]?.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer test-key");
});

test("laguna-s requests carry the thinking-off switch", async () => {
  let body: Record<string, unknown> = {};
  const engine = new ChatCompletionEngine({
    url: "https://inference.poolside.ai/v1/chat/completions",
    headers: {},
    timeoutMs: 1_000,
    fetcher: async (_url, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return sseResponse(["data: [DONE]\n\n"]);
    },
  });
  const result = await engine.complete(
    { prefix: "p", suffix: "s", modelId: "poolside/laguna-s-2.1", maxTokens: 64 },
    new AbortController().signal,
  );
  assert.equal(result.text, undefined);
  assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
});

test("never echoes upstream error bodies", async () => {
  const engine = new ChatCompletionEngine({
    url: "https://inference.poolside.ai/v1/chat/completions",
    headers: {},
    timeoutMs: 1_000,
    fetcher: async () => new Response('{"error":"prompt context leak"}', { status: 403 }),
  });
  await assert.rejects(
    engine.complete({ prefix: "p", suffix: "s", modelId: "poolside/laguna-xs-2.1", maxTokens: 8 }, new AbortController().signal),
    (error: unknown) => error instanceof Error && error.message === "Poolside completion request failed (403)",
  );
});

test("aborted caller signal surfaces as a quiet no-result", async () => {
  const controller = new AbortController();
  const engine = new ChatCompletionEngine({
    url: "https://inference.poolside.ai/v1/chat/completions",
    headers: {},
    timeoutMs: 1_000,
    fetcher: async (_url, init) => {
      controller.abort();
      assert.equal((init?.signal as AbortSignal).aborted, true);
      throw new DOMException("aborted", "AbortError");
    },
  });
  const result = await engine.complete(
    { prefix: "p", suffix: "s", modelId: "poolside/laguna-xs-2.1", maxTokens: 8 },
    controller.signal,
  );
  assert.equal(result.text, undefined);
});

test("times out long requests via the request timeout", async () => {
  const engine = new ChatCompletionEngine({
    url: "https://inference.poolside.ai/v1/chat/completions",
    headers: {},
    timeoutMs: 30,
    fetcher: (async (_url: string | URL | Request, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal;
      await new Promise((_resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("hang resolved")), 250);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("aborted", "TimeoutError"));
        });
      });
      return sseResponse([]);
    }) as typeof fetch,
  });
  await assert.rejects(
    engine.complete({ prefix: "p", suffix: "s", modelId: "poolside/laguna-xs-2.1", maxTokens: 8 }, new AbortController().signal),
    /failed/,
  );
});
