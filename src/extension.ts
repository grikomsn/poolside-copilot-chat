import * as vscode from "vscode";
import { registerInlineCompletions } from "./autocomplete";
import { Credentials } from "./auth/auth";
import { registerCommands } from "./commands/commands";
import { PoolsideProvider } from "./provider";
import { extensionUserAgent } from "./transport/protocol";
import type { PoolsideUsageSnapshot } from "./usage/domain";
import { renderUsageStatus } from "./usage/presentation";

/** GlobalState key holding the persisted per-credential usage snapshots. */
const USAGE_STATE_KEY = "poolsideCopilot.usageSnapshots.v1";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Poolside");
  const credentials = new Credentials();
  const initialUsage = context.globalState.get<Record<string, PoolsideUsageSnapshot>>(USAGE_STATE_KEY) ?? {};
  const provider = new PoolsideProvider(
    credentials,
    output,
    extensionUserAgent(context.extension.packageJSON.version, vscode.version),
    undefined,
    initialUsage,
  );

  const usageStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  usageStatus.name = "Poolside local API activity";
  usageStatus.command = "poolsideCopilot.showUsage";
  renderUsageStatus(usageStatus, provider.getSelectedUsageSnapshot());
  updateUsageStatusVisibility(usageStatus);

  context.subscriptions.push(
    output,
    usageStatus,
    provider.onDidChangeUsage((usage) => {
      renderUsageStatus(usageStatus, usage);
      updateUsageStatusVisibility(usageStatus);
      void persistUsage(context, provider);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("poolsideCopilot.reasoningEffort")
        || event.affectsConfiguration("poolsideCopilot.catalogCacheMinutes")) {
        provider.fireDidChange();
      }
      if (event.affectsConfiguration("poolsideCopilot.showUsageStatusBar")) {
        updateUsageStatusVisibility(usageStatus);
      }
    }),
    vscode.lm.registerLanguageModelChatProvider("poolside", provider),
    ...registerCommands(provider, output, usageStatus),
    registerInlineCompletions(context, {
      resolveApiKey: async () => provider.getInlineApiKey(),
      output,
      version: context.extension.packageJSON.version as string,
      vscodeVersion: vscode.version,
    }),
  );

  output.appendLine(
    `[activate] Poolside for Copilot Chat ${context.extension.packageJSON.version} on VS Code ${vscode.version}`,
  );
}

/** Shows or hides the usage status bar based on the `showUsageStatusBar` setting. */
function updateUsageStatusVisibility(item: vscode.StatusBarItem): void {
  if (vscode.workspace.getConfiguration("poolsideCopilot").get("showUsageStatusBar", true)) item.show();
  else item.hide();
}

/** Writes all tracked snapshots to globalState. */
async function persistUsage(
  context: vscode.ExtensionContext,
  provider: PoolsideProvider,
): Promise<void> {
  const activity: Record<string, PoolsideUsageSnapshot> = {};
  for (const [reference, snapshot] of provider.usageEntries()) activity[reference] = snapshot;
  await context.globalState.update(USAGE_STATE_KEY, activity);
}
