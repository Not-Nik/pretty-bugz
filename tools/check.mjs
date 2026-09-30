#!/usr/bin/env node
// Fast sanity checks: every file the manifest references exists, every layout script is
// registered in the manifest, and all JavaScript parses.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
const problems = [];

const referenced = [
  ...manifest.content_scripts.flatMap((cs) => [...cs.css, ...cs.js]),
  ...Object.values(manifest.icons),
  manifest.action.default_popup,
  manifest.action.default_icon,
];
for (const file of referenced) {
  if (!existsSync(join(ROOT, file))) problems.push(`manifest references missing file ${file}`);
}

const registered = new Set(referenced);
for (const file of readdirSync(join(ROOT, "content", "layouts"))) {
  const path = `content/layouts/${file}`;
  if (!registered.has(path)) problems.push(`${path} is not listed in manifest.json`);
}

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
if (pkg.version !== manifest.version) problems.push(`package.json version ${pkg.version} differs from manifest.json version ${manifest.version}`);

const js = manifest.content_scripts[0].js;
if (js.at(-1) !== "content/content.js") problems.push("content/content.js must be the last content script");
if (js[0] !== "content/lib.js") problems.push("content/lib.js must be the first content script");

const scripts = [...js, "popup/popup.js", "tools/harness.mjs", "tools/check.mjs", "tools/check-package.mjs"];
for (const file of scripts) {
  const result = spawnSync(process.execPath, ["--check", join(ROOT, file)], { encoding: "utf8" });
  if (result.status !== 0) problems.push(`${file} does not parse:\n${result.stderr}`);
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`ok: ${referenced.length} manifest files, ${scripts.length} scripts`);
}
