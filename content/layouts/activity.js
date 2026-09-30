"use strict";

// show_activity.cgi: turn the Who/When/What/Removed/Added table (rowspan-grouped) into a
// day-grouped timeline of change cards, with field chips and a person filter.
(() => {
  const { h, register, parseTime } = globalThis.PrettyBugz;

  const $ = (selector, root = document) => root.querySelector(selector);
  const clean = (text) => text.replace(/\s+/g, " ").trim();

  const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

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

  function buildCard(set) {
    const date = parseTime(set.when);
    const list = h("ul", { class: "pb-ac-changes" }, set.changes.map((change) => {
      const removed = value(change.removed, "removed");
      const added = value(change.added, "added");
      const refs = change.refs.map((ref) => h("a", { class: "pb-ac-ref", href: ref.getAttribute("href"), text: clean(ref.textContent) }));
      const item = h("li", { class: "pb-ac-change" },
        h("span", { class: "pb-ac-field" }, refs, refs.length ? " " : null, change.field),
        h("span", { class: "pb-ac-values" }, removed, removed && added ? h("span", { class: "pb-ac-arrow", text: "→", "aria-hidden": "true" }) : null, added));
      item.dataset.field = change.field;
      return item;
    }));

    const card = h("article", { class: "pb-ac-card" },
      h("span", { class: "pb-ac-avatar", style: `--pb-hue: ${hue(set.who)}`, text: set.who.charAt(0).toUpperCase(), "aria-hidden": "true" }),
      h("div", { class: "pb-ac-body" },
        h("header", { class: "pb-ac-head" },
          h("strong", { class: "pb-ac-who", text: set.who }),
          date
            ? h("time", { class: "pb-ac-when", datetime: date.instant.toISOString(), title: set.when }, date.time, h("span", { class: "pb-ac-ago", text: ` · ${relative(date.instant)}` }))
            : h("span", { class: "pb-ac-when", text: set.when })),
        list));
    card.dataset.who = set.who;
    return { card, date, fields: set.changes.map((c) => c.field) };
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

      const cards = sets.map(buildCard);
      const counts = new Map();
      for (const { fields } of cards) {
        for (const field of new Set(fields)) counts.set(field, (counts.get(field) ?? 0) + 1);
      }
      const people = [...new Set(sets.map((s) => s.who))].sort((a, b) => a.localeCompare(b));

      const active = new Set();
      const chips = h("div", { class: "pb-ac-chips", role: "group", "aria-label": "Filter by field" });
      const sorted = [...counts].sort((a, b) => b[1] - a[1]);
      for (const [field, count] of sorted) {
        const chip = h("button", { type: "button", class: "pb-ac-chip", "aria-pressed": "false" }, field, h("span", { class: "pb-ac-chip-count", text: String(count) }));
        chip.addEventListener("click", () => {
          if (active.has(field)) active.delete(field);
          else active.add(field);
          chip.setAttribute("aria-pressed", String(active.has(field)));
          filter();
        });
        chips.append(chip);
      }
      const VISIBLE_CHIPS = 8;
      if (sorted.length > VISIBLE_CHIPS) {
        chips.classList.add("pb-ac-collapsed");
        const more = h("button", { type: "button", class: "pb-ac-more", "aria-expanded": "false", text: `+${sorted.length - VISIBLE_CHIPS} more` });
        more.addEventListener("click", () => {
          const collapsed = chips.classList.toggle("pb-ac-collapsed");
          more.setAttribute("aria-expanded", String(!collapsed));
          // All chips can take a third of the screen; don't keep that stuck to the top.
          toolbar.classList.toggle("pb-ac-static", !collapsed);
          more.textContent = collapsed ? `+${sorted.length - VISIBLE_CHIPS} more` : "Fewer";
        });
        chips.append(more);
      }

      const hideCc = h("input", { type: "checkbox", id: "pb-ac-hide-cc" });
      hideCc.addEventListener("change", filter);
      const ccToggle = counts.has("CC")
        ? h("label", { class: "pb-ac-hide-cc", for: "pb-ac-hide-cc" }, hideCc, "Hide CC changes")
        : null;
      const who = h("select", { class: "pb-ac-who-filter", "aria-label": "Filter by person" },
        h("option", { value: "", text: `Everyone (${people.length})` }),
        people.map((p) => h("option", { value: p, text: p })));
      const summary = h("span", { class: "pb-filter-count", "aria-live": "polite" });
      const toolbar = h("div", { class: "pb-ac-toolbar" }, chips, h("div", { class: "pb-ac-toolbar-end" }, summary, ccToggle, who));
      who.addEventListener("change", filter);

      const timeline = h("div", { class: "pb-ac-timeline" });
      let lastDay = "";
      for (const { card, date } of cards) {
        const day = date ? dayFormat.format(date.day) : "";
        if (day && day !== lastDay) {
          timeline.append(h("h2", { class: "pb-ac-day", text: day }));
          lastDay = day;
        }
        timeline.append(card);
      }

      function filter() {
        let shown = 0;
        for (const { card } of cards) {
          let visible = !who.value || card.dataset.who === who.value;
          let items = 0;
          for (const item of card.querySelectorAll(".pb-ac-change")) {
            const match = (!active.size || active.has(item.dataset.field)) && !(hideCc.checked && item.dataset.field === "CC");
            item.hidden = !match;
            if (match) items++;
          }
          visible &&= items > 0;
          card.hidden = !visible;
          if (visible) shown++;
        }
        for (const day of timeline.querySelectorAll(".pb-ac-day")) {
          let next = day.nextElementSibling;
          let any = false;
          while (next && !next.matches(".pb-ac-day")) {
            if (!next.hidden) any = true;
            next = next.nextElementSibling;
          }
          day.hidden = !any;
        }
        summary.textContent = active.size || who.value || hideCc.checked ? `${shown} of ${cards.length} edits` : `${cards.length} edits`;
      }
      filter();

      const view = h("div", { class: "pb-ac-view" }, hero, toolbar, timeline);
      changes.insert(view, main, main.firstChild);
      for (const link of main.querySelectorAll(":scope > p > a.bz_bug_link")) {
        if (/^Back to /.test(clean(link.textContent))) changes.addClass(link.parentElement, "pb-hidden");
      }
      changes.addClass(table, "pb-hidden");

      // Sticky day labels sit below the toolbar, whose height changes as chips wrap or expand.
      const resize = new ResizeObserver(() => view.style.setProperty("--pb-ac-toolbar-height", `${toolbar.offsetHeight}px`));
      resize.observe(toolbar);
      changes.defer(() => resize.disconnect());
    },
  });
})();
