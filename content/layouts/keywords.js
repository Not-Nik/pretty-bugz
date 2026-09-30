"use strict";

// describekeywords.cgi: the keyword glossary as a dense, filterable table with sortable Name and
// Bugs columns, full descriptions, and an "Include inactive" switch of our own.
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

  function buildRow(keyword) {
    const description = h("td", { class: "pb-kw-description" });
    description.append(...[...keyword.description.childNodes].map((n) => n.cloneNode(true)));
    const row = h("tr", { class: `pb-kw-row${keyword.inactive ? " pb-kw-inactive" : ""}` },
      h("th", { scope: "row", class: "pb-kw-keyword" },
        h("code", { class: "pb-kw-name", text: keyword.name }),
        keyword.inactive ? h("span", { class: "pb-kw-badge", text: "Inactive" }) : null),
      description,
      h("td", { class: "pb-kw-count" },
        keyword.total ? h("a", { href: keyword.total.getAttribute("href"), text: keyword.count.toLocaleString(), "aria-label": `All ${keyword.count.toLocaleString()} bugs with ${keyword.name}` }) : "0"),
      h("td", { class: "pb-kw-open" },
        keyword.open ? h("a", { href: keyword.open.getAttribute("href"), text: "Open bugs", "aria-label": `Open bugs with ${keyword.name}` }) : null));
    row.dataset.search = `${keyword.name} ${clean(keyword.description.textContent)}`.toLowerCase();
    return row;
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

      const rows = keywords.map((keyword) => ({ keyword, row: buildRow(keyword) }));
      const tbody = h("tbody", {}, rows.map((r) => r.row));
      let sortKey = "name";
      const sortButton = (key, label) => h("button", { type: "button", class: "pb-kw-sort", "data-key": key, text: label });
      const nameHeader = h("th", { scope: "col", "aria-sort": "ascending" }, sortButton("name", "Keyword"));
      const countHeader = h("th", { scope: "col", class: "pb-kw-count" }, sortButton("count", "Bugs"));
      const list = h("table", { class: "pb-kw-table" },
        h("thead", {}, h("tr", {}, nameHeader, h("th", { scope: "col", text: "Description" }), countHeader, h("th", { scope: "col" }, h("span", { class: "pb-visually-hidden", text: "Open bugs" })))),
        tbody);

      const input = h("input", { type: "search", class: "pb-filter pb-kw-search", "aria-label": "Filter keywords", autocomplete: "off" });
      const count = h("span", { class: "pb-filter-count", "aria-live": "polite" });
      const inactive = h("input", { type: "checkbox", id: "pb-kw-inactive" });
      const toolbar = h("div", { class: "pb-kw-toolbar" }, input, count,
        h("label", { class: "pb-kw-toggle", for: "pb-kw-inactive" }, inactive, "Include inactive keywords"));
      const empty = h("p", { class: "pb-kw-empty", hidden: true, text: "No keywords match the filter." });

      const hero = h("header", { class: "pb-kw-hero" },
        h("h1", { text: "Keywords" }),
        h("p", { text: "Keywords tag bugs across products. Click a count to see the bugs." }));
      const view = h("div", { class: "pb-kw-view" }, hero, toolbar, list, empty);
      changes.insert(view, main, table);
      changes.addClass(table, "pb-hidden");

      // Our own switch replaces BMO's show/hide link, whose state its ready handler sets at an
      // unknown time relative to us.
      const bmoToggle = document.getElementById("keywords_show_hide");
      const holder = bmoToggle?.closest("p");
      if (holder) changes.addClass(holder, "pb-hidden");

      function filter() {
        const terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
        let shown = 0;
        let available = 0;
        for (const { row, keyword } of rows) {
          const included = inactive.checked || !keyword.inactive;
          const match = included && terms.every((t) => row.dataset.search.includes(t));
          row.hidden = !match;
          if (included) available++;
          if (match) shown++;
        }
        count.textContent = terms.length ? `${shown} of ${available}` : "";
        input.placeholder = `Filter ${available} keywords…`;
        empty.hidden = shown > 0;
      }

      function sort(key) {
        sortKey = key;
        const ordered = [...rows].sort((a, b) => key === "count"
          ? b.keyword.count - a.keyword.count
          : a.keyword.name.localeCompare(b.keyword.name, undefined, { sensitivity: "base" }));
        tbody.append(...ordered.map((r) => r.row));
        nameHeader.setAttribute("aria-sort", key === "name" ? "ascending" : "none");
        countHeader.setAttribute("aria-sort", key === "count" ? "descending" : "none");
      }

      list.addEventListener("click", (event) => {
        const button = event.target.closest(".pb-kw-sort");
        if (button && button.dataset.key !== sortKey) sort(button.dataset.key);
      });
      input.addEventListener("input", filter);
      inactive.addEventListener("change", filter);
      filter();

      // Links like describekeywords.cgi#crash point at the hidden table row.
      const showTarget = () => {
        let id = "";
        try {
          id = decodeURIComponent(location.hash.slice(1));
        } catch {
          return;
        }
        const target = id && rows.find((r) => r.keyword.id === id);
        if (!target) return;
        for (const r of rows) r.row.classList.toggle("pb-kw-target", r === target);
        if (target.keyword.inactive && !inactive.checked) {
          inactive.checked = true;
          filter();
        }
        requestAnimationFrame(() => target.row.scrollIntoView({ block: "center" }));
      };
      showTarget();
      changes.listen(window, "hashchange", showTarget);
    },
  });
})();
