import * as vscode from "vscode";
import { registerInlineCompletions } from "./autocomplete";
import { PoolsideAuth } from "./auth/auth";
import { registerCommands } from "./commands/commands";
import { messageOf } from "./errors";
import { PoolsideProvider } from "./provider";
import { extensionUserAgent } from "./transport/protocol";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Poolside");
  const auth = new PoolsideAuth(context.secrets);
  const provider = new PoolsideProvider(
    auth,
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
    ...registerCommands(auth, provider, output),
    registerInlineCompletions(context, {
      resolveApiKey: () => auth.getApiKey(),
      output,
      version: context.extension.packageJSON.version as string,
      vscodeVersion: vscode.version,
    }),
  );

  output.appendLine(
    `[activate] Poolside for Copilot Chat ${context.extension.packageJSON.version} on VS Code ${vscode.version}`,
  );
  void auth.hasApiKey().then((configured) => {
    if (!configured) return;
    void provider.refreshModels().catch((error) => {
      output.appendLine(`[models] initial refresh failed: ${messageOf(error)}`);
    });
  });
}
