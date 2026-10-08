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
test("native entries require an explicit stable ID and a VS Code-owned secret", () => {
  const provider = manifest.contributes.languageModelChatProviders.find((item) => item.vendor === "poolside");
  assert.ok(provider);
  assert.equal(provider.managementCommand, undefined);
  assert.deepEqual(provider.configuration.required, ["entryId", "apiKey"]);
  assert.equal(provider.configuration.properties.apiKey.secret, true);
});
test("uses explicit entry selection and removes command-managed credential workflows", () => {
  const commands = manifest.contributes.commands.map((item) => item.command);
  for (const command of ["manage", "testConnection", "selectManagementEntry", "forgetEntry"]) assert.ok(commands.includes(`poolsideCopilot.${command}`));
  for (const command of ["configureApiKey", "removeApiKey", "completionMenu"]) assert.ok(!commands.includes(`poolsideCopilot.${command}`));
  for (const setting of ["managementEntry", "inlineSuggestionsEntry"]) assert.equal(manifest.contributes.configuration.properties[`poolsideCopilot.${setting}`]?.default, "");
});
