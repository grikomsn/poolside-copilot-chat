#!/usr/bin/env node
// Model-metadata resync helper for Poolside.
// Probes the live /v1/models catalog, diffs it against the bundled fallback
// metadata compiled from src/models, applies mechanical refreshes to the two
// bundled Laguna entries, and can open the pull request. New model families
// and fallback membership changes are reported for manual review.
//
// Usage:
//   npm run refresh-models                              # report only
//   node scripts/refresh-models.mjs --apply             # rewrite bundled metadata
//   node scripts/refresh-models.mjs --pr                # --apply + branch/push/PR
//
// The Poolside API key is read from the gitignored .env file. Keys are never
// printed, logged, or committed.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_FILE = path.join(ROOT, "src/models/catalog.ts");
const METADATA_START = "export const FALLBACK_MODEL_METADATA: readonly PoolsideModelMetadata[] = [\n";
const METADATA_END = "];\n";
const CHANGESET_SUMMARY = "Resync bundled Poolside fallback metadata with the live catalog.";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply") || argv.includes("--pr");
const CREATE_PR = argv.includes("--pr");
const require_ = createRequire(import.meta.url);

const report = [];
function log(line = "") {
  report.push(line);
  console.log(line);
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response.json();
}

function envKey(name) {
  const file = path.join(ROOT, ".env");
  if (!existsSync(file)) return undefined;
  const match = readFileSync(file, "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  return value || undefined;
}

function requireBundled(relative) {
  const resolved = path.join(ROOT, "out", relative);
  if (!existsSync(resolved) || srcNewerThan(resolved)) {
    const compiled = spawnSync("npm", ["run", "compile"], { cwd: ROOT, encoding: "utf8" });
    if (compiled.status) {
      console.error(compiled.stderr);
      process.exit(compiled.status ?? 1);
    }
  }
  return require_(resolved);
}

/** True when any TypeScript source is newer than the compiled target. */
function srcNewerThan(target) {
  const compiled = statSync(target).mtimeMs;
  const stack = [path.join(ROOT, "src")];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/\.(?:ts|mts)$/.test(entry.name) && statSync(full).mtimeMs > compiled) return true;
    }
  }
  return false;
}

function fmtNumber(value) {
  if (!Number.isSafeInteger(value)) return String(value);
  const digits = String(value);
  if (digits.length < 5) return digits;
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, "_");
}

function positiveInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/** Replaces the numeric fields of one entry in the fallback metadata region. */
function editMetadataEntry(id, contextLength, maxOutputTokens) {
  const source = readFileSync(CATALOG_FILE, "utf8");
  const pattern = new RegExp(
    `(\\{\\s*id: "${id.replace(/\//g, "\\/")}",\\s*version: "([^"]+)",\\s*)contextLength: [\\d_]+,\\s*maxOutputTokens: [\\d_]+,`,
  );
  const match = pattern.exec(source);
  if (!match) throw new Error(`fallback metadata entry for ${id} not found`);
  const replacement = `${match[1]}contextLength: ${fmtNumber(contextLength)}, maxOutputTokens: ${fmtNumber(maxOutputTokens)},`;
  if (match[0] === replacement) return false;
  writeFileSync(CATALOG_FILE, source.replace(match[0], replacement));
  return true;
}

/** Bumps the "verified <date>" stamp in the limits comment after a refresh. */
function stampVerificationDate() {
  const today = new Date().toISOString().slice(0, 10);
  const source = readFileSync(CATALOG_FILE, "utf8");
  const updated = source.replace(/verified \d{4}-\d{2}-\d{2}:/, `verified ${today}:`);
  if (updated === source) return false;
  writeFileSync(CATALOG_FILE, updated);
  return true;
}

