/**
 * Inline completions registration.
 *
 * Wires the completion engine + provider into the extension. The provider
 * checks the opt-in configuration live, and the API key is read from Secret
 * Storage on every suggestion (cheap, and never cached or logged). Register
 * once at activation; toggling `poolsideCopilot.inlineSuggestions` is
 * honored on the fly.
 */

import * as vscode from "vscode";
import { ChatCompletionEngine } from "./engine";
import { PoolsideInlineCompletionProvider } from "./provider";
import type { CompletionContext, CompletionEngine, CompletionResult } from "./types";
import {
  clampNumber,
  CONFIG_SECTION,
  DEFAULT_INLINE_DEBOUNCE_MS,
  DEFAULT_INLINE_MAX_TOKENS,
  DEFAULT_INLINE_MODEL,
  DEFAULT_INLINE_PREFIX_LINES,
  DEFAULT_INLINE_SUFFIX_CHARS,
  DEFAULT_INLINE_SUGGESTIONS_CHAT_INPUT,
  DEFAULT_INLINE_TIMEOUT_MS,
  INLINE_DEBOUNCE_MS_SETTING,
  INLINE_MAX_TOKENS_SETTING,
  INLINE_PREFIX_LINES_SETTING,
  INLINE_SUGGESTIONS_CHAT_INPUT_SETTING,
  INLINE_SUGGESTIONS_MODEL_SETTING,
  INLINE_SUGGESTIONS_SETTING,
  INLINE_SUFFIX_CHARS_SETTING,
  INLINE_TIMEOUT_MS_SETTING,
} from "./config";
import { extensionUserAgent, poolsideHeaders, POOLSIDE_ENDPOINTS } from "../transport/protocol";

export interface InlineCompletionsDeps {
  /** Resolve the stored API key; undefined when signed out. */
  readonly resolveApiKey: () => Promise<string | undefined>;
  readonly output: vscode.OutputChannel;
  readonly version: string;
  readonly vscodeVersion: string;
}

function readSetting<T>(key: string, fallback: T): T {
  const value = vscode.workspace.getConfiguration(CONFIG_SECTION).get<T>(key);
  return value === undefined ? fallback : value;
}

function readNumberSetting(key: string, fallback: number, min: number, max: number): number {
  return clampNumber(vscode.workspace.getConfiguration(CONFIG_SECTION).get<unknown>(key), fallback, min, max);
}

export function registerInlineCompletions(context: vscode.ExtensionContext, deps: InlineCompletionsDeps): vscode.Disposable {
  const log = (message: string): void => deps.output.appendLine(message);

  const engine: CompletionEngine = {
    id: "chat-completions",
    async complete(ctx: CompletionContext, signal: AbortSignal): Promise<CompletionResult> {
      const apiKey = await deps.resolveApiKey();
      if (!apiKey) {
        log("[completions] no Poolside API key — skipping");
        return { text: undefined, durationMs: 0 };
      }
      const keyed = new ChatCompletionEngine({
        url: POOLSIDE_ENDPOINTS.chat,
        headers: poolsideHeaders(apiKey, "text/event-stream, application/json", extensionUserAgent(deps.version, deps.vscodeVersion)),
        timeoutMs: readNumberSetting(INLINE_TIMEOUT_MS_SETTING, DEFAULT_INLINE_TIMEOUT_MS, 500, 15_000),
        log,
      });
      return keyed.complete(ctx, signal);
    },
  };

  const provider = new PoolsideInlineCompletionProvider({
    engine,
    isEnabled: () => readSetting(INLINE_SUGGESTIONS_SETTING, false),
    resolveModelId: () => readSetting(INLINE_SUGGESTIONS_MODEL_SETTING, DEFAULT_INLINE_MODEL),
    resolveChatInputEnabled: () => readSetting(INLINE_SUGGESTIONS_CHAT_INPUT_SETTING, DEFAULT_INLINE_SUGGESTIONS_CHAT_INPUT),
    resolveDebounceMs: () => readNumberSetting(INLINE_DEBOUNCE_MS_SETTING, DEFAULT_INLINE_DEBOUNCE_MS, 50, 2_000),
    resolveMaxTokens: () => readNumberSetting(INLINE_MAX_TOKENS_SETTING, DEFAULT_INLINE_MAX_TOKENS, 16, 1_024),
    resolvePrefixLines: () => readNumberSetting(INLINE_PREFIX_LINES_SETTING, DEFAULT_INLINE_PREFIX_LINES, 1, 100),
    resolveSuffixChars: () => readNumberSetting(INLINE_SUFFIX_CHARS_SETTING, DEFAULT_INLINE_SUFFIX_CHARS, 0, 5_000),
  });

  const registration = vscode.languages.registerInlineCompletionItemProvider({ pattern: "**" }, provider);
  context.subscriptions.push(registration, provider);
  return registration;
}
