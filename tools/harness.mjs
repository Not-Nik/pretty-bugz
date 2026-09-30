#!/usr/bin/env node
// Offline test harness: injects the extension's content scripts and CSS into saved BMO pages,
// then screenshots them with headless Firefox or checks that layouts undo cleanly.
//
//   node tools/harness.mjs fetch
//   node tools/harness.mjs shot  <fixture> [--out name.png] [--size 1400,1000] [--theme light|dark|auto] [--os light|dark] [--no-layouts] [--query "?id=x.html"] [--extra script.js]
//   node tools/harness.mjs undo  <fixture> [--query "?id=x.html"]
//   node tools/harness.mjs undo-all
//   node tools/harness.mjs probe <fixture> --extra script.js [--theme …] [--no-layouts] [--query …]   (prints the text of #pb-probe)
//   node tools/harness.mjs screenshots

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = join(ROOT, "test", "fixtures");
const OUT = join(ROOT, "test", "out");
const BMO = "https://bugzilla.mozilla.org";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0";
const FIREFOX = process.env.FIREFOX ?? (existsSync("/Applications/Firefox.app/Contents/MacOS/firefox") ? "/Applications/Firefox.app/Contents/MacOS/firefox" : "firefox");
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Pages used by `fetch` and `undo-all`. The harness serves each fixture at its `url`.
const PAGES = [
  { name: "bug.html", url: "/show_bug.cgi?id=1000000", expect: "bug" },
  { name: "bug.html", label: "bug.html (logged in)", url: "/show_bug.cgi?id=1000000", setup: "bug-logged-in.js", expect: "bug" },
  { name: "bug.html", label: "bug.html (editing)", url: "/show_bug.cgi?id=1000000&edit", setup: "bug-logged-in.js", expect: "bug" },
  { name: "home.html", url: "/home", expect: null },
  { name: "product-chooser.html", url: "/describecomponents.cgi", expect: null },
  { name: "query-advanced.html", url: "/query.cgi?format=advanced", expect: "advanced-search" },
  { name: "query-simple.html", url: "/query.cgi?format=specific", expect: "simple-search" },
  { name: "query-instant.html", url: "/query.cgi?format=instant", expect: "instant-search" },
  { name: "buglist.html", url: "/buglist.cgi?product=Firefox&component=Tabbed%20Browser&resolution=---&limit=40", expect: "buglist", chrome: true },
  { name: "buglist.html", label: "buglist.html (tweak)", url: "/buglist.cgi?product=Firefox&component=Tabbed%20Browser&resolution=---&limit=40&tweak=1", setup: "buglist-tweak.js", expect: "buglist" },
  { name: "requests.html", url: "/request.cgi?action=queue&type=needinfo&product=Firefox&component=Tabbed%20Browser&group=requestee&do_union=0", expect: "requests" },
  { name: "components.html", url: "/describecomponents.cgi?product=Firefox", expect: "components" },
  { name: "activity.html", url: "/show_activity.cgi?id=1000000", expect: "activity" },
  { name: "keywords.html", url: "/describekeywords.cgi", expect: "keywords" },
  { name: "profile.html", url: "/user_profile?user_id=258347", expect: "profile" },
  { name: "page-bug-writing.html", url: "/page.cgi?id=bug-writing.html", expect: "page-article" },
  { name: "page-quicksearch.html", url: "/page.cgi?id=quicksearch.html", expect: "page-article" },
  { name: "page-custom-forms.html", url: "/page.cgi?id=custom_forms.html", expect: "page-custom-forms" },
  { name: "page-attention.html", url: "/page.cgi?id=attention.html&who=nobody%40mozilla.org", expect: "page-attention" },
  { name: "page-user-activity.html", url: "/page.cgi?id=user_activity.html", expect: "page-tool" },
  { name: "enter-bug.mock.html", url: "/enter_bug.cgi?product=Firefox", expect: "enter-bug", local: true },
];

// Store screenshots for addons.mozilla.org (see store/listing.md for captions).
const SCREENSHOTS = [
  { out: "1-buglist.png", fixture: "buglist.html", extra: "buglist-select.js" },
  { out: "2-bug-dark.png", fixture: "bug.html", theme: "dark", extra: "bug-logged-in.js" },
  { out: "3-new-bug.png", fixture: "enter-bug.mock.html", extra: "enter-bug-filled.js" },
  { out: "4-attention.png", fixture: "page-attention.html" },
  { out: "5-advanced-search.png", fixture: "query-advanced.html" },
  { out: "6-components-dark.png", fixture: "components.html", theme: "dark" },
  { out: "7-history.png", fixture: "activity.html" },
];

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--no-layouts") args.layouts = false;
    else if (arg.startsWith("--")) args[arg.slice(2)] = argv[++i];
    else args._.push(arg);
  }
  return args;
}

