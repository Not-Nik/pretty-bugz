# Pretty Bugz

A Firefox extension that gives [bugzilla.mozilla.org](https://bugzilla.mozilla.org) a clean, modern look and rebuilds its busiest pages around how people actually use them.

![Bug list](store/screenshots/1-buglist.png)

## Features

**Theme** (every page)

- System fonts, softer colours, rounded cards, clear focus rings and tidy form controls
- Light, dark or automatic appearance
- Readable comments, status pills and a frosted header on bug pages

**Layouts** (can be turned off separately)

| Page | What changes |
| --- | --- |
| `show_bug.cgi` | A workspace: a sticky bar with status, summary and actions (plus a Comment shortcut), the fields in a right-hand rail, and the description, attachments and comments in the main column; history-only entries shrink to one line |
| `enter_bug.cgi` | One page: essentials first (Summary, Category, Description, Attachment, Security), optional modules under "More fields", and a sticky rail with a section checklist, live summary and Submit |
| `enter_bug.cgi` product chooser, `describecomponents.cgi` | Big search box, a grid of product cards you can click anywhere on |
| `buglist.cgi` | Full-width list with an honest result count (and Show all when BMO capped it), search chips with Edit, a sticky toolbar with an instant filter kept in the URL, Compact/Comfortable rows, Export/Save menus, severity stripes, `j`/`k`/Enter/`Shift+O`/`/` shortcuts, and in Change Several Bugs mode a selection bar with shift-click ranges and `x` |
| `query.cgi?format=advanced` | Type, Severity and Priority next to Product and Status, filter boxes for the lists, "N active" badges on collapsed sections, and a sticky "Your search" rail listing every criterion (click to jump, × to remove) next to Sort and Search |
| `query.cgi?format=specific` / `instant` | A search-engine style hero; instant search adds a live status, See all matching bugs (also on Enter) and "Not listed? File a bug" with the summary filled in |
| `request.cgi` | Collapsible filters, readable request rows oldest first with ages, a Group by switch (none, requestee, requester, flag, product), a sticky rail of groups with counts, and a filter box |
| `describecomponents.cgi?product=…` | Product header with quick actions, a filterable alphabetical list of components with full descriptions, A–Z jump |
| `show_activity.cgi` | A compact day-grouped change log with field chips, person filter, Hide CC, Newest first, a value history for a single field (e.g. P3 → P2 → P1), and the filter kept in the URL |
| `describekeywords.cgi` | A dense, filterable keyword table with sortable Keyword and Bugs columns and an Include inactive switch |
| `user_profile` | Profile header, stats tiles, activity-by-product bars |
| `page.cgi?id=attention.html` | A triage dashboard: count tiles only for lists that have bugs, priority tiers, and empty lists folded into one "All clear" line per tier |
| `page.cgi` help pages | Readable articles with a sticky table of contents |
| `page.cgi?id=custom_forms.html` | A card grid of custom bug forms |
| `page.cgi` reports (user activity, triage, release tracking, group members, …) | A page title, the form as a wrapping filter bar and the results as a card |

Everything is controlled from the toolbar popup: turn the theme on or off, turn the layouts on or off, and pick Auto / Light / Dark. Changes apply immediately, without reloading.

## Privacy

Pretty Bugz only runs on `https://bugzilla.mozilla.org/*`. It collects no data, makes no network requests of its own and only stores your three popup settings: in Firefox's local extension storage, plus a copy in bugzilla.mozilla.org's `localStorage` (`pretty-bugz-settings`) so the right theme applies before the page first paints.

## Install

- **From addons.mozilla.org:** search for "Pretty Bugz" once it's published.
- **From source (temporary):** open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on…** and pick `manifest.json`.

Requires Firefox 142 or later.

## Development

There is no build step: the files in `content/`, `popup/` and `icons/` are what ships.

```sh
npm install          # installs web-ext
npm start            # launches Firefox with the extension loaded
npm run check        # manifest/file consistency and syntax checks
npm run lint         # web-ext lint
npm run fixtures     # downloads real BMO pages into test/fixtures (needs network + Chrome)
npm test             # applies and reverts every layout on every fixture
npm run screenshots  # regenerates store/screenshots
npm run build        # checks, lints and packages web-ext-artifacts/pretty-bugz-<version>.xpi
npm run sign         # builds, then has addons.mozilla.org sign it for self-distribution
```

`npm run build` produces an unsigned `.xpi` and verifies it: the package must contain exactly the files in `manifest.json`, `LICENSE`, `content/`, `popup/` and `icons/`, and pass addons-linter with no warnings. Release Firefox only installs signed add-ons; the unsigned file can be loaded temporarily from `about:debugging`, installed in Developer Edition, Nightly or ESR with `xpinstall.signatures.required` set to `false`, or uploaded to addons.mozilla.org.

`npm run sign` needs AMO API credentials (from https://addons.mozilla.org/developers/addon/api/key/) in `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET`. It submits the build as an unlisted version and downloads the signed `.xpi`, which installs in any Firefox, into `web-ext-artifacts/`. The first submission registers the add-on ID in `manifest.json` with AMO for good.

The offline harness (`tools/harness.mjs`) injects the extension into saved pages and screenshots them with headless Firefox. `npm test` uses headless Chrome. By default it looks for both browsers in `/Applications`; set `FIREFOX` and `CHROME` to use other paths.

See [AGENTS.md](AGENTS.md) for architecture and conventions.

## Project layout

```
manifest.json            MV3 manifest (content scripts run at document_start)
content/theme.css        the global theme: overrides BMO's CSS custom properties
content/layouts.css      shared layout building blocks (cards, action bar, tabs, …)
content/lib.js           PrettyBugz.h / Changes / register helpers
content/layouts/*.js|css one pair per redesigned page
content/content.js       reads settings, toggles the theme, applies/reverts layouts
popup/                   toolbar popup
tools/                   test harness, checks, screenshot extras, the enter_bug mock
store/                   addons.mozilla.org listing text, icon and screenshots
```

## License

[Mozilla Public License 2.0](LICENSE). Pretty Bugz is an independent project and is not affiliated with Mozilla.
