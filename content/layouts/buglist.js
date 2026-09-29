"use strict";

// buglist.cgi: page header with the result count and search terms as chips, a sticky toolbar
// (status toggle, instant row filter, actions, Export and Save menus), a modern data grid and
// j/k keyboard navigation.
(() => {
  const { h, register } = globalThis.PrettyBugz;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function menu(label, changes, parent) {
    const panel = h("div", { class: "pb-menu-panel" });
    const details = h("details", { class: "pb-menu" }, h("summary", { class: "pb-tool", text: label }), panel);
    changes.insert(details, parent);
    return { details, panel };
  }

  function isTyping(target) {
    return target instanceof HTMLElement
      && (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName));
  }

  function buildHeader(main, table, changes) {
    const head = $(".bz_query_head", main);
    const count = $(".bz_result_count", main)?.textContent.match(/\d[\d,]*/)?.[0];
    const rows = table ? $$("tbody tr.bz_bugitem", table).length : 0;
    const total = count ?? String(rows);

    const titleSlot = h("div", { class: "pb-buglist-title" });
    const meta = h("div", { class: "pb-buglist-meta" });
    const hero = h("header", { class: "pb-buglist-hero" }, titleSlot, meta);
    changes.insert(hero, main, main.firstChild);

    const heading = $("h1", head ?? main);
    if (heading && head?.contains(heading)) changes.move(heading, titleSlot);
    else titleSlot.append(h("h1", { text: "Bug List" }));
    titleSlot.append(h("span", { class: "pb-buglist-count", text: `${total} ${total === "1" ? "bug" : "bugs"}` }));

    const description = $("ul.search_description", main);
    if (description?.children.length) changes.move(description, meta);
    const timestamp = $(".bz_query_timestamp", head ?? main);
    if (timestamp) changes.move(timestamp, meta);
    const quip = $(".bz_quip", head ?? main);
    if (quip) changes.move(quip, meta);

    return hero;
  }

  function buildToolbar(main, hero, table, changes) {
    const start = h("div", { class: "pb-toolbar-start" });
    const end = h("div", { class: "pb-toolbar-end" });
    const toolbar = h("div", { class: "pb-buglist-toolbar", role: "toolbar", "aria-label": "Bug list tools" }, start, end);
    changes.insert(toolbar, main, hero.nextSibling);

    const toggle = $(".bz_status_toggle", main);
    if (toggle) changes.move(toggle, start);

    let filterInput = null;
    if (table) {
      filterInput = h("input", {
        type: "search",
        class: "pb-filter pb-buglist-filter",
        placeholder: "Filter these bugs…  /",
        "aria-label": "Filter bugs in this list",
        autocomplete: "off",
      });
      start.append(filterInput, h("span", { class: "pb-filter-count", "aria-live": "polite" }));
    }

    const links = $("td.bz_query_links", main);
    const edit = $("#edit-search", main);
    const columns = links && $$('a[href*="colchange.cgi"]', links)[0];
    const several = $("#change-several", main);
    const newBug = $("p.bz_query_single_product a", main);

    if (newBug) {
      end.append(h("a", { class: "pb-tool pb-tool-primary", href: newBug.href, text: "New bug", title: newBug.textContent.trim() }));
      changes.addClass(newBug.parentElement, "pb-hidden");
    }
    if (edit) changes.move(edit, end);
    if (columns) changes.move(columns, end);
    if (several) changes.move(several, end);
    for (const link of [edit, columns, several]) {
      if (link) changes.addClass(link, "pb-tool");
    }

    const exportForms = $$("td.bz_query_buttons form", main);
    const exportLinks = links ? $$("a", links).filter((a) => a !== columns && a !== several) : [];
    if (exportForms.length || exportLinks.length) {
      const { panel } = menu("Export", changes, end);
      for (const form of exportForms) changes.move(form, panel);
      for (const link of exportLinks) changes.move(link, panel);
    }

    const remember = $("td.bz_query_remember form", main);
    const forget = $("#forget-search", main);
    if (remember) {
      const { panel } = menu("Save search", changes, end);
      panel.append(h("label", { class: "pb-menu-label", for: "save_newqueryname", text: "Save this search as" }));
      changes.move(remember, panel);
    } else if (forget) {
      changes.move(forget, end);
      changes.addClass(forget, "pb-tool");
    }

    const footer = $("table.footer-nav", main);
    if (footer) changes.addClass(footer, "pb-hidden");

    // Close an open menu when clicking elsewhere, like a native menu would.
    changes.listen(document, "click", (event) => {
      for (const details of $$(".pb-menu[open]", toolbar)) {
        if (!details.contains(event.target)) details.open = false;
      }
    });

    const resize = new ResizeObserver(() => {
      main.style.setProperty("--pb-toolbar-height", `${toolbar.offsetHeight}px`);
    });
    resize.observe(toolbar);
    changes.defer(() => {
      resize.disconnect();
      main.style.removeProperty("--pb-toolbar-height");
      if (!main.getAttribute("style")) main.removeAttribute("style");
    });

    return filterInput;
  }

  function wireFilter(table, input, changes) {
    const rows = $$("tbody tr.bz_bugitem", table);
    const texts = new Map(rows.map((row) => [row, row.textContent.replace(/\s+/g, " ").toLowerCase()]));
    const counter = input.nextElementSibling;

    const apply = () => {
      const terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      for (const row of rows) {
        const match = terms.every((term) => texts.get(row).includes(term));
        if (row.classList.contains("pb-filtered-out") === match) row.classList.toggle("pb-filtered-out", !match);
        if (match) shown++;
      }
      counter.textContent = terms.length ? `${shown} of ${rows.length}` : "";
      const empty = terms.length > 0 && shown === 0;
      if (table.classList.contains("pb-no-matches") !== empty) table.classList.toggle("pb-no-matches", empty);
    };

    changes.listen(input, "input", apply);
    changes.listen(input, "keydown", (event) => {
      if (event.key === "Enter") event.preventDefault();
      if (event.key === "Escape") {
        input.value = "";
        apply();
        input.blur();
      }
    });
    // Only touch rows that changed: classList writes re-serialize BMO's whitespace-heavy class attributes.
    changes.defer(() => {
      for (const row of rows) {
        if (row.classList.contains("pb-filtered-out")) row.classList.remove("pb-filtered-out");
      }
      if (table.classList.contains("pb-no-matches")) table.classList.remove("pb-no-matches");
    });
  }

  function wireKeyboard(table, input, changes) {
    let current = null;
    const visibleRows = () => $$("tbody tr.bz_bugitem:not(.pb-filtered-out)", table);

    const select = (row) => {
      current?.classList.remove("pb-current-row");
      current = row;
      if (!row) return;
      row.classList.add("pb-current-row");
      row.scrollIntoView({ block: "nearest" });
    };

    changes.listen(document, "keydown", (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      const rows = visibleRows();
      const index = rows.indexOf(current);

      if (event.key === "/" && input) {
        event.preventDefault();
        input.focus();
        input.select();
      } else if (event.key === "j" || event.key === "k") {
        event.preventDefault();
        const step = event.key === "j" ? 1 : -1;
        const next = index < 0 ? (step > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, index + step));
        select(rows[next]);
      } else if ((event.key === "Enter" || event.key === "o") && current && index >= 0) {
        const focused = document.activeElement;
        if (event.key === "Enter" && focused && focused !== document.body && !table.contains(focused)) return;
        const link = $(".bz_short_desc_column a, .bz_id_column a", current);
        if (!link) return;
        event.preventDefault();
        if (event.shiftKey) window.open(link.href, "_blank", "noopener");
        else link.click();
      } else if (event.key === "Escape" && current) {
        select(null);
      }
    });

    changes.listen(table, "click", (event) => {
      const row = event.target.closest("tr.bz_bugitem");
      if (row) select(row);
    });

    changes.defer(() => current?.classList.remove("pb-current-row"));
  }

  function buildEmptyState(main, changes) {
    const links = $("ul.zero_result_links", main);
    if (!links) return;
    const message = links.previousElementSibling?.tagName === "P" ? links.previousElementSibling : null;
    const card = h(
      "section",
      { class: "pb-card pb-buglist-empty" },
      h("div", { class: "pb-buglist-empty-icon", "aria-hidden": "true" }),
      h("h2", { text: "No bugs found" }),
    );
    changes.wrap([message, links].filter(Boolean), card);
  }

  register({
    name: "buglist",

    match() {
      return !!document.querySelector("#main-inner table.bz_buglist, #main-inner ul.zero_result_links, #main-inner .bz_query_head + ul.search_description");
    },

    apply(changes) {
      const main = document.getElementById("main-inner");
      const table = $("table.bz_buglist", main);
      changes.addClass(document.body, "pb-buglist");

      const hero = buildHeader(main, table, changes);
      const input = buildToolbar(main, hero, table, changes);
      for (const node of $$(":scope > hr, :scope > span.bz_result_count, :scope > br", main)) {
        changes.addClass(node, "pb-hidden");
      }

      if (table) {
        if (input) wireFilter(table, input, changes);
        wireKeyboard(table, input, changes);
        const hint = h("p", { class: "pb-buglist-hint" }, h("kbd", { text: "j" }), " ", h("kbd", { text: "k" }), " move · ", h("kbd", { text: "o" }), " open · ", h("kbd", { text: "/" }), " filter");
        changes.insert(hint, table.parentNode, table.nextSibling);
      }
      buildEmptyState(main, changes);
    },
  });
})();