function fixturePath(name) {
  const local = join(ROOT, "tools", "fixtures", name);
  if (existsSync(local)) return local;
  const fetched = join(FIXTURES, name);
  if (existsSync(fetched)) return fetched;
  throw new Error(`Fixture ${name} not found. Run \`node tools/harness.mjs fetch\` first.`);
}

function buildPage(fixture, { theme = "auto", layouts = true, extra = "" } = {}) {
  const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
  const { css, js } = manifest.content_scripts[0];
  const settings = JSON.stringify({ theme, layouts });
  const shim = `window.browser = { storage: { local: { get: (d) => Promise.resolve({ ...d, ...${settings} }), set() {} }, onChanged: { addListener() {} } } };`;
  const scripts = [shim, ...js.map((f) => readFileSync(join(ROOT, f), "utf8"))].map((s) => `<script>${s}</script>`).join("\n");
  const styles = css.map((f) => readFileSync(join(ROOT, f), "utf8")).join("\n");

  // BMO's icon font can't load cross-origin from a local page; inline a fetched copy.
  const font = join(FIXTURES, "MaterialSymbolsOutlined.woff2");
  const fontFace = existsSync(font)
    ? `@font-face{font-family:'Material Symbols Outlined';font-display:block;src:url(data:font/woff2;base64,${readFileSync(font).toString("base64")}) format('woff2')}`
    : "";

  // Headless screenshots are taken immediately, so freeze motion to capture final states.
  const freeze = "*,*::before,*::after{animation:none!important;transition:none!important}";

  let html = readFileSync(fixture, "utf8");
  // Firefox cascades content-script CSS after the page's own sheets, so ties go to us.
  html = html.replace(/<head[^>]*>/i, (m) => `${m}\n<base href="${BMO}/">\n${scripts}`);
  html = html.replace(/<\/head>/i, `<style>${styles}</style><style>${fontFace}${freeze}</style></head>`);
  if (extra) html = html.replace(/<\/body>/i, `<script>${extra}</script></body>`);
  return html;
}

// The fixture's real BMO path and query, so layouts that check location match as they would live.
function pagePath(fixtureName, query) {
  const page = PAGES.find((p) => p.name === fixtureName);
  const url = new URL(page?.url ?? `/${fixtureName}`, BMO);
  if (query) {
    const [search, hash] = query.split("#");
    url.search = search;
    if (hash) url.hash = hash;
  }
  return url.pathname + url.search + url.hash;
}

