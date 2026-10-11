import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
  contributes: {
    languageModelChatProviders: Array<{ vendor: string; configuration: { required: string[]; properties: Record<string, { secret?: boolean }> }; managementCommand?: string }>;
    commands: Array<{ command: string }>;
    configuration: { properties: Record<string, { default?: unknown }> };
  };
};
test("native entries are VS Code-owned API keys without entry IDs", () => {
  const provider = manifest.contributes.languageModelChatProviders.find((item) => item.vendor === "poolside");
  assert.ok(provider);
  assert.equal(provider.managementCommand, undefined);
  assert.deepEqual(provider.configuration.required, ["apiKey"]);
  assert.equal(provider.configuration.properties.apiKey.secret, true);
  assert.equal(provider.configuration.properties.entryId, undefined);
});
test("uses group-name-native registration and removes command-managed credential workflows", () => {
  const commands = manifest.contributes.commands.map((item) => item.command);
  for (const command of ["manage", "testConnection", "refreshModels"]) assert.ok(commands.includes(`poolsideCopilot.${command}`));
  for (const command of ["configureApiKey", "removeApiKey", "completionMenu", "forgetEntry", "restoreEntry", "selectManagementEntry", "selectInlineEntry"]) assert.ok(!commands.includes(`poolsideCopilot.${command}`));
  assert.equal(manifest.contributes.configuration.properties["poolsideCopilot.managementEntry"], undefined);
  assert.equal(manifest.contributes.configuration.properties["poolsideCopilot.inlineSuggestionsEntry"], undefined);
});
