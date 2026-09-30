# AGENTS.md

Guidance for AI agents and contributors working on Pretty Bugz, a Manifest V3 Firefox extension that restyles and restructures bugzilla.mozilla.org (BMO).

## Commands

```sh
npm run check        # manifest ↔ files consistency, script order, syntax (fast, run after every change)
npm run lint         # web-ext lint, must report 0 errors / 0 warnings
npm test             # applies, exercises (filters, j/k, toggle buttons) and reverts every layout on every fixture, then compares the whole document (headless Chrome, ~5 min)
npm run fixtures     # (re)download real BMO pages into test/fixtures (gitignored)
npm run screenshots  # regenerate store/screenshots (headless Firefox)
npm run build        # web-ext build → web-ext-artifacts/
```

For one page: `node tools/harness.mjs shot <fixture> [--theme dark] [--os dark] [--size 1400,1000] [--query "?id=x.html"] [--extra tools/extras/x.js] [--no-layouts] [--out file.png]` and `node tools/harness.mjs undo <fixture>`. `--os dark` simulates a dark OS, so combine it with `--theme light` to check forced light. `node tools/harness.mjs probe <fixture> --extra x.js` runs a script in headless Chrome and prints the text of the element with id `pb-probe`, which is handy for measuring layout or computed styles. Fixtures come from `test/fixtures/` (run `npm run fixtures` first) or `tools/fixtures/` (checked-in mocks).

There is no build step, bundler or dependency at runtime. Don't add one.

## Architecture

- `content/theme.css` is the global theme. It works mostly by overriding BMO's own CSS custom properties (`--primary-region-*`, `--control-*`, `--link-text-color`, …) on `:root.pb-on`, plus targeted rules. Its palette is defined once as `--pb-*` variables using `light-dark()`. BMO's RGB-triplet variables (`--accent-color-*`) can't use `light-dark()`, so their dark values are repeated for the automatic and forced-dark cases.
- `content/content.js` runs at `document_start`. It adds `pb-on` and `pb-layout` to `<html>` immediately from a copy of the settings it keeps in the page's `localStorage` (`pretty-bugz-settings`), so there's no flash of the stock skin or the wrong theme. It then reads the real settings from `browser.storage.local`, sets `data-pb-theme` for forced light/dark, and toggles `pb-layout`. On DOMContentLoaded it calls every registered layout whose `match()` returns true, and reverts them live when the setting is turned off.
- `content/lib.js` defines `globalThis.PrettyBugz`:
  - `h(tag, attrs, ...children)` builds elements (`class`, `text`, `on<event>`, other attributes).
  - `Changes` records every DOM change so it can be undone: `move`, `insert`, `wrap`, `addClass` (restores BMO's exact class string), `attr(node, name, value)`, `listen`, `observe`, `defer(undoFn)`.
  - `register({ name, match(), apply(changes) })`.
- `content/layouts/<page>.js` + `<page>.css` contain one redesign each. `content/layouts.css` holds shared building blocks (`.pb-card*`, `.pb-actionbar`, `.pb-filter`, `.pb-badge`, `.pb-module*`, query tabs) and the advanced-search and product-chooser styles.
- `popup/` holds the settings UI: `enabled`, `layouts`, `theme` (`auto|light|dark`).

## Rules for layouts

1. **Every DOM change goes through `changes`**, so `changes.undo()` restores the page byte for byte. `npm test` enforces this. Elements you create and later remove need no undo; anything done to BMO's own elements does (classes, attributes, `hidden`, inline styles, moves).
2. **Don't toggle classes on BMO elements after apply.** `classList` writes re-serialize attributes (BMO's are full of whitespace), which breaks byte-for-byte restoration. For live state on BMO elements (filtered rows, current row) use the `hidden` attribute, a `data-pb-*` attribute, `:focus-within`, or state on elements you created.
3. **Move, don't clone, interactive BMO elements** (forms, inputs, buttons with listeners). Cloning is fine for static content such as links and text shown in a new view. When a new view replaces a table, hide the table with a class instead of deleting it.
4. **Keep forms working.** Moved submit buttons must stay inside their `<form>`. BMO validation focuses invalid fields, so don't hide content that holds fields (`display: none`, collapsed steps, slides); keep BMO's own `.expert_fields` toggle in charge of what's hidden. `#commit` must stay the first submit button in the form so Enter still files the bug.
5. **Match on DOM structure**, or for `page.cgi` on the `id` query parameter (`pages.js` only accepts ids ending in `.html`, because `show_bug.cgi` also takes an `id`). Make sure `match()` can't fire on another page: `npm test` also checks that bug, home and chooser pages match nothing.
6. **Don't give created elements BMO's `module` class**; BMO's collapse JS binds to it. Use `.pb-module`.
7. Layouts can run before or after BMO's own DOMContentLoaded/jQuery `ready` code (ours waits for settings to load). Don't depend on either order. If you need a value BMO changes in its handler (e.g. link text), listen for the change or read it on the next tick.

