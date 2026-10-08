/** User-facing Poolside commands and connection workflows. */

import * as vscode from "vscode";
import { CONFIG_SECTION, DEFAULT_INLINE_MODEL, INLINE_SUGGESTIONS_MODEL_SETTING } from "../autocomplete/config";
import { inlineModelChoices } from "../autocomplete/models";
import { messageOf } from "../errors";
import { API_BASE, PoolsideProvider } from "../provider";

const API_KEYS_URL = "https://platform.poolside.ai/";

export function registerCommands(
  provider: PoolsideProvider,
  output: vscode.OutputChannel,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand("poolsideCopilot.selectManagementEntry", () => selectEntry(provider, "managementEntry")),
    vscode.commands.registerCommand("poolsideCopilot.selectInlineEntry", () => selectEntry(provider, "inlineSuggestionsEntry")),
    vscode.commands.registerCommand("poolsideCopilot.forgetEntry", () => forgetEntry(provider)),
    vscode.commands.registerCommand("poolsideCopilot.manage", () => manage(provider, output)),
    vscode.commands.registerCommand("poolsideCopilot.refreshModels", () => refreshModels(provider)),
    vscode.commands.registerCommand("poolsideCopilot.setInlineSuggestionsModel", () => setInlineSuggestionsModel()),
    vscode.commands.registerCommand("poolsideCopilot.testConnection", () => testConnection(provider, output)),
    vscode.commands.registerCommand("poolsideCopilot.openApiKeys", () => openApiKeys()),
    vscode.commands.registerCommand("poolsideCopilot.diagnostics", () => diagnostics(provider, output)),
  ];
}

async function manage(
  provider: PoolsideProvider,
  output: vscode.OutputChannel,
): Promise<void> {
  const choices = [
    { label: "$(settings) Manage Language Models", action: "models" },
    { label: "$(account) Select entry for management", action: "managementEntry" },
    { label: "$(edit) Select inline suggestions entry", action: "inlineEntry" },
    { label: "$(check) Test Poolside inference", action: "test" },
    { label: "$(refresh) Refresh hosted models", action: "refresh" },
    { label: "$(zap) Set inline suggestions model", action: "inlineModel" },
    { label: "$(link-external) Open Poolside API keys", action: "open" },
    { label: "$(output) Show Poolside logs", action: "logs" },
    { label: "$(info) Show diagnostics", action: "diagnostics" },
    { label: "$(trash) Forget loaded entry", action: "forget" },
  ];
  const picked = await vscode.window.showQuickPick(choices, { title: "Poolside — native provider entries" });
  if (!picked) return;
  if (picked.action === "models") await vscode.commands.executeCommand("workbench.action.chat.manage");
  else if (picked.action === "managementEntry") await selectEntry(provider, "managementEntry");
  else if (picked.action === "refresh") await refreshModels(provider);
  else if (picked.action === "test") await testConnection(provider, output);
  else if (picked.action === "open") await openApiKeys();
  else if (picked.action === "logs") output.show(true);
  else if (picked.action === "diagnostics") await diagnostics(provider, output);
  else if (picked.action === "forget") await forgetEntry(provider);
  else if (picked.action === "inlineEntry") await selectEntry(provider, "inlineSuggestionsEntry");
  else if (picked.action === "inlineModel") await setInlineSuggestionsModel();
}

async function selectEntry(provider: PoolsideProvider, setting: string): Promise<void> {
  const entries = provider.getEntries();
  if (!entries.length) {
    await vscode.commands.executeCommand("workbench.action.chat.manage");
    void vscode.window.showInformationMessage("Add an entry with a unique entryId, then open its models to load its credential.");
    return;
  }
  const picked = await vscode.window.showQuickPick(entries.map((entry) => ({ label: entry.entryId })), {
    title: `Poolside — select ${setting}`,
  });
  if (picked) await vscode.workspace.getConfiguration("poolsideCopilot").update(setting, picked.label, vscode.ConfigurationTarget.Global);
}

async function forgetEntry(provider: PoolsideProvider): Promise<void> {
  const picked = await vscode.window.showQuickPick(provider.getEntries().map((entry) => ({ label: entry.entryId })), {
    title: "Forget loaded entry",
    placeHolder: "Also delete the entry in Manage Language Models to prevent it loading again",
  });
  if (picked) provider.forgetEntry(picked.label);
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
    `- Loaded native entries: ${provider.getEntries().length}`,
    `- Default reasoning effort: ${vscode.workspace.getConfiguration("poolsideCopilot").get("reasoningEffort", "max")}`,
    `- Registered models: ${models.length}`,
    "",
    ...models.map((model) => `- ${model.id} (${model.maxInputTokens} input tokens)`),
  ];
  output.appendLine(`[diagnostics] models=${models.length}`);
  const doc = await vscode.workspace.openTextDocument({ content: lines.join("\n"), language: "markdown" });
  await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
}
