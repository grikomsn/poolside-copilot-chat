import * as vscode from "vscode";
import { registerInlineCompletions } from "./autocomplete";
import { NativeEntries } from "./auth/auth";
import { registerCommands } from "./commands/commands";
import { PoolsideProvider } from "./provider";
import { extensionUserAgent } from "./transport/protocol";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Poolside");
  const entries = new NativeEntries(context.globalState);
  const provider = new PoolsideProvider(
    entries,
    output,
    extensionUserAgent(context.extension.packageJSON.version, vscode.version),
  );

  context.subscriptions.push(
    output,
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("poolsideCopilot.reasoningEffort")
        || event.affectsConfiguration("poolsideCopilot.catalogCacheMinutes")) {
        provider.fireDidChange();
      }
    }),
    vscode.lm.registerLanguageModelChatProvider("poolside", provider),
    ...registerCommands(provider, output),
    registerInlineCompletions(context, {
      resolveApiKey: async () => provider.getInlineApiKey(vscode.workspace.getConfiguration("poolsideCopilot").get("inlineSuggestionsEntry", "")),
      output,
      version: context.extension.packageJSON.version as string,
      vscodeVersion: vscode.version,
    }),
  );

  output.appendLine(
    `[activate] Poolside for Copilot Chat ${context.extension.packageJSON.version} on VS Code ${vscode.version}`,
  );
}
