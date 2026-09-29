"use strict";

// describekeywords.cgi: replace the long keyword table with a filterable, sortable card grid.
(() => {
  const { h, register } = globalThis.PrettyBugz;

  const clean = (text) => text.replace(/\s+/g, " ").trim();

  function parseRow(row) {
    const name = clean(row.cells[0]?.textContent ?? "");
    const description = row.cells[1];
    const inactive = row.classList.contains("keyword_inactive");
    const open = row.cells[3]?.querySelector("a");
    const total = row.cells[4]?.querySelector("a");
    return { id: row.id, name, description, inactive, open, total, count: Number(clean(total?.textContent ?? "0")) || 0 };
  }

  function buildCard(keyword) {
    const description = h("p", { class: "pb-kw-description" });
    description.append(...[...keyword.description.childNodes].map((n) => n.cloneNode(true)));
    const card = h("article", { class: `pb-kw-card${keyword.inactive ? " pb-kw-inactive" : ""}` },
      h("header", { class: "pb-kw-head" },
        h("code", { class: "pb-kw-name", text: keyword.name }),
        keyword.inactive ? h("span", { class: "pb-kw-badge", text: "Inactive" }) : null),
      description,
      h("footer", { class: "pb-kw-foot" },
        keyword.open ? h("a", { href: keyword.open.getAttribute("href"), text: "Open bugs" }) : null,
        keyword.total ? h("a", { class: "pb-kw-total", href: keyword.total.getAttribute("href"), text: `${keyword.count.toLocaleString()} total` }) : null));
    card.dataset.search = `${keyword.name} ${clean(keyword.description.textContent)}`.toLowerCase();
    return card;
  }

  register({
    name: "keywords",

    match() {
      return !!document.querySelector("#main-inner > table.standard tr.keyword_active, #main-inner > table.standard tr.keyword_inactive");
    },

    apply(changes) {
      const main = document.getElementById("main-inner");
      const table = main.querySelector(":scope > table.standard");
      const keywords = [...table.querySelectorAll("tr.keyword_active, tr.keyword_inactive")].map(parseRow);
      changes.addClass(document.body, "pb-keywords");

      const cards = keywords.map((k) => ({ keyword: k, card: buildCard(k) }));
      const grid = h("div", { class: "pb-kw-grid" }, cards.map((c) => c.card));

      const input = h("input", { type: "search", class: "pb-filter pb-kw-search", placeholder: `Filter ${keywords.length} keywords…`, "aria-label": "Filter keywords", autocomplete: "off" });
      const count = h("span", { class: "pb-filter-count", "aria-live": "polite" });
      const sort = h("select", { class: "pb-kw-sort", "aria-label": "Sort keywords" },
        h("option", { value: "name", text: "Sort: Name" }),
        h("option", { value: "count", text: "Sort: Most bugs" }));
      const toolbar = h("div", { class: "pb-kw-toolbar" }, input, count, sort);

      const hero = h("header", { class: "pb-kw-hero" },
        h("h1", { text: "Keywords" }),
        h("p", { text: "Keywords tag bugs across products. Click a count to see the bugs." }));
      const view = h("div", { class: "pb-kw-view" }, hero, toolbar, grid);
      changes.insert(view, main, table);
      changes.addClass(table, "pb-hidden");

      const toggle = document.getElementById("keywords_show_hide");
      if (toggle) {
        changes.move(toggle, toolbar);
        changes.addClass(toggle, "pb-kw-toggle");
        // BMO's jQuery handler flips the link text after ours runs, so read it on the next tick.
        const sync = () => grid.classList.toggle("pb-kw-hide-inactive", /^\s*Show/.test(toggle.textContent));
        changes.listen(toggle, "click", () => setTimeout(sync));
        sync();
      }

      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") event.preventDefault();
      });
      input.addEventListener("input", () => {
        const terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
        let shown = 0;
        for (const { card } of cards) {
          const match = terms.every((t) => card.dataset.search.includes(t));
          card.hidden = !match;
          if (match) shown++;
        }
        count.textContent = terms.length ? `${shown} of ${cards.length}` : "";
      });
      sort.addEventListener("change", () => {
        const ordered = [...cards].sort((a, b) => sort.value === "count"
          ? b.keyword.count - a.keyword.count
          : a.keyword.name.localeCompare(b.keyword.name, undefined, { sensitivity: "base" }));
        grid.append(...ordered.map((c) => c.card));
      });

      // Links like describekeywords.cgi#crash point at the hidden table row.
      const target = location.hash && cards.find((c) => `#${c.keyword.id}` === decodeURIComponent(location.hash));
      if (target) {
        target.card.classList.add("pb-kw-target");
        requestAnimationFrame(() => target.card.scrollIntoView({ block: "center" }));
      }
    },
  });
})();
