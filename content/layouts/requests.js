"use strict";

// request.cgi (flag request queue): filters folded into a collapsible panel, each group as a
// card of readable request rows (bug first, then who/what/when with relative ages), plus an
// instant filter and a group jump menu.
(() => {
  const { h, register, parseTime } = globalThis.PrettyBugz;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clean = (text) => text.replace(/\s+/g, " ").trim();
  const STATUSES = ["UNCONFIRMED", "NEW", "ASSIGNED", "REOPENED", "RESOLVED", "VERIFIED", "CLOSED"];

  function relativeAge(date) {
    const days = (Date.now() - date.getTime()) / 86400000;
    if (days < 1) return "today";
    if (days < 2) return "yesterday";
    if (days < 30) return `${Math.floor(days)} days ago`;
    if (days < 365) return `${Math.floor(days / 30)} mo ago`;
    const years = Math.floor(days / 365);
    return `${years} ${years === 1 ? "year" : "years"} ago`;
  }

  function person(text) {
    const value = clean(text);
    const nick = value.match(/\[:([^\]\s]+)/)?.[1];
    const name = value.replace(/\s*<[^>]*>\s*$/, "").replace(/\s*\[[^\]]*\]+/g, "").trim();
    return { name: name || value, nick, full: value };
  }

  function buildItem(row, headers) {
    const cells = [...row.cells];
    const cell = (label) => cells[headers.indexOf(label)];
    const bugLink = $("a[href*='show_bug.cgi']", cell("Bug") ?? row);
    const bugText = clean(bugLink?.textContent ?? "");
    const bugClass = bugLink?.classList.contains("bz_secure") ? "pb-rq-bug bz_secure" : "pb-rq-bug";
    const [, id, meta = "", summary = bugText] = bugText.match(/^(\d+)\s*\(([^)]*)\):\s*(.*)$/) ?? [];
    const [type, priority, severity] = meta.split("/");
    const status = STATUSES.find((s) => row.classList.contains(`bz_${s}`));

    const pills = h("span", { class: "pb-rq-pills" });
    if (bugLink?.classList.contains("bz_secure")) pills.append(h("span", { class: "pb-rq-pill pb-rq-secure", text: "Restricted" }));
    if (status) pills.append(h("span", { class: `pb-rq-status pb-rq-status-${status.toLowerCase()}`, text: status }));
    for (const value of [type, priority, severity]) {
      if (value && value !== "--") pills.append(h("span", { class: "pb-rq-pill", text: value }));
    }

    const facts = h("div", { class: "pb-rq-facts" });
    for (const label of ["Flag", "Requester", "Requestee", "Product/Component"]) {
      const source = cell(label);
      if (!source || !clean(source.textContent)) continue;
      const who = label === "Requester" || label === "Requestee" ? person(source.textContent) : null;
      facts.append(h(
        "span",
        { class: "pb-rq-fact", title: who?.full ?? clean(source.textContent) },
        h("span", { class: "pb-rq-fact-label", text: label === "Product/Component" ? "In" : label === "Requester" ? "From" : label === "Requestee" ? "To" : "Flag" }),
        who ? `${who.name}${who.nick ? ` (:${who.nick})` : ""}` : clean(source.textContent),
      ));
    }

    const attachment = cell("Attachment");
    const attachmentLinks = attachment ? $$("a", attachment) : [];
    if (attachmentLinks.length) {
      const links = attachmentLinks.map((a) => h("a", { href: a.getAttribute("href"), text: clean(a.textContent) }));
      facts.append(h("span", { class: "pb-rq-fact pb-rq-attachment" },
        h("span", { class: "pb-rq-fact-label", text: "Attachment" }),
        ...links.flatMap((link, i) => (i ? [" · ", link] : [link]))));
    }

    const opened = cell("Opened");
    const date = opened ? parseTime(opened.textContent)?.instant : null;
    const age = date ? (Date.now() - date.getTime()) / 86400000 : 0;
    const ageNode = date
      ? h("time", { class: `pb-rq-age${age > 90 ? " pb-rq-stale" : age > 14 ? " pb-rq-old" : ""}`, datetime: date.toISOString(), title: clean(opened.textContent), text: relativeAge(date) })
      : null;

    const item = h(
      "li",
      { class: `pb-rq-item${status && ["RESOLVED", "VERIFIED", "CLOSED"].includes(status) ? " pb-rq-closed" : ""}` },
      h(
        "div",
        { class: "pb-rq-main" },
        h(
          "a",
          { class: bugClass, href: bugLink?.getAttribute("href") ?? "#" },
          id ? h("span", { class: "pb-rq-id", text: id }) : null,
          h("span", { class: "pb-rq-summary", text: summary }),
        ),
        pills,
      ),
      facts,
      ageNode,
    );
    item.dataset.search = clean(row.textContent).toLowerCase();
    return item;
  }

  function buildFilters(main, hasResults, changes) {
    const form = $("form#request_form", main);
    if (!form) return;
    const union = form.querySelector('input[name="do_union"]:checked')?.value === "1";
    const summaryText = [...form.elements]
      .filter((el) => (el.tagName === "SELECT" || el.type === "text") && el.value && el.value !== "all" && el.name !== "group")
      .map((el) => {
        const label = clean(el.closest("td")?.previousElementSibling?.textContent ?? el.name).replace(/:$/, "");
        const value = el.tagName === "SELECT" ? clean(el.options[el.selectedIndex]?.text ?? el.value) : el.value;
        return `${label}: ${value}`;
      })
      .join(union ? " or " : " · ");

    // Without a query (or with no matches) the form is the only thing on the page.
    const details = h(
      "details",
      { class: "pb-card pb-rq-filters", open: !hasResults },
      h("summary", { class: "pb-card-header" },
        h("span", { class: "pb-card-title", text: "Filters" }),
        h("span", { class: "pb-rq-filter-summary", text: summaryText || "All requests" })),
    );
    const intro = form.previousElementSibling;
    if (intro?.tagName === "P") changes.addClass(intro, "pb-rq-note");

    const body = h("div", { class: "pb-card-body" });
    details.append(body);
    changes.insert(details, form.parentNode, form);
    changes.move(form, body);
    const footnote = $(":scope > p", form);
    if (footnote) changes.addClass(footnote, "pb-rq-note");
  }

  function buildGroups(main, changes) {
    const tables = $$(":scope > table.standard", main);
    if (!tables.length) return [];

    const container = h("div", { class: "pb-rq-groups" });
    changes.insert(container, tables[0].parentNode, tables[0].previousElementSibling?.tagName === "H3" ? tables[0].previousElementSibling : tables[0]);

    return tables.map((table, index) => {
      const heading = table.previousElementSibling?.tagName === "H3" ? table.previousElementSibling : null;
      const listLink = table.nextElementSibling?.matches("a[href*='buglist.cgi']") ? table.nextElementSibling : null;
      const [headerRow, ...rows] = [...table.rows];
      const headers = [...headerRow.cells].map((c) => clean(c.textContent));
      // Only the first colon separates kind and name: "Product/Component: Firefox: Tabbed Browser".
      const headingText = clean(heading?.textContent ?? "");
      const colon = headingText.indexOf(":");
      const kind = colon < 0 ? "" : headingText.slice(0, colon);
      const name = colon < 0 ? headingText : headingText.slice(colon + 1).trim();

      const list = h("ul", { class: "pb-rq-list" }, rows.filter((r) => r.classList.contains("bz_bugitem")).map((r) => buildItem(r, headers)));
      const count = h("span", { class: "pb-badge", text: String(list.children.length) });
      const header = h("header", { class: "pb-card-header" },
        h("span", { class: "pb-rq-kind", text: kind }),
        h("h2", { class: "pb-card-title", text: name || "None" }),
        count);
      const card = h("section", { class: "pb-card pb-rq-group", id: `pb-rq-group-${index}` }, header, list);
      container.append(card);

      if (listLink) {
        header.append(h("a", { class: "pb-rq-buglist", href: listLink.getAttribute("href"), text: "View as bug list" }));
      }
      for (const node of [heading, table, listLink]) {
        if (node) changes.addClass(node, "pb-hidden");
      }
      return { card, list, count, name: name || "None" };
    });
  }

  function buildToolbar(main, groups, changes) {
    const input = h("input", { type: "search", class: "pb-filter pb-rq-search", placeholder: "Filter requests…", "aria-label": "Filter requests", autocomplete: "off" });
    const status = h("span", { class: "pb-filter-count", "aria-live": "polite" });
    const total = groups.reduce((n, g) => n + g.list.children.length, 0);
    const toolbar = h("div", { class: "pb-rq-toolbar" },
      h("span", { class: "pb-rq-total", text: `${total} ${total === 1 ? "request" : "requests"} in ${groups.length} ${groups.length === 1 ? "group" : "groups"}` }),
      input, status);

    // Plain anchor links: keyboard friendly, move the focus start point and work with Back.
    if (groups.length > 1) {
      const jump = h("details", { class: "pb-rq-jump" },
        h("summary", { text: "Jump to group" }),
        h("ul", { class: "pb-rq-jump-list" }, groups.map((g, i) => h("li", {},
          h("a", { href: `#pb-rq-group-${i}` }, g.name, h("span", { class: "pb-rq-jump-count", text: String(g.list.children.length) }))))));
      changes.listen(jump, "click", (event) => {
        if (event.target.closest("a")) jump.open = false;
      });
      changes.listen(jump, "keydown", (event) => {
        if (event.key !== "Escape" || !jump.open) return;
        jump.open = false;
        jump.querySelector("summary").focus();
      });
      toolbar.append(jump);
    }

    changes.insert(toolbar, groups[0].card.parentNode.parentNode, groups[0].card.parentNode);

    changes.listen(input, "input", () => {
      const terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      for (const group of groups) {
        let visible = 0;
        for (const item of group.list.children) {
          const match = terms.every((t) => item.dataset.search.includes(t));
          item.hidden = !match;
          if (match) visible++;
        }
        group.card.hidden = visible === 0;
        group.count.textContent = terms.length ? `${visible} / ${group.list.children.length}` : String(group.list.children.length);
        shown += visible;
      }
      status.textContent = terms.length ? `${shown} of ${total}` : "";
    });
    changes.listen(input, "keydown", (event) => {
      if (event.key === "Enter") event.preventDefault();
    });
  }

  register({
    name: "requests",

    match() {
      return !!document.querySelector("#main-inner > form#request_form");
    },

    apply(changes) {
      const main = document.getElementById("main-inner");
      changes.addClass(document.body, "pb-requests");
      const groups = buildGroups(main, changes);
      buildFilters(main, groups.length > 0, changes);
      if (groups.length) buildToolbar(main, groups, changes);

      const csv = $$(":scope > a[href*='ctype=csv']", main)[0];
      if (csv) changes.addClass(csv, "pb-rq-csv");
      for (const br of $$(":scope > br", main)) changes.addClass(br, "pb-hidden");
    },
  });
})();
