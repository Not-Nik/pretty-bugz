"use strict";

// request.cgi (flag request queue): filters folded into a collapsible panel and every request as
// a readable row (bug first, then flag/who/where with ages), oldest first. Grouping is chosen on
// the page (none, requestee, requester, flag, product) with a sticky rail of groups and counts,
// plus an instant filter.
(() => {
  const { h, register, parseTime } = globalThis.PrettyBugz;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clean = (text) => text.replace(/\s+/g, " ").trim();
  const STATUSES = ["UNCONFIRMED", "NEW", "ASSIGNED", "REOPENED", "RESOLVED", "VERIFIED", "CLOSED"];
  const KEYS = ["Requestee", "Requester", "Flag", "Product/Component"];
  const FACT_LABELS = { Flag: "Flag", Requester: "From", Requestee: "To", "Product/Component": "In" };
  const GROUP_LABELS = { "": "None", Requestee: "Requestee", Requester: "Requester", Flag: "Flag", "Product/Component": "Product" };

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

  function fact(label, text) {
    const who = label === "Requester" || label === "Requestee" ? person(text) : null;
    return h("span", { class: "pb-rq-fact", "data-key": label, title: who?.full ?? text },
      h("span", { class: "pb-rq-fact-label", text: FACT_LABELS[label] }),
      who ? `${who.name}${who.nick ? ` (:${who.nick})` : ""}` : text);
  }

  // BMO leaves the grouped column out of each table and puts it in the <h3> instead; take it from
  // there so every request knows all four values and can be regrouped.
  function buildItem(row, headers, heading) {
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

    const values = {};
    const facts = h("div", { class: "pb-rq-facts" });
    for (const label of KEYS) {
      const text = label === heading.kind ? heading.name : clean(cell(label)?.textContent ?? "");
      if (!text) continue;
      values[label] = text;
      facts.append(fact(label, text));
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

    const node = h(
      "li",
      { class: `pb-rq-item${status && ["RESOLVED", "VERIFIED", "CLOSED"].includes(status) ? " pb-rq-closed" : ""}` },
      h("div", { class: "pb-rq-main" },
        h("a", { class: bugClass, href: bugLink?.getAttribute("href") ?? "#" },
          id ? h("span", { class: "pb-rq-id", text: id }) : null,
          h("span", { class: "pb-rq-summary", text: summary })),
        pills),
      facts,
      ageNode,
    );
    return { node, values, time: date?.getTime() ?? 0, search: `${clean(row.textContent)} ${Object.values(values).join(" ")}`.toLowerCase() };
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

  // Reads every BMO group table into request items and hides the originals.
  function readRequests(main, changes) {
    const tables = $$(":scope > table.standard", main);
    const items = [];
    let initialKey = "";
    const links = new Map();
    for (const table of tables) {
      const heading = table.previousElementSibling?.tagName === "H3" ? table.previousElementSibling : null;
      const listLink = table.nextElementSibling?.matches("a[href*='buglist.cgi']") ? table.nextElementSibling : null;
      const [headerRow, ...rows] = [...table.rows];
      const headers = [...headerRow.cells].map((c) => clean(c.textContent));
      // Only the first colon separates kind and name: "Product/Component: Firefox: Tabbed Browser".
      const headingText = clean(heading?.textContent ?? "");
      const colon = headingText.indexOf(":");
      const group = { kind: colon < 0 ? "" : headingText.slice(0, colon), name: colon < 0 ? headingText : headingText.slice(colon + 1).trim() };
      if (KEYS.includes(group.kind)) initialKey = group.kind;
      if (listLink) links.set(group.name, listLink.getAttribute("href"));
      for (const row of rows.filter((r) => r.classList.contains("bz_bugitem"))) items.push(buildItem(row, headers, group));
      for (const node of [heading, table, listLink]) {
        if (node) changes.addClass(node, "pb-hidden");
      }
    }
    return { items, initialKey, links, anchor: tables[0]?.previousElementSibling?.tagName === "H3" ? tables[0].previousElementSibling : tables[0] };
  }

  function buildQueue(main, { items, initialKey, links, anchor }, changes) {
    const total = items.length;
    const keys = ["", ...KEYS.filter((key) => items.some((item) => item.values[key]))];
    let groupKey = keys.includes(initialKey) ? initialKey : "";
    let terms = [];

    const input = h("input", { type: "search", class: "pb-filter pb-rq-search", placeholder: "Filter requests…", "aria-label": "Filter requests", autocomplete: "off" });
    const status = h("span", { class: "pb-filter-count", "aria-live": "polite" });
    const groupButtons = keys.map((key) => {
      const button = h("button", { type: "button", class: "pb-rq-group-option", "aria-pressed": String(key === groupKey), text: GROUP_LABELS[key] });
      button.addEventListener("click", () => {
        groupKey = key;
        for (const other of groupButtons) other.setAttribute("aria-pressed", String(other === button));
        render();
      });
      return button;
    });
    const toolbar = h("div", { class: "pb-rq-toolbar" },
      h("span", { class: "pb-rq-total", text: `${total} ${total === 1 ? "request" : "requests"}` }),
      input, status,
      h("div", { class: "pb-rq-grouping", role: "group", "aria-label": "Group by" }, h("span", { class: "pb-rq-grouping-label", text: "Group by" }), groupButtons));

    const groupsNode = h("div", { class: "pb-rq-groups" });
    const nav = h("nav", { class: "pb-rq-rail", "aria-label": "Groups" });
    const layout = h("div", { class: "pb-rq-layout" }, groupsNode, nav);
    changes.insert(toolbar, anchor.parentNode, anchor);
    changes.insert(layout, anchor.parentNode, anchor);

    // Oldest first: the requests waiting longest are the ones to answer.
    const sorted = [...items].sort((a, b) => a.time - b.time);

    function render() {
      const matching = sorted.filter((item) => terms.every((t) => item.search.includes(t)));
      const groups = new Map();
      for (const item of matching) {
        const name = groupKey ? item.values[groupKey] ?? "None" : "";
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(item);
      }
      const ordered = groupKey ? [...groups].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])) : [...groups];

      groupsNode.dataset.group = groupKey;
      groupsNode.replaceChildren(...ordered.map(([name, list], index) => {
        const header = h("header", { class: "pb-card-header" },
          groupKey ? h("span", { class: "pb-rq-kind", text: GROUP_LABELS[groupKey] }) : null,
          h("h2", { class: "pb-card-title", text: groupKey ? name : "All requests" }),
          h("span", { class: "pb-badge", text: String(list.length) }));
        const href = groupKey === initialKey && links.get(name);
        if (href) header.append(h("a", { class: "pb-rq-buglist", href, text: "View as bug list" }));
        return h("section", { class: "pb-card pb-rq-group", id: `pb-rq-group-${index}` },
          header,
          h("ul", { class: "pb-rq-list" }, list.map((item) => item.node)));
      }));

      nav.hidden = !groupKey || ordered.length < 2;
      nav.replaceChildren(h("h2", { class: "pb-rq-rail-title", text: `${ordered.length} groups` }),
        h("ul", {}, ordered.map(([name, list], index) => h("li", {},
          h("a", { href: `#pb-rq-group-${index}` }, h("span", { class: "pb-rq-rail-name", text: name }), h("span", { class: "pb-rq-rail-count", text: String(list.length) }))))));
      layout.classList.toggle("pb-rq-has-rail", !nav.hidden);
      status.textContent = terms.length ? `${matching.length} of ${total}` : "";
    }

    changes.listen(input, "input", () => {
      terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      render();
    });
    changes.listen(input, "keydown", (event) => {
      if (event.key === "Enter") event.preventDefault();
    });
    render();
  }

  register({
    name: "requests",

    match() {
      return !!document.querySelector("#main-inner > form#request_form");
    },

    apply(changes) {
      const main = document.getElementById("main-inner");
      changes.addClass(document.body, "pb-requests");
      const queue = readRequests(main, changes);
      buildFilters(main, queue.items.length > 0, changes);
      if (queue.items.length) buildQueue(main, queue, changes);

      const csv = $$(":scope > a[href*='ctype=csv']", main)[0];
      if (csv) changes.addClass(csv, "pb-rq-csv");
      for (const br of $$(":scope > br", main)) changes.addClass(br, "pb-hidden");
    },
  });
})();
