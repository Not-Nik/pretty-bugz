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
    const links = [
      keyword.open ? h("a", { href: keyword.open.getAttribute("href"), text: "Open bugs", "aria-label": `Open bugs with ${keyword.name}` }) : null,
      keyword.total ? h("a", { class: "pb-kw-total", href: keyword.total.getAttribute("href"), text: `${keyword.count.toLocaleString()} total`, "aria-label": `All ${keyword.count.toLocaleString()} bugs with ${keyword.name}` }) : null,
    ].filter(Boolean);
    const card = h("article", { class: `pb-kw-card${keyword.inactive ? " pb-kw-inactive" : ""}` },
      h("header", { class: "pb-kw-head" },
        h("h2", { class: "pb-kw-heading" }, h("code", { class: "pb-kw-name", text: keyword.name })),
        keyword.inactive ? h("span", { class: "pb-kw-badge", text: "Inactive" }) : null),
      description,
      links.length ? h("footer", { class: "pb-kw-foot" }, links) : null);
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

      const hidingInactive = () => grid.classList.contains("pb-kw-hide-inactive");
      const available = () => cards.filter((c) => !(hidingInactive() && c.keyword.inactive));

      function filter() {
        const terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
        let shown = 0;
        for (const { card, keyword } of cards) {
          const match = terms.every((t) => card.dataset.search.includes(t));
          card.hidden = !match;
          if (match && !(hidingInactive() && keyword.inactive)) shown++;
        }
        const total = available().length;
        count.textContent = terms.length ? `${shown} of ${total}` : "";
        input.placeholder = `Filter ${total} keywords…`;
      }

      const toggle = document.getElementById("keywords_show_hide");
      if (toggle) {
        const holder = toggle.parentElement;
        changes.move(toggle, toolbar);
        changes.addClass(toggle, "pb-kw-toggle");
        if (holder?.tagName === "P" && !holder.textContent.trim()) changes.addClass(holder, "pb-hidden");
        // BMO's jQuery ready handler flips the link (and its text) at an unknown time relative to us,
        // and its trigger() skips native listeners, so follow the text itself.
        const sync = () => {
          grid.classList.toggle("pb-kw-hide-inactive", /^\s*Show/.test(toggle.textContent));
          filter();
        };
        changes.observe(toggle, sync, { childList: true, characterData: true, subtree: true });
        sync();
      } else {
        filter();
      }

      input.addEventListener("input", filter);
      sort.addEventListener("change", () => {
        const ordered = [...cards].sort((a, b) => sort.value === "count"
          ? b.keyword.count - a.keyword.count
          : a.keyword.name.localeCompare(b.keyword.name, undefined, { sensitivity: "base" }));
        grid.append(...ordered.map((c) => c.card));
      });

      // Links like describekeywords.cgi#crash point at the hidden table row.
      const showTarget = () => {
        let id = "";
        try {
          id = decodeURIComponent(location.hash.slice(1));
        } catch {
          return;
        }
        const target = id && cards.find((c) => c.keyword.id === id);
        if (!target) return;
        for (const c of cards) c.card.classList.toggle("pb-kw-target", c === target);
        if (target.keyword.inactive && hidingInactive()) toggle?.click();
        requestAnimationFrame(() => target.card.scrollIntoView({ block: "center" }));
      };
      showTarget();
      changes.listen(window, "hashchange", showTarget);
    },
  });
})();