// Serves one page from memory on its own port, so parallel runs never share state.
async function withPage(html, path, fn) {
  const target = new URL(path, BMO).pathname;
  const server = createServer((req, res) => {
    if (new URL(req.url, BMO).pathname !== target) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}${path}`);
  } finally {
    server.close();
  }
}

function run(cmd, args, { timeout = 60000, doneWhen } = {}) {
  return new Promise((ok) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
    // Headless Chrome sometimes lingers after dumping the DOM; stop as soon as we have it.
    child.stdout.on("data", (d) => {
      out += d;
      if (doneWhen?.test(out)) child.kill("SIGKILL");
    });
    child.on("close", () => {
      clearTimeout(timer);
      ok(out);
    });
  });
}

async function chromeDom(url, budget = 8000) {
  const profile = mkdtempSync(join(tmpdir(), "pb-chrome-"));
  try {
    return await run(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", `--user-data-dir=${profile}`, `--virtual-time-budget=${budget}`, "--dump-dom", url], { timeout: 60000, doneWhen: /<\/html>\s*$/ });
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
}

async function shot(fixtureName, args) {
  const out = resolve(args.out ?? join(OUT, fixtureName.replace(/\.html$/, ".png")));
  const extra = readExtras(args.extra);
  const html = buildPage(fixturePath(fixtureName), { theme: args.theme, layouts: args.layouts !== false, extra });
  mkdirSync(dirname(out), { recursive: true });
  await withPage(html, pagePath(fixtureName, args.query), async (url) => {
    const profile = mkdtempSync(join(tmpdir(), "pb-firefox-"));
    let prefs = readFileSync(join(ROOT, "tools", "firefox-user.js"), "utf8");
    if (args.os === "dark") prefs = prefs.replace("systemUsesDarkTheme\", 0", "systemUsesDarkTheme\", 1").replace("content-override\", 1", "content-override\", 0");
    writeFileSync(join(profile, "user.js"), prefs);
    rmSync(out, { force: true });
    await run(FIREFOX, ["--headless", "--no-remote", "-profile", profile, `--window-size=${args.size ?? "1400,1000"}`, "--screenshot", out, url], { timeout: 90000 });
    rmSync(profile, { recursive: true, force: true });
  });
  console.log(existsSync(out) ? out : `screenshot failed: ${out}`);
}

async function runScript(fixtureName, { extra, id, query, theme, layouts }) {
  const html = buildPage(fixturePath(fixtureName), { theme, layouts, extra });
  const dom = await withPage(html, pagePath(fixtureName, query), (url) => chromeDom(url));
  const match = dom.match(new RegExp(`id="${id}"[^>]*>([^<]*)`));
  return match ? match[1].replace(/&quot;/g, "\"").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim() : "NO RESULT";
}

// --extra takes a comma-separated list; scripts run in order at the end of <body>.
function readExtras(list) {
  return (list ?? "").split(",").filter(Boolean).map((file) => readFileSync(file, "utf8")).join("\n;\n");
}

function undo(fixtureName, query, setup) {
  const extra = [setup && readExtras(join(ROOT, "tools", "extras", setup)), readFileSync(join(ROOT, "tools", "undo-test.js"), "utf8")].filter(Boolean).join("\n;\n");
  return runScript(fixtureName, { extra, id: "pb-undo-result", query, layouts: false });
}

async function fetchFixtures() {
  mkdirSync(FIXTURES, { recursive: true });
  for (const page of PAGES) {
    if (page.local || page.setup) continue;
    const target = join(FIXTURES, page.name);
    let html;
    if (page.chrome) {
      // Some pages sit behind a JavaScript bot check that only a real browser passes.
      html = await chromeDom(`${BMO}${page.url}`, 15000);
    } else {
      const response = await fetch(`${BMO}${page.url}`, { headers: { "user-agent": UA, accept: "text/html" } });
      html = await response.text();
    }
    writeFileSync(target, html);
    const title = html.match(/<title>([^<]*)/)?.[1]?.trim();
    console.log(`${page.name.padEnd(28)} ${String(html.length).padStart(8)}  ${title}`);
  }
  const home = readFileSync(join(FIXTURES, "home.html"), "utf8");
  const cssPath = home.match(/href="(\/static\/[^"]*\/skins\/standard\/global\.css)"/)?.[1];
  if (cssPath) {
    const css = await (await fetch(`${BMO}${cssPath}`, { headers: { "user-agent": UA } })).text();
    const fontPath = css.match(/url\('([^']*MaterialSymbolsOutlined\.woff2)'\)/)?.[1];
    const font = fontPath && await fetch(new URL(fontPath, `${BMO}${cssPath}`), { headers: { "user-agent": UA } });
    if (font?.ok) writeFileSync(join(FIXTURES, "MaterialSymbolsOutlined.woff2"), Buffer.from(await font.arrayBuffer()));
  }
}

const args = parseArgs(process.argv.slice(2));
const [command, fixture] = args._;

if (command === "fetch") {
  await fetchFixtures();
} else if (command === "shot" && fixture) {
  await shot(fixture, args);
} else if (command === "undo" && fixture) {
  console.log(await undo(fixture, args.query));
} else if (command === "probe" && fixture && args.extra) {
  console.log(await runScript(fixture, { extra: readExtras(args.extra), id: "pb-probe", query: args.query, theme: args.theme, layouts: args.layouts !== false }));
} else if (command === "undo-all") {
  let failed = false;
  for (const page of PAGES) {
    const result = await undo(page.name, page.url && new URL(page.url, BMO).search, page.setup);
    const ok = page.expect ? result === `${page.expect}: changed=true restored=true` : result === "no layouts matched";
    failed ||= !ok;
    console.log(`${ok ? "ok  " : "FAIL"} ${(page.label ?? page.name).padEnd(28)} ${result}`);
  }
  process.exitCode = failed ? 1 : 0;
} else if (command === "screenshots") {
  for (const s of SCREENSHOTS) {
    await shot(s.fixture, {
      out: join(ROOT, "store", "screenshots", s.out),
      size: "1280,800",
      theme: s.theme,
      extra: s.extra && join(ROOT, "tools", "extras", s.extra),
    });
  }
} else {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 10).join("\n").replace(/^\/\/ ?/gm, ""));
  process.exitCode = command ? 1 : 0;
}

