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
    const resultCount = $("span.bz_result_count", main);
    // Without an explicit limit BMO caps results (500) and offers the only link to the rest here.
    const seeAll = resultCount?.querySelector('a[href*="limit=0"]');
    const count = resultCount?.textContent.match(/\d[\d,]*/)?.[0];
    const rows = table ? $$("tbody tr.bz_bugitem", table).length : 0;
    const total = seeAll ? String(rows) : count ?? String(rows);

    const titleSlot = h("div", { class: "pb-buglist-title" });
    const meta = h("div", { class: "pb-buglist-meta" });
    const hero = h("header", { class: "pb-buglist-hero" }, titleSlot, meta);
    changes.insert(hero, main, main.firstChild);

    const heading = $("h1", head ?? main);
    if (heading && head?.contains(heading)) changes.move(heading, titleSlot);
    else titleSlot.append(h("h1", { text: "Bug List" }));
    titleSlot.append(h("span", { class: "pb-buglist-count", text: `${total} ${total === "1" ? "bug" : "bugs"}${seeAll ? " shown" : ""}` }));
    if (seeAll) {
      titleSlot.append(h("span", { class: "pb-buglist-limited" },
        `Limited to the first ${total}. `,
        h("a", { href: seeAll.href, text: "Show all results" })));
    }

    // The search terms and the link to change them belong together.
    const description = $("ul.search_description", main);
    if (description?.children.length) changes.move(description, meta);
    const edit = $("#edit-search", main);
    if (edit) {
      changes.move(edit, meta);
      changes.addClass(edit, "pb-buglist-edit");
    }
    const timestamp = $(".bz_query_timestamp", head ?? main);
    if (timestamp) changes.move(timestamp, meta);
    const quip = $(".bz_quip", head ?? main);
    if (quip) changes.move(quip, meta);

    return hero;
  }

  function buildToolbar(main, hero, table, changes) {
    const start = h("div", { class: "pb-toolbar-start" });
    const end = h("div", { class: "pb-toolbar-end" });
    const toolbar = h("div", { class: "pb-buglist-toolbar", role: "group", "aria-label": "Bug list tools" }, start, end);
    changes.insert(toolbar, main, hero.nextSibling);

    const toggle = $(".bz_status_toggle", main);
    if (toggle) {
      changes.move(toggle, start);
      const active = $(".bz_status_toggle_btn.active", toggle);
      if (active) changes.attr(active, "aria-current", "true");
    }

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
    const columns = links && $$('a[href*="colchange.cgi"]', links)[0];
    const several = $("#change-several", main);
    const newBug = $("p.bz_query_single_product a", main);

    if (newBug) {
      end.append(h("a", { class: "pb-tool", href: newBug.href, text: "New bug", title: newBug.textContent.trim() }));
      changes.addClass(newBug.parentElement, "pb-hidden");
    }
    if (table) end.append(densityToggle(table, changes));
    if (columns) changes.move(columns, end);
    if (several) changes.move(several, end);
    for (const link of [columns, several]) {
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

    // Close an open menu when clicking elsewhere or pressing Escape, like a native menu would.
    changes.listen(document, "click", (event) => {
      for (const details of $$(".pb-menu[open]", toolbar)) {
        if (!details.contains(event.target)) details.open = false;
      }
    });
    changes.listen(toolbar, "keydown", (event) => {
      const details = event.target.closest?.(".pb-menu[open]");
      if (event.key !== "Escape" || !details) return;
      details.open = false;
      $("summary", details).focus();
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

  // Compact rows fit ~40% more bugs on screen; the choice is remembered across lists.
  function densityToggle(table, changes) {
    const group = h("div", { class: "pb-density", role: "group", "aria-label": "Row density" });
    const buttons = ["compact", "comfortable"].map((value) => {
      const button = h("button", { type: "button", class: "pb-density-option", "aria-pressed": "false", text: value === "compact" ? "Compact" : "Comfortable" });
      button.addEventListener("click", () => {
        set(value);
        browser.storage.local.set({ buglistDensity: value });
      });
      group.append(button);
      return [value, button];
    });
    const set = (value) => {
      table.setAttribute("data-pb-density", value);
      for (const [option, button] of buttons) button.setAttribute("aria-pressed", String(option === value));
    };
    changes.attr(table, "data-pb-density", "compact");
    set("compact");
    browser.storage.local.get({ buglistDensity: "compact" }).then(({ buglistDensity }) => {
      if (group.isConnected) set(buglistDensity);
    }, () => {});
    return group;
  }

  // Cells show abbreviations ("UNCO") or only icons (bug type); the full words live in title/aria-label.
  function searchText(row) {
    const labels = $$("[title], [aria-label]", row).map((node) => `${node.title} ${node.getAttribute("aria-label") ?? ""}`);
    return `${row.textContent} ${labels.join(" ")}`.replace(/\s+/g, " ").toLowerCase();
  }

  // The filter is kept in the URL (#pb-filter=…) so a filtered list can be shared or reloaded.
  const HASH = "pb-filter=";

  function wireFilter(table, input, onApply, changes) {
    const rows = $$("tbody tr.bz_bugitem", table);
    const texts = new Map(rows.map((row) => [row, searchText(row)]));
    const counter = input.nextElementSibling;
    const empty = h("p", { class: "pb-buglist-nomatch", hidden: true, text: "No bugs in this list match the filter." });
    changes.insert(empty, table.parentNode, table.nextSibling);

    // In "Change Several Bugs" mode, checked rows the filter hides would still be submitted.
    const form = table.closest("form[name=changeform]");
    const hiddenChecked = () => rows.filter((row) => row.hidden && $('input[type=checkbox][name^="id_"]:checked', row)).length;

    const apply = () => {
      const terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      for (const row of rows) {
        const match = terms.every((term) => texts.get(row).includes(term));
        if (row.hidden === match) row.hidden = !match;
        if (match) shown++;
      }
      const hidden = form ? hiddenChecked() : 0;
      counter.textContent = [terms.length ? `${shown} of ${rows.length}` : "", hidden ? `${hidden} checked hidden` : ""].filter(Boolean).join(" · ");
      empty.hidden = !(terms.length > 0 && shown === 0);
      onApply();
    };

    const originalHash = location.hash;
    // An absolute URL: relative ones resolve against <base>, which needn't be this origin.
    const setHash = (hash) => {
      const url = new URL(location.href);
      url.hash = hash;
      if (url.href !== location.href) history.replaceState(history.state, "", url.href);
    };
    const saveHash = () => {
      const value = input.value.trim();
      setHash(value ? `${HASH}${encodeURIComponent(value)}` : originalHash.startsWith(`#${HASH}`) ? "" : originalHash);
    };
    if (originalHash.startsWith(`#${HASH}`)) {
      try {
        input.value = decodeURIComponent(originalHash.slice(HASH.length + 1));
      } catch {
        // Malformed; start unfiltered.
      }
    }

    // Debounced: on lists of thousands of rows, filtering on every keystroke would lag typing.
    let timer = 0;
    changes.listen(input, "input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        apply();
        saveHash();
      }, rows.length > 500 ? 120 : 30);
    });
    changes.listen(input, "keydown", (event) => {
      if (event.key === "Enter") event.preventDefault();
      if (event.key === "Escape") {
        input.value = "";
        apply();
        saveHash();
        input.blur();
      }
    });
    if (form) {
      changes.listen(form, "change", apply);
      changes.listen(form, "submit", (event) => {
        const hidden = hiddenChecked();
        if (hidden && !confirm(`${hidden} checked ${hidden === 1 ? "bug is" : "bugs are"} hidden by the filter and will be changed too. Continue?`)) {
          event.preventDefault();
        }
      });
    }
    changes.defer(() => {
      clearTimeout(timer);
      for (const row of rows) row.hidden = false;
      setHash(originalHash);
    });
    if (input.value) apply();
  }

  // "Change Several Bugs": a sticky bar with the selection count (and how many the filter hides),
  // Select visible / Clear, a jump to BMO's edit form, shift-click ranges and x to toggle a row.
  function wireTweak(table, changes) {
    const form = table.closest("form[name=changeform]");
    const boxes = $$('tbody tr.bz_bugitem input[type=checkbox][name^="id_"]', table);
    if (!form || !boxes.length) return () => {};

    const status = h("span", { class: "pb-tweak-status", "aria-live": "polite" });
    const setAll = (checked) => {
      for (const box of boxes) {
        if (!box.closest("tr").hidden) box.checked = checked;
      }
      update();
    };
    const editForm = form.querySelector("#form") ?? form.querySelector("#commit");
    const bar = h("div", { class: "pb-tweak-bar", role: "group", "aria-label": "Selected bugs" },
      status,
      h("button", { type: "button", class: "secondary", text: "Select visible", onclick: () => setAll(true) }),
      h("button", { type: "button", class: "secondary", text: "Clear", onclick: () => setAll(false) }),
      editForm ? h("button", { type: "button", class: "primary", text: "Edit selected ↓", onclick: () => {
        editForm.scrollIntoView({ block: "start" });
        editForm.querySelector("select, input:not([type=hidden]), textarea")?.focus({ preventScroll: true });
      } }) : null);
    changes.insert(bar, table.parentNode, table.nextSibling);

    function update() {
      const checked = boxes.filter((box) => box.checked);
      const hidden = checked.filter((box) => box.closest("tr").hidden).length;
      status.textContent = `${checked.length} selected${hidden ? ` (${hidden} hidden by the filter)` : ""}`;
      bar.dataset.empty = String(checked.length === 0);
    }

    let last = null;
    changes.listen(table, "click", (event) => {
      const box = event.target.closest?.('input[type=checkbox][name^="id_"]');
      if (!box) return;
      if (event.shiftKey && last && last !== box) {
        const [from, to] = [boxes.indexOf(last), boxes.indexOf(box)].sort((a, b) => a - b);
        for (const other of boxes.slice(from, to + 1)) {
          if (!other.closest("tr").hidden) other.checked = box.checked;
        }
      }
      last = box;
      update();
    });
    changes.listen(form, "change", update);
    // BMO's Check All / Uncheck All set .checked without events.
    changes.listen(form, "click", (event) => {
      if (event.target.matches?.("#check_all, #uncheck_all")) setTimeout(update);
    });
    changes.listen(document, "keydown", (event) => {
      if (event.key !== "x" || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      const row = document.activeElement?.closest?.("tr.bz_bugitem");
      const box = row && $('input[type=checkbox][name^="id_"]', row);
      if (!box) return;
      event.preventDefault();
      box.checked = !box.checked;
      last = box;
      update();
    });
    update();
    return update;
  }

  // j/k move real focus to each row's summary link, so Enter, screen readers and the focus ring all
  // follow along. Shortcuts only fire when focus is on the page itself or inside the list.
  function wireKeyboard(table, input, changes) {
    const rowLink = (row) => $(".bz_short_desc_column a, .bz_id_column a", row);
    const currentRow = () => document.activeElement?.closest?.("tr.bz_bugitem");

    changes.listen(document, "keydown", (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      const focused = document.activeElement;
      // BMO focuses its <main> container, so only bail out for other interactive controls.
      if (focused && !table.contains(focused) && focused.matches("a, button, summary, [tabindex]:not(main, [tabindex='-1']), [role^=menu]")) return;
      const key = event.key.toLowerCase();

      if (event.key === "/" && input) {
        event.preventDefault();
        input.focus();
        input.select();
      } else if (key === "j" || key === "k") {
        event.preventDefault();
        const rows = $$("tbody tr.bz_bugitem:not([hidden])", table);
        const index = rows.indexOf(currentRow());
        const step = key === "j" ? 1 : -1;
        const next = index < 0 ? (step > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, index + step));
        rowLink(rows[next])?.focus();
      } else if (key === "o" && currentRow()) {
        const link = rowLink(currentRow());
        if (!link) return;
        event.preventDefault();
        if (event.shiftKey) window.open(link.href, "_blank", "noopener");
        else link.click();
      }
    });
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
      for (const node of $$(":scope > hr, span.bz_result_count, :scope > br", main)) {
        changes.addClass(node, "pb-hidden");
      }

      if (table) {
        const hint = h("p", { class: "pb-buglist-hint" }, h("kbd", { text: "j" }), " ", h("kbd", { text: "k" }), " move · ", h("kbd", { text: "Enter" }), " open · ", h("kbd", { text: "Shift" }), "+", h("kbd", { text: "O" }), " new tab · ", h("kbd", { text: "/" }), " filter");
        changes.insert(hint, table.parentNode, table.nextSibling);
        const onFilter = wireTweak(table, changes);
        if ($('input[name^="id_"]', table)) hint.append(" · ", h("kbd", { text: "x" }), " select");
        if (input) wireFilter(table, input, onFilter, changes);
        wireKeyboard(table, input, changes);
      }
      buildEmptyState(main, changes);
    },
  });
})();