## CSS conventions

- Scope everything: theme rules under `.pb-on`, layout rules under `.pb-on.pb-layout` plus the layout's body class (e.g. `.pb-buglist`), added with `changes.addClass(document.body, …)`.
- Win on specificity instead of `!important`; only use `!important` to beat BMO's own `!important` (e.g. button padding, `.bz_tui_hidden`).
- Use the `--pb-*` palette so light and dark both work, and check both.
- Firefox doesn't re-style `::before`/`::after` when a `:has()` condition changes: animate or rotate the element itself.
- `overflow: hidden` on a table breaks `position: sticky` headers; round the corner cells instead.
- Respect `prefers-reduced-motion` for animations.

## Code style

- `"use strict";`, one IIFE per file, double quotes, two-space indent, no framework.
- Comments only explain *why*, in one or two lines. Each layout file starts with a one-line summary of the redesign.
- Match the existing file structure: small helpers at the top, then `register({ … })`.

## Adding or changing a layout

1. Create `content/layouts/<name>.js` and `.css`, and add both to `manifest.json`. JS goes after `content/lib.js` and before `content/content.js`, which must stay last. `npm run check` verifies this.
2. Add the page to `PAGES` in `tools/harness.mjs` (URL and the expected layout name), then `npm run fixtures`.
3. Iterate with `node tools/harness.mjs shot …` in light, dark and ~700px wide.
4. `npm run check && npm run lint && npm test`.

## Testing caveats

- `npm run fixtures` needs network access. `buglist.cgi` sits behind a JavaScript bot check, so it's fetched with headless Chrome.
- Pages behind a login (`enter_bug.cgi` form, `mydashboard.html`, review pages) can't be fetched. `tools/fixtures/enter-bug.mock.html` is a hand-written mock of the BugModal create form built from BMO's template. Verify changes to login-only pages in a real browser (`npm start`).
- The harness adds our CSS after BMO's stylesheets, as Firefox does for content scripts, so equal-specificity ties go to us. Restate BMO's state rules (`:checked`, `:disabled`, …) when you override a base rule.
- The undo test runs BMO's scripts when the network is available, but fixtures are logged out; logged-in UI (tweak mode, edit mode, watch buttons) needs mocks or `npm start`.
- Screenshots are taken right at load. The harness freezes animations and transitions, and inlines BMO's icon font, but data-URL images may not be decoded yet, and `backdrop-filter` can render incorrectly in headless screenshots.
- BMO's source (templates, JS, CSS) is at https://github.com/mozilla-bteam/bmo. Check it before guessing at markup.
- If your editing tool uses JavaScript string replacement, `$$` in replacement text can collapse to `$`. Re-read edits that contain `$$` (the `$$` query helper appears in several layouts).

## Releasing

See `store/listing.md` for the AMO listing text, permissions justification, reviewer notes and the release checklist. Keep `version` in `manifest.json` and `package.json` in sync.
