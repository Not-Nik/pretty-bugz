"use strict";

// show_activity.cgi: the Who/When/What/Removed/Added table (rowspan-grouped) as a compact,
// day-grouped change log with field chips, a person filter, newest-first ordering, a value
// history for a single field, and the filter kept in the URL.
(() => {
  const { h, register, parseTime } = globalThis.PrettyBugz;

  const $ = (selector, root = document) => root.querySelector(selector);
  const clean = (text) => text.replace(/\s+/g, " ").trim();

  const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  const VISIBLE_CHIPS = 8;

  function relative(date) {
    const seconds = (Date.now() - date.getTime()) / 1000;
    const units = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
    for (const [unit, size] of units) {
      if (seconds >= size) return relativeFormat.format(-Math.floor(seconds / size), unit);
    }
    return "just now";
  }

  // "What" cells can start with an Attachment or Comment link; keep it as a reference and use the
  // rest as the field name. Attachment flags join bug flags under "Flags".
  function parseField(cell) {
    const refs = [...cell.querySelectorAll("a")];
    let rest = cell.textContent;
    for (const ref of refs) rest = rest.replace(ref.textContent, "");
    rest = clean(rest);
    const isComment = refs.some((ref) => /^Comment \d+/.test(clean(ref.textContent)));
    const field = !refs.length || rest === "Flags" || /^Attachment\b/.test(rest) ? rest : `${isComment ? "Comment" : "Attachment"} ${rest}`;
    return { field: field || clean(cell.textContent), refs };
  }

  function hue(name) {
    let hash = 0;
    for (const char of name) hash = (hash * 31 + char.codePointAt(0)) % 360;
    return hash;
  }

  function parseTable(table) {
    const sets = [];
    for (const row of [...table.rows].slice(1)) {
      const cells = [...row.cells];
      if (cells.length >= 5) {
        sets.push({ who: clean(cells[0].textContent), when: clean(cells[1].textContent), changes: [] });
        cells.splice(0, 2);
      }
      const set = sets.at(-1);
      if (!set || cells.length < 3) continue;
      set.changes.push({ ...parseField(cells[0]), removed: cells[1], added: cells[2] });
    }
    return sets;
  }

  // <del>/<ins> plus hidden text, so the change isn't conveyed by colour and strike-through alone
  // (BMO also strikes through links to closed bugs).
  function value(cell, kind) {
    if (!clean(cell.textContent)) return null;
    const node = h(kind === "removed" ? "del" : "ins", { class: `pb-ac-value pb-ac-${kind}` },
      h("span", { class: "pb-visually-hidden", text: kind === "removed" ? "Removed: " : "Added: " }));
    node.append(...[...cell.childNodes].map((child) => child.cloneNode(true)));
    return node;
  }

  function buildEntry(set) {
    const date = parseTime(set.when);
    const items = set.changes.map((change) => {
      const removed = value(change.removed, "removed");
      const added = value(change.added, "added");
      const refs = change.refs.map((ref) => h("a", { class: "pb-ac-ref", href: ref.getAttribute("href"), text: clean(ref.textContent) }));
      const item = h("li", { class: "pb-ac-change" },
        h("span", { class: "pb-ac-field" }, change.field, refs.length ? " " : null, refs),
        h("span", { class: "pb-ac-values" }, removed, removed && added ? h("span", { class: "pb-ac-arrow", text: "→", "aria-hidden": "true" }) : null, added));
      item.dataset.field = change.field;
      return item;
    });

    const entry = h("li", { class: "pb-ac-entry" },
      date
        ? h("time", { class: "pb-ac-when", datetime: date.instant.toISOString(), title: `${set.when} (${relative(date.instant)})`, text: date.time.replace(/ [A-Z]+$/, "") })
        : h("span", { class: "pb-ac-when", text: set.when }),
      h("span", { class: "pb-ac-who" },
        h("span", { class: "pb-ac-avatar", style: `--pb-hue: ${hue(set.who)}`, text: set.who.charAt(0).toUpperCase(), "aria-hidden": "true" }),
        h("span", { class: "pb-ac-name", text: set.who })),
      h("ul", { class: "pb-ac-changes" }, items));
    entry.dataset.who = set.who;
    return { entry, date, set, day: date ? dayFormat.format(date.day) : "" };
  }

  // Filters live in the URL hash (fields=…&who=…&hidecc=1&newest=1) so a view can be shared.
  function readHash() {
    const params = new URLSearchParams(location.hash.slice(1));
    return {
      fields: new Set(params.get("fields")?.split(",").filter(Boolean) ?? []),
      who: params.get("who") ?? "",
      hideCc: params.get("hidecc") === "1",
      newest: params.get("newest") === "1",
    };
  }

  function writeHash(state, originalHash) {
    const params = new URLSearchParams();
    if (state.fields.size) params.set("fields", [...state.fields].join(","));
    if (state.who) params.set("who", state.who);
    if (state.hideCc) params.set("hidecc", "1");
    if (state.newest) params.set("newest", "1");
    const url = new URL(location.href);
    url.hash = params.size ? params.toString() : originalHash;
    if (url.href !== location.href) history.replaceState(history.state, "", url.href);
  }

  // "Priority: P3 → P2 → P1": one field's values over time, oldest first.
  function fieldHistory(entries, field) {
    const steps = [];
    for (const { set, date } of entries) {
      for (const change of set.changes) {
        if (change.field !== field) continue;
        const removed = clean(change.removed.textContent);
        const added = clean(change.added.textContent);
        if (!steps.length && removed) steps.push({ text: removed });
        if (added || !steps.length) steps.push({ text: added || "(none)", who: set.who, when: date?.time ?? set.when });
      }
    }
    return steps;
  }

  register({
    name: "activity",

    // The mid-air collision page embeds the same table, so check the path too.
    match() {
      if (!location.pathname.endsWith("/show_activity.cgi")) return false;
      const headers = [...(document.querySelector("#main-inner > table.standard tr")?.cells ?? [])].map((c) => clean(c.textContent));
      return headers.join("|") === "Who|When|What|Removed|Added";
    },

    apply(changes) {
      const main = document.getElementById("main-inner");
      const table = $(":scope > table.standard", main);
      const back = $(":scope > p > a.bz_bug_link", main);
      const sets = parseTable(table);
      if (!sets.length) return;
      changes.addClass(document.body, "pb-activity");

      const bugId = back?.getAttribute("href")?.match(/id=(\d+)/)?.[1];
      const title = back?.getAttribute("title")?.replace(/^[A-Z]+(?: [A-Z]+)? - /, "") ?? "";
      const hero = h("header", { class: "pb-ac-hero" },
        h("div", {},
          h("span", { class: "pb-ac-kicker", text: bugId ? `Bug ${bugId} · History` : "History" }),
          h("h1", { class: "pb-ac-title", text: title || "Bug activity" })),
        back ? h("a", { class: "pb-ac-back", href: back.getAttribute("href"), text: "← Back to bug" }) : null);

      const entries = sets.map(buildEntry);
      const counts = new Map();
      for (const { set } of entries) {
        for (const field of new Set(set.changes.map((c) => c.field))) counts.set(field, (counts.get(field) ?? 0) + 1);
      }
      const people = [...new Set(sets.map((s) => s.who))].sort((a, b) => a.localeCompare(b));
      const originalHash = location.hash;
      const state = readHash();

      const chips = h("div", { class: "pb-ac-chips", role: "group", "aria-label": "Filter by field" });
      const chipButtons = new Map();
      const sorted = [...counts].sort((a, b) => b[1] - a[1]);
      for (const [field, count] of sorted) {
        const chip = h("button", { type: "button", class: "pb-ac-chip", "aria-pressed": String(state.fields.has(field)) }, field, h("span", { class: "pb-ac-chip-count", text: String(count) }));
        chip.addEventListener("click", () => {
          if (state.fields.has(field)) state.fields.delete(field);
          else state.fields.add(field);
          chip.setAttribute("aria-pressed", String(state.fields.has(field)));
          render();
        });
        chipButtons.set(field, chip);
        chips.append(chip);
      }
      const toolbar = h("div", { class: "pb-ac-toolbar" });
      if (sorted.length > VISIBLE_CHIPS) {
        chips.classList.add("pb-ac-collapsed");
        const more = h("button", { type: "button", class: "pb-ac-more", "aria-expanded": "false", text: `+${sorted.length - VISIBLE_CHIPS} more` });
        more.addEventListener("click", () => {
          const collapsed = chips.classList.toggle("pb-ac-collapsed");
          more.setAttribute("aria-expanded", String(!collapsed));
          more.textContent = collapsed ? `+${sorted.length - VISIBLE_CHIPS} more` : "Fewer";
          // All chips can take a third of the screen; don't keep that stuck to the top.
          toolbar.classList.toggle("pb-ac-static", !collapsed);
        });
        chips.append(more);
      }

      const hideCc = h("input", { type: "checkbox", id: "pb-ac-hide-cc" });
      hideCc.checked = state.hideCc;
      const ccToggle = counts.has("CC") ? h("label", { class: "pb-ac-option", for: "pb-ac-hide-cc" }, hideCc, "Hide CC") : null;
      const newest = h("input", { type: "checkbox", id: "pb-ac-newest" });
      newest.checked = state.newest;
      const who = h("select", { class: "pb-ac-who-filter", "aria-label": "Filter by person" },
        h("option", { value: "", text: `Everyone (${people.length})` }),
        people.map((p) => h("option", { value: p, text: p, selected: p === state.who })));
      const summary = h("span", { class: "pb-filter-count", "aria-live": "polite" });
      toolbar.append(chips, h("div", { class: "pb-ac-toolbar-end" },
        summary, ccToggle, h("label", { class: "pb-ac-option", for: "pb-ac-newest" }, newest, "Newest first"), who));
      for (const control of [hideCc, newest, who]) {
        control.addEventListener("change", () => {
          state.hideCc = hideCc.checked;
          state.newest = newest.checked;
          state.who = who.value;
          render();
        });
      }

      const valueHistory = h("section", { class: "pb-ac-history", hidden: true, "aria-live": "polite" });
      const log = h("div", { class: "pb-ac-log" });

      // Group consecutive entries per day once; the order toggle only reverses the groups.
      const days = [];
      for (const item of entries) {
        if (!days.length || days.at(-1).day !== item.day) days.push({ day: item.day, heading: h("h2", { class: "pb-ac-day", text: item.day || "Unknown date" }), list: h("ol", { class: "pb-ac-list" }), items: [] });
        days.at(-1).items.push(item);
      }

      function render() {
        let shown = 0;
        for (const { entry, set } of entries) {
          let visible = !state.who || set.who === state.who;
          let items = 0;
          for (const item of entry.querySelectorAll(".pb-ac-change")) {
            const match = (!state.fields.size || state.fields.has(item.dataset.field)) && !(state.hideCc && item.dataset.field === "CC");
            item.hidden = !match;
            if (match) items++;
          }
          visible &&= items > 0;
          entry.hidden = !visible;
          if (visible) shown++;
        }

        // Consecutive entries by the same person read as one block.
        const ordered = state.newest ? [...days].reverse() : days;
        const groups = [];
        let previous = null;
        for (const day of ordered) {
          const items = state.newest ? [...day.items].reverse() : day.items;
          day.list.replaceChildren(...items.map((item) => item.entry));
          let any = false;
          previous = null;
          for (const { entry, set } of items) {
            if (entry.hidden) continue;
            entry.classList.toggle("pb-ac-same", previous === set.who);
            previous = set.who;
            any = true;
          }
          day.heading.hidden = day.list.hidden = !any;
          groups.push(day.heading, day.list);
        }
        log.replaceChildren(...groups);

        const filtered = state.fields.size || state.who || state.hideCc;
        summary.textContent = filtered ? `${shown} of ${entries.length} edits` : `${entries.length} edits`;

        const [only] = state.fields;
        const steps = state.fields.size === 1 ? fieldHistory(entries, only) : [];
        valueHistory.hidden = steps.length < 2;
        if (!valueHistory.hidden) {
          valueHistory.replaceChildren(
            h("h2", { class: "pb-ac-history-title", text: `${only} over time` }),
            h("ol", { class: "pb-ac-history-steps" }, steps.map((step) => h("li", { title: step.who ? `${step.who}, ${step.when}` : "" }, h("span", { text: step.text })))));
        }
        writeHash(state, originalHash);
      }

      const view = h("div", { class: "pb-ac-view" }, hero, toolbar, valueHistory, log);
      changes.insert(view, main, main.firstChild);
      for (const link of main.querySelectorAll(":scope > p > a.bz_bug_link")) {
        if (/^Back to /.test(clean(link.textContent))) changes.addClass(link.parentElement, "pb-hidden");
      }
      changes.addClass(table, "pb-hidden");
      render();
      changes.defer(() => {
        const url = new URL(location.href);
        url.hash = originalHash;
        if (url.href !== location.href) history.replaceState(history.state, "", url.href);
      });

      // Sticky day labels sit below the toolbar, whose height changes as chips wrap or expand.
      const resize = new ResizeObserver(() => view.style.setProperty("--pb-ac-toolbar-height", `${toolbar.offsetHeight}px`));
      resize.observe(toolbar);
      changes.defer(() => resize.disconnect());
    },
  });
})();
