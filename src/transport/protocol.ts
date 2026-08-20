export const API_BASE = "https://inference.poolside.ai/v1";

export const POOLSIDE_ENDPOINTS = {
  models: `${API_BASE}/models`,
  chat: `${API_BASE}/chat/completions`,
} as const;

export function extensionUserAgent(version: string, vscodeVersion: string): string {
  return `poolside-copilot-chat/${version} VSCode/${vscodeVersion}`;
}

export function poolsideHeaders(apiKey: string, accept: string, userAgent: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: accept,
    "User-Agent": userAgent,
  };
}
