/** User-facing Poolside commands and connection workflows. */

import * as vscode from "vscode";
import { CONFIG_SECTION, DEFAULT_INLINE_MODEL, INLINE_SUGGESTIONS_MODEL_SETTING } from "../autocomplete/config";
import { inlineModelChoices } from "../autocomplete/models";
import { messageOf } from "../errors";
import { API_BASE, PoolsideProvider } from "../provider";
import { formatUsageRows } from "../usage/domain";
import { type UsageQuickPickItem } from "../usage/presentation";

const API_KEYS_URL = "https://platform.poolside.ai/";

export function registerCommands(
  provider: PoolsideProvider,
  output: vscode.OutputChannel,
  usageStatus?: vscode.StatusBarItem,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand("poolsideCopilot.manage", () => manage(provider, output)),
    vscode.commands.registerCommand("poolsideCopilot.refreshModels", () => refreshModels(provider)),
    vscode.commands.registerCommand("poolsideCopilot.setInlineSuggestionsModel", () => setInlineSuggestionsModel()),
    vscode.commands.registerCommand("poolsideCopilot.testConnection", () => testConnection(provider, output)),
    vscode.commands.registerCommand("poolsideCopilot.openApiKeys", () => openApiKeys()),
    vscode.commands.registerCommand("poolsideCopilot.showUsage", () => showUsage(provider)),
    vscode.commands.registerCommand("poolsideCopilot.diagnostics", () => diagnostics(provider, output)),
    ...(usageStatus ? [] : []),
  ];
}

/** Unified usage QuickPick; mirrors the sibling showUsage menu. */
async function showUsage(provider: PoolsideProvider): Promise<void> {
  const snapshot = provider.getSelectedUsageSnapshot();
  const rows: UsageQuickPickItem[] = formatUsageRows(snapshot).map((row) => ({
    label: row.label,
    description: row.description,
    detail: row.detail,
    action: undefined,
  }));
  const actions: UsageQuickPickItem[] = [
    { label: "", kind: vscode.QuickPickItemKind.Separator },
    { label: "$(refresh) Refresh hosted models", action: "refresh" },
    { label: "$(link-external) Open Poolside API keys", action: "openApiKeys" },
  ];
  const picked = await vscode.window.showQuickPick<UsageQuickPickItem>(
    [...rows, ...actions],
    { title: "Poolside — usage & settings" },
  );
  if (!picked?.action) return;
  if (picked.action === "refresh") await refreshModels(provider);
  else if (picked.action === "openApiKeys") await openApiKeys();
}

async function manage(
  provider: PoolsideProvider,
  output: vscode.OutputChannel,
): Promise<void> {
  const choices = [
    { label: "$(settings) Manage Language Models", action: "models" },
    { label: "$(check) Test Poolside inference", action: "test" },
    { label: "$(refresh) Refresh hosted models", action: "refresh" },
    { label: "$(zap) Set inline suggestions model", action: "inlineModel" },
    { label: "$(link-external) Open Poolside API keys", action: "open" },
    { label: "$(output) Show Poolside logs", action: "logs" },
    { label: "$(info) Show diagnostics", action: "diagnostics" },
  ];
  const picked = await vscode.window.showQuickPick(choices, { title: "Poolside — provider connection" });
  if (!picked) return;
  if (picked.action === "models") await vscode.commands.executeCommand("workbench.action.chat.manage");
  else if (picked.action === "refresh") await refreshModels(provider);
  else if (picked.action === "test") await testConnection(provider, output);
  else if (picked.action === "open") await openApiKeys();
  else if (picked.action === "logs") output.show(true);
  else if (picked.action === "diagnostics") await diagnostics(provider, output);
  else if (picked.action === "inlineModel") await setInlineSuggestionsModel();
}

async function refreshModels(provider: PoolsideProvider): Promise<void> {
  try {
    const models = await provider.refreshModels();
    vscode.window.showInformationMessage(`Refreshed ${models.length} Poolside hosted models.`);
  } catch (error) {
    vscode.window.showErrorMessage(messageOf(error));
  }
}

interface InlineModelPickItem extends vscode.QuickPickItem {
  readonly action?: string | "custom";
}

async function setInlineSuggestionsModel(): Promise<void> {
  const configuration = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const current = configuration.get<string>(INLINE_SUGGESTIONS_MODEL_SETTING, DEFAULT_INLINE_MODEL) ?? DEFAULT_INLINE_MODEL;
  const picked = await vscode.window.showQuickPick<InlineModelPickItem>([
    ...inlineModelChoices(current).map((choice) => ({
      label: choice.label,
      description: choice.description,
      detail: choice.detail,
      action: choice.id,
    })),
    { label: "", kind: vscode.QuickPickItemKind.Separator },
    { label: "$(pencil) Use a custom model id…", detail: "Enter any Poolside model id; the hosted list currently exposes the two Laguna models.", action: "custom" as const },
  ], {
    title: "Poolside — Set Inline Suggestions Model",
    placeHolder: `Current: ${current}`,
  });
  if (!picked?.action) return;
  if (picked.action === "custom") {
    const value = await vscode.window.showInputBox({
      title: "Custom inline suggestions model id",
      value: current,
      prompt: "Any Poolside model id; the vetted list is a starting point, not a restriction.",
    });
    if (value === undefined || !value.trim()) return;
    await configuration.update(INLINE_SUGGESTIONS_MODEL_SETTING, value.trim(), vscode.ConfigurationTarget.Global);
    void vscode.window.showInformationMessage(`Poolside inline suggestions model set to ${value.trim()}.`);
    return;
  }
  await configuration.update(INLINE_SUGGESTIONS_MODEL_SETTING, picked.action, vscode.ConfigurationTarget.Global);
  void vscode.window.showInformationMessage(`Poolside inline suggestions model set to ${picked.action}. Applies on the next keystroke.`);
}

async function testConnection(provider: PoolsideProvider, output: vscode.OutputChannel): Promise<void> {
  try {
    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Testing Poolside inference…" },
      () => provider.testConnection(),
    );
    output.appendLine(`[test] model=${result.model} effort=${result.reasoningEffort}`);
    vscode.window.showInformationMessage(
      `Poolside verified with ${result.model} (${result.reasoningEffort} effort).`,
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

async function diagnostics(provider: PoolsideProvider, output: vscode.OutputChannel): Promise<void> {
  const models = await vscode.lm.selectChatModels({ vendor: "poolside" });
  const lines = [
    "# Poolside for Copilot Chat diagnostics",
    "",
    `- VS Code: ${vscode.version}`,
    `- API endpoint: ${API_BASE}`,
    `- Default reasoning effort: ${vscode.workspace.getConfiguration("poolsideCopilot").get("reasoningEffort", "max")}`,
    `- Registered models: ${models.length}`,
    "",
    ...models.map((model) => `- ${model.id} (${model.maxInputTokens} input tokens)`),
  ];
  output.appendLine(`[diagnostics] models=${models.length}`);
  const doc = await vscode.workspace.openTextDocument({ content: lines.join("\n"), language: "markdown" });
  await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
}