const main = async () => {
  const bundled = requireBundled("models/catalog.js");
  const apiKey = envKey("POOLSIDE_API_KEY");
  if (!apiKey) {
    log("POOLSIDE_API_KEY missing from gitignored .env; cannot probe the live catalog.");
    process.exitCode = 1;
    return;
  }
  const payload = await fetchJson("https://inference.poolside.ai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const list = Array.isArray(payload) ? payload : payload.data ?? [];
  const live = new Map();
  for (const raw of list) {
    if (typeof raw?.id !== "string" || !raw.id.trim()) continue;
    const id = raw.id.trim();
    live.set(id, raw);
    const stripped = id.replace(/^poolside\//, "");
    if (stripped !== id) live.set(stripped, raw);
  }
  log(`Live catalog: ${list.length} models`);

  const bundledList = bundled.FALLBACK_MODEL_METADATA.map((entry) => ({ ...entry }));
  for (const entry of bundledList) {
    if (!live.has(entry.id)) log(`WARNING: bundled id ${entry.id} absent from live (left in place)`);
  }
  const extra = [...live.keys()].filter((id) =>
    /^poolside\//.test(id) && !bundledList.some((entry) => entry.id === id),
  );
  if (extra.length) log(`Live-only Poolside-prefixed ids (manual review needed): ${extra.join(", ")}`);

  const changes = [];
  for (const entry of bundledList) {
    const raw = live.get(entry.id);
    if (!raw) continue;
    const contextLength =
      positiveInteger(raw.context_length) ?? positiveInteger(raw.max_context_tokens) ??
      positiveInteger(raw.max_model_len) ?? entry.contextLength;
    const maxOutputTokens =
      positiveInteger(raw.max_output_tokens) ?? positiveInteger(raw.max_completion_tokens) ?? entry.maxOutputTokens;
    if (contextLength !== entry.contextLength || maxOutputTokens !== entry.maxOutputTokens) {
      const diffs = [];
      if (contextLength !== entry.contextLength) diffs.push(`context ${entry.contextLength} -> ${contextLength}`);
      if (maxOutputTokens !== entry.maxOutputTokens) diffs.push(`output ${entry.maxOutputTokens} -> ${maxOutputTokens}`);
      changes.push({ id: entry.id, contextLength, maxOutputTokens, diffs });
      log(`Drift: ${entry.id}: ${diffs.join(", ")}`);
    }
  }
  if (!changes.length) log("No drift; bundled metadata already mirrors the live catalog.");

  const changedFiles = [];
  if (APPLY && changes.length) {
    for (const change of changes) {
      if (
        editMetadataEntry(change.id, change.contextLength, change.maxOutputTokens) &&
        !changedFiles.includes("src/models/catalog.ts")
      ) changedFiles.push("src/models/catalog.ts");
    }
    if (changedFiles.length) {
      if (stampVerificationDate() && !changedFiles.includes("src/models/catalog.ts")) {
        changedFiles.push("src/models/catalog.ts");
      }
      changedFiles.push(writeChangeset());
      log(`Applied updates to: ${changedFiles.join(", ")}`);
    }
  }

  if (CREATE_PR) await createPullRequest(changedFiles);
};

function writeChangeset() {
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(ROOT, ".changeset", `resync-model-metadata-${date}.md`);
  const body = `---\n"poolside-copilot-chat": patch\n---\n\n${CHANGESET_SUMMARY}\n`;
  if (!existsSync(file) || readFileSync(file, "utf8") !== body) writeFileSync(file, body);
  return path.relative(ROOT, file);
}

async function createPullRequest(changedFiles) {
  if (!changedFiles.length) {
    log("No drift to commit; skipping PR.");
    return;
  }
  const run = (name, args) => {
    const result = spawnSync(name, args, { cwd: ROOT, encoding: "utf8" });
    if (result.status) throw new Error(`${name} ${args.join(" ")} failed:\n${result.stderr}`);
    return result.stdout.trim();
  };
  const date = new Date().toISOString().slice(0, 10);
  const branch = `resync/models-${date}`;
  if (run("git", ["rev-parse", "--abbrev-ref", "HEAD"]) !== "main") {
    throw new Error("--pr must run from a clean checkout of main");
  }
  run("git", ["checkout", "-b", branch]);
  run("git", ["add", "--", ...changedFiles]);
  run("git", ["commit", "-m", "Resync model metadata"]);
  run("git", ["push", "-u", "origin", branch]);
  const bodyPath = path.join(process.env.TMPDIR ?? "/tmp", `${path.basename(ROOT)}-${process.pid}-resync-pr.md`);
  writeFileSync(bodyPath, `${report.join("\n")}\n`);
  const created = spawnSync(
    "gh",
    ["pr", "create", "--head", branch, "--base", "main", "--title", "Resync model metadata from live sources", "--body-file", bodyPath],
    { cwd: ROOT, encoding: "utf8" },
  );
  log(created.stdout.trim() || created.stderr.trim());
  run("git", ["checkout", "main"]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
