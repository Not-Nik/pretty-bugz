#!/usr/bin/env node
// Checks the built .xpi: it holds every file the extension needs and nothing from the dev tree,
// and the packaged file (not just the source folder) passes addons-linter.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
const xpi = join(ROOT, "web-ext-artifacts", `pretty-bugz-${manifest.version}.xpi`);
const SHIPPED = ["manifest.json", "LICENSE", "content", "popup", "icons"];

// Lists the files in a zip from its central directory (no dependencies, no extraction).
function zipEntries(file) {
  const data = readFileSync(file);
  const end = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error(`${file} is not a zip file`);
  let offset = data.readUInt32LE(end + 16);
  const names = [];
  for (let i = data.readUInt16LE(end + 10); i > 0; i--) {
    const nameLength = data.readUInt16LE(offset + 28);
    const extra = data.readUInt16LE(offset + 30) + data.readUInt16LE(offset + 32);
    names.push(data.toString("utf8", offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extra;
  }
  return names.filter((name) => !name.endsWith("/"));
}

function walk(path) {
  if (!statSync(path).isDirectory()) return [relative(ROOT, path)];
  return readdirSync(path).filter((name) => !name.startsWith(".")).flatMap((name) => walk(join(path, name)));
}

const problems = [];
if (!existsSync(xpi)) {
  problems.push(`${relative(ROOT, xpi)} was not built`);
} else {
  const packed = new Set(zipEntries(xpi));
  const expected = new Set(SHIPPED.flatMap((path) => walk(join(ROOT, path))));
  for (const file of expected) if (!packed.has(file)) problems.push(`missing from package: ${file}`);
  for (const file of packed) if (!expected.has(file)) problems.push(`unexpected file in package: ${file}`);

  const lint = spawnSync(join(ROOT, "node_modules", ".bin", "addons-linter"), ["--warnings-as-errors", xpi], { encoding: "utf8" });
  if (lint.status !== 0) problems.push(`addons-linter failed on the package:\n${lint.stdout}${lint.stderr}`);

  if (!problems.length) console.log(`ok: ${relative(ROOT, xpi)} (${packed.size} files, ${Math.round(statSync(xpi).size / 1024)} KB)`);
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
}
