import assert from "node:assert/strict";
import test from "node:test";
import {
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
  clampNumber,
} from "./config";

test("names the configuration section and setting keys from package.json", () => {
  assert.equal(CONFIG_SECTION, "poolsideCopilot");
  assert.equal(INLINE_SUGGESTIONS_SETTING, "inlineSuggestions");
  assert.equal(INLINE_SUGGESTIONS_MODEL_SETTING, "inlineSuggestionsModel");
  assert.equal(INLINE_SUGGESTIONS_CHAT_INPUT_SETTING, "inlineSuggestionsChatInput");
  assert.equal(INLINE_DEBOUNCE_MS_SETTING, "inlineSuggestionsDebounceMs");
  assert.equal(INLINE_TIMEOUT_MS_SETTING, "inlineSuggestionsTimeoutMs");
  assert.equal(INLINE_MAX_TOKENS_SETTING, "inlineSuggestionsMaxTokens");
  assert.equal(INLINE_PREFIX_LINES_SETTING, "inlineSuggestionsPrefixLines");
  assert.equal(INLINE_SUFFIX_CHARS_SETTING, "inlineSuggestionsSuffixChars");
});

test("matches the documented inline-suggestion defaults", () => {
  assert.equal(DEFAULT_INLINE_MODEL, "poolside/laguna-xs-2.1");
  assert.equal(DEFAULT_INLINE_DEBOUNCE_MS, 300);
  assert.equal(DEFAULT_INLINE_TIMEOUT_MS, 3_000);
  assert.equal(DEFAULT_INLINE_MAX_TOKENS, 128);
  assert.equal(DEFAULT_INLINE_PREFIX_LINES, 10);
  assert.equal(DEFAULT_INLINE_SUFFIX_CHARS, 300);
  assert.equal(DEFAULT_INLINE_SUGGESTIONS_CHAT_INPUT, false);
});

test("clampNumber falls back for missing or non-numeric values", () => {
  assert.equal(clampNumber(undefined, 300, 50, 2_000), 300);
  assert.equal(clampNumber(null, 300, 50, 2_000), 300);
  assert.equal(clampNumber("300", 300, 50, 2_000), 300);
  assert.equal(clampNumber(true, 300, 50, 2_000), 300);
  assert.equal(clampNumber(Number.NaN, 300, 50, 2_000), 300);
});

test("clampNumber falls back for non-finite numbers", () => {
  assert.equal(clampNumber(Number.POSITIVE_INFINITY, 3_000, 500, 15_000), 3_000);
  assert.equal(clampNumber(Number.NEGATIVE_INFINITY, 3_000, 500, 15_000), 3_000);
});

test("clampNumber floors fractional values into their documented range", () => {
  assert.equal(clampNumber(300.9, 300, 50, 2_000), 300);
  assert.equal(clampNumber(1500.5, 300, 50, 2_000), 1500);
});

test("clampNumber clamps below the minimum and above the maximum", () => {
  assert.equal(clampNumber(49, 300, 50, 2_000), 50);
  assert.equal(clampNumber(-5, 300, 50, 2_000), 50);
  assert.equal(clampNumber(9_999, 300, 50, 2_000), 2_000);
});

test("clampNumber keeps in-range values, including the range floor", () => {
  assert.equal(clampNumber(128, 300, 16, 1_024), 128);
  assert.equal(clampNumber(42, 300, 0, 5_000), 42);
  assert.equal(clampNumber(0, 300, 0, 5_000), 0);
});