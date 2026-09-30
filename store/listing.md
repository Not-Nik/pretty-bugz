# addons.mozilla.org listing

Copy these fields into the AMO Developer Hub when submitting a new version.

## Basic information

- **Name:** Pretty Bugz
- **Add-on URL slug:** `pretty-bugz`
- **Summary** (max 250 characters):

  > A modern theme and redesigned, more usable layouts for bugzilla.mozilla.org: cleaner bug pages, a streamlined new-bug form, filterable bug lists, a triage dashboard and dark mode.

- **Categories (Firefox):** Appearance, Other
- **Tags:** bugzilla, mozilla, developer tools, dark mode, productivity, theme
- **Homepage:** https://github.com/Not-Nik/pretty-bugz
- **Support site:** https://github.com/Not-Nik/pretty-bugz/issues
- **License:** Mozilla Public License 2.0
- **Is this add-on experimental?** No
- **Does this add-on require payment, non-free services or software?** No

## Description

AMO accepts a limited Markdown subset in the description.

```markdown
Pretty Bugz gives bugzilla.mozilla.org a clean, modern look and rebuilds its busiest pages around how people actually use them.

**A modern theme**
- System fonts, softer colours, rounded cards and clear focus states
- Light, dark or automatic appearance, switchable from the toolbar
- Readable comments, status pills and tidy form controls on every bug

**Redesigned pages** (can be turned off separately)
- **Bugs:** a sticky bar with the status, summary and actions, the fields in a side rail next to the comments, and one-line history entries
- **File a bug:** the essentials on one page, optional fields tucked under "More fields", and a sticky checklist that shows what's still required next to the Submit button
- **Bug lists:** result count and search terms up top, a sticky toolbar, instant row filtering, Export and Save menus, and j/k keyboard navigation
- **Advanced search:** grouped cards, filter boxes for long product and component lists, "N active" badges and a sticky search bar
- **What needs my attention:** a triage dashboard with counts per list, priority tiers and collapsed empty lists
- **Request queue, components, keywords, bug history, user profiles and help pages:** filterable cards, a timeline, stats tiles and tables of contents

**Private by design**
Pretty Bugz only runs on bugzilla.mozilla.org, collects no data, makes no network requests of its own and stores nothing but your three settings, on your device only.

Pretty Bugz is an independent project and is not affiliated with Mozilla.
```

## Screenshots

Upload in this order from `store/screenshots/` (1280×800):

| File | Caption |
| --- | --- |
| `1-buglist.png` | Bug lists with search chips, a sticky toolbar, instant filtering and keyboard navigation |
| `2-bug-dark.png` | Bug pages in dark mode |
| `3-new-bug.png` | Filing a bug with a live checklist and summary |
| `4-attention.png` | "What needs my attention" as a triage dashboard |
| `5-advanced-search.png` | Advanced search with grouped sections and filterable lists |
| `6-components-dark.png` | Browsing a product's components |
| `7-history.png` | Bug history as a filterable timeline |

The listing icon is `store/icon-128.png` (the extension itself ships `icons/icon.svg`).

## Privacy

- **Data collection:** none (declared in `manifest.json` as `data_collection_permissions: { required: ["none"] }`).
- **Privacy policy:** not required, because no data is collected or transmitted. If AMO asks for one, use:

  > Pretty Bugz does not collect, store or transmit any personal data. Its only stored data is the user's display preferences (theme on/off, layouts on/off, light/dark/auto), kept on the user's device in Firefox's local extension storage, with a copy in bugzilla.mozilla.org's localStorage so the chosen theme applies before the page first paints.

## Permissions justification

| Permission | Why |
| --- | --- |
| `storage` | Remembers the three popup settings (theme, layouts, appearance). |
| `https://bugzilla.mozilla.org/*` (host) | Injects the theme stylesheet and layout scripts into BMO pages. No other site is touched. |

## Notes to reviewer

```text
- No build step, bundler, minifier or third-party code: the submitted files are the source.
  Source: https://github.com/Not-Nik/pretty-bugz (package with `npx web-ext build`).
- No remote code, no eval, no network requests. Content scripts only restyle and rearrange
  bugzilla.mozilla.org's existing DOM; every change is recorded and reverted when the user
  turns layouts off.
- To test: install, open https://bugzilla.mozilla.org/buglist.cgi?quicksearch=tabs or any bug,
  and use the toolbar popup to switch the theme, layouts and appearance.
  The new-bug form needs a BMO login (https://bugzilla.mozilla.org/enter_bug.cgi?product=Firefox).
```

## Release checklist

1. Bump `version` in `manifest.json` and `package.json`.
2. `npm run check && npm run lint && npm test`
3. `npm run build` → upload `web-ext-artifacts/pretty_bugz-<version>.zip`.
4. Refresh screenshots if the UI changed (see AGENTS.md, "Store screenshots").
