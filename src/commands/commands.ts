/** User-facing Poolside commands and connection workflows. */

import * as vscode from "vscode";
import { PoolsideAuth } from "../auth/auth";
import { messageOf } from "../errors";
import { API_BASE, PoolsideProvider } from "../provider";

const API_KEYS_URL = "https://platform.poolside.ai/";

export function registerCommands(
  auth: PoolsideAuth,
  provider: PoolsideProvider,
  output: vscode.OutputChannel,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand("poolsideCopilot.manage", () => manage(auth, provider, output)),
    vscode.commands.registerCommand("poolsideCopilot.configureApiKey", () => configureApiKey(provider, output)),
    vscode.commands.registerCommand("poolsideCopilot.removeApiKey", () => removeApiKey(provider)),
    vscode.commands.registerCommand("poolsideCopilot.refreshModels", () => refreshModels(provider)),
    vscode.commands.registerCommand("poolsideCopilot.testConnection", () => testConnection(provider, output)),
    vscode.commands.registerCommand("poolsideCopilot.openApiKeys", () => openApiKeys()),
    vscode.commands.registerCommand("poolsideCopilot.diagnostics", () => diagnostics(auth, output)),
  ];
}

async function manage(
  auth: PoolsideAuth,
  provider: PoolsideProvider,
  output: vscode.OutputChannel,
): Promise<void> {
  const configured = await auth.hasApiKey();
  const choices = configured
    ? [
        { label: "$(check) Test Poolside inference", action: "test" },
        { label: "$(refresh) Refresh hosted models", action: "refresh" },
        { label: "$(key) Replace API key", action: "configure" },
        { label: "$(link-external) Open Poolside API keys", action: "open" },
        { label: "$(output) Show Poolside logs", action: "logs" },
        { label: "$(info) Show diagnostics", action: "diagnostics" },
        { label: "$(trash) Remove API key", action: "remove" },
      ]
    : [
        { label: "$(key) Configure Poolside API key", action: "configure" },
        { label: "$(link-external) Open Poolside API keys", action: "open" },
        { label: "$(output) Show Poolside logs", action: "logs" },
      ];
  const picked = await vscode.window.showQuickPick(choices, {
    title: `Poolside Platform — API key ${configured ? "configured" : "not configured"}`,
  });
  if (!picked) return;
  if (picked.action === "configure") await configureApiKey(provider, output);
  else if (picked.action === "refresh") await refreshModels(provider);
  else if (picked.action === "test") await testConnection(provider, output);
  else if (picked.action === "open") await openApiKeys();
  else if (picked.action === "logs") output.show(true);
  else if (picked.action === "diagnostics") await diagnostics(auth, output);
  else if (picked.action === "remove") await removeApiKey(provider);
}

async function configureApiKey(
  provider: PoolsideProvider,
  output: vscode.OutputChannel,
): Promise<boolean> {
  const apiKey = await vscode.window.showInputBox({
    title: "Configure Poolside Platform API key",
    prompt: "The key is validated with Poolside, then stored in VS Code Secret Storage.",
    placeHolder: "Paste your Poolside API key",
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => value.trim() ? undefined : "Enter a Poolside API key",
  });
  if (!apiKey) return false;

  try {
    const models = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Validating Poolside API key…" },
      () => provider.configureApiKey(apiKey),
    );
    output.appendLine(`[auth] API key configured; models=${models.join(",")}`);
    vscode.window.showInformationMessage(`Poolside connected. Found ${models.length} hosted models.`);
    return true;
  } catch (error) {
    const message = messageOf(error);
    output.appendLine(`[auth] API key validation failed: ${message}`);
    vscode.window.showErrorMessage(`Poolside API key was not saved: ${message}`);
    return false;
  }
}

async function removeApiKey(provider: PoolsideProvider): Promise<void> {
  const choice = await vscode.window.showWarningMessage(
    "Remove the Poolside API key from VS Code Secret Storage?",
    { modal: true },
    "Remove API Key",
  );
  if (choice !== "Remove API Key") return;
  await provider.clearApiKey();
  vscode.window.showInformationMessage("Poolside API key removed.");
}

async function refreshModels(provider: PoolsideProvider): Promise<void> {
  try {
    const models = await provider.refreshModels();
    vscode.window.showInformationMessage(`Refreshed ${models.length} Poolside hosted models.`);
  } catch (error) {
    vscode.window.showErrorMessage(messageOf(error));
  }
}

async function testConnection(provider: PoolsideProvider, output: vscode.OutputChannel): Promise<void> {
  try {
    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Testing Poolside inference…" },
      () => provider.testConnection(),
    );
    output.appendLine(`[test] model=${result.model} effort=${result.reasoningEffort} response=${result.text}`);
    vscode.window.showInformationMessage(
      `Poolside verified with ${result.model} (${result.reasoningEffort} effort): ${result.text}`,
    );
  } catch (error) {
    const message = messageOf(error);
    output.appendLine(`[test] ${message}`);
    vscode.window.showErrorMessage(`Poolside connection test failed: ${message}`);
  }
}

async function openApiKeys(): Promise<void> {
  const opened = await vscode.env.openExternal(vscode.Uri.parse(API_KEYS_URL));
  if (!opened) vscode.window.showWarningMessage("VS Code could not open Poolside Platform.");
}

async function diagnostics(auth: PoolsideAuth, output: vscode.OutputChannel): Promise<void> {
  const models = await vscode.lm.selectChatModels({ vendor: "poolside" });
  const lines = [
    "# Poolside for Copilot Chat diagnostics",
    "",
    `- VS Code: ${vscode.version}`,
    `- API endpoint: ${API_BASE}`,
    `- API key: ${(await auth.hasApiKey()) ? "configured in Secret Storage" : "missing"}`,
    `- Default reasoning effort: ${vscode.workspace.getConfiguration("poolsideCopilot").get("reasoningEffort", "high")}`,
    `- Registered models: ${models.length}`,
    "",
    ...models.map((model) => `- ${model.id} (${model.maxInputTokens} input tokens)`),
  ];
  output.appendLine(`[diagnostics] models=${models.length}`);
  const doc = await vscode.workspace.openTextDocument({ content: lines.join("\n"), language: "markdown" });
  await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
}
