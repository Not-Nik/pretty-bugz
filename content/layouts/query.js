"use strict";

// query.cgi?format=advanced: the form as cards (with the triage fields up front and filterable
// lists), and a sticky "Your search" rail listing every active criterion with a clear button,
// next to Sort and Search.
(() => {
  const { h, register } = globalThis.PrettyBugz;

  // Type, Severity and Priority are the triage fields people search most; BMO buries them in the
  // collapsed Detailed section.
  const BASIC_FIELDS = ["classification", "product", "component", "bug_status", "resolution", "bug_type", "bug_severity", "priority"];
  const SECTIONS = [
    ["detailed_information", "detailed_information_section"],
    ["people_filter", "people_filter_section"],
    ["history_filter", "history_filter_section"],
    ["custom_search_filter", "custom-search"],
  ];
  const FILTER_THRESHOLD = 8;

  const byId = (id) => document.getElementById(id);

  function isActive(control) {
    if (!control.name || control.disabled || control.type === "hidden") return false;
    if (control instanceof HTMLSelectElement) return control.multiple && control.selectedOptions.length > 0;
    if (control instanceof HTMLTextAreaElement) return control.value.trim() !== "";
    return ["text", "search", "email", "url", "number", "date"].includes(control.type) && control.value.trim() !== "";
  }

  // Counts criteria, not controls: one History criterion spans chfield/from/to/value, and a custom
  // search row counts once its field is picked, even for value-less operators like "is empty".
  function countActive(container) {
    const keys = new Set();
    for (const control of container.querySelectorAll("input, select, textarea")) {
      const row = control.name?.match(/^f(\d+)$/);
      if (row && control.value && control.value !== "noop") keys.add(`row${row[1]}`);
      else if (isActive(control) && !/^[ovn]\d+$/.test(control.name)) keys.add(control.name.replace(/^chfield.*/, "chfield"));
    }
    return keys.size;
  }

  function enhanceMultiSelect(select, alwaysFilter, changes) {
    const container = select.closest(".search_field_grid, li") ?? select.parentNode;
    const label = container.querySelector(".field_label, label");
    const labelText = select.id === "chfield" ? "fields" : label?.textContent.replace(/[:\s]+$/, "").trim() || select.name;

    const count = h("span", { class: "pb-count", id: `pb-count-${select.id || select.name}`, hidden: true });
    const clear = h("button", {
      type: "button",
      class: "pb-clear",
      hidden: true,
      text: "Clear",
      "aria-label": `Clear ${labelText} selection`,
      onclick: () => {
        for (const option of select.options) option.selected = false;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      },
    });
    const meta = h("span", { class: "pb-select-meta" }, count, clear);
    if (label) changes.insert(meta, label.parentNode, label.nextSibling);
    changes.attr(select, "aria-describedby", count.id);

    let filter = null;
    if (alwaysFilter || select.options.length > FILTER_THRESHOLD) {
      filter = h("input", {
        type: "search",
        class: "pb-filter",
        placeholder: `Filter ${labelText.toLowerCase()}…`,
        "aria-label": `Filter ${labelText} options`,
        autocomplete: "off",
      });
      changes.insert(filter, select.parentNode, select);
      changes.listen(filter, "input", applyFilter);
      changes.listen(filter, "keydown", (event) => {
        // Enter would otherwise submit the whole search form.
        if (event.key === "Enter") event.preventDefault();
        if (event.key === "Escape" && filter.value) {
          event.preventDefault();
          filter.value = "";
          applyFilter();
        }
      });
      changes.defer(() => {
        for (const option of select.options) option.hidden = false;
      });
    }

    function applyFilter() {
      const query = filter?.value.trim().toLowerCase() ?? "";
      for (const option of select.options) {
        option.hidden = query !== "" && !option.selected && !option.text.toLowerCase().includes(query);
      }
    }

    // State lives on our meta element (CSS uses :has), not on BMO's container.
    function refresh() {
      const selected = select.selectedOptions.length;
      count.textContent = `${selected} selected`;
      count.hidden = clear.hidden = selected === 0;
      meta.classList.toggle("pb-has-selection", selected > 0);
    }

    // Shift-click can select a range across options the filter hides; re-filtering reveals them,
    // since selected options always stay visible.
    changes.listen(select, "change", () => {
      applyFilter();
      refresh();
    });
    // productform.js rebuilds component/version/milestone options when the product changes.
    changes.observe(select, () => {
      applyFilter();
      refresh();
    }, { childList: true, subtree: true });
    refresh();
  }

  function buildBasicsCard(changes) {
    const grids = BASIC_FIELDS.map((name) => byId(`container_${name}`)).filter(Boolean);
    if (!grids.length) return;

    const body = h("div", { class: "pb-card-body pb-select-grid" });
    const card = h(
      "section",
      { class: "pb-card", id: "pb-query-basics" },
      h("header", { class: "pb-card-header" }, h("h2", { class: "pb-card-title", text: "Product, Status & Priority" })),
      body,
    );
    changes.insert(card, grids[0].parentNode, grids[0]);
    for (const grid of grids) changes.move(grid, body);
  }

  function buildSectionCards(changes) {
    const badges = [];
    for (const [titleId, bodyId] of SECTIONS) {
      const title = byId(titleId);
      const body = byId(bodyId);
      if (!title || !body) continue;

      changes.wrap([title, body], h("section", { class: "pb-card pb-collapsible" }));
      changes.addClass(title, "pb-card-header");
      changes.addClass(body, "pb-card-body");

      const badge = h("span", { class: "pb-badge", hidden: true });
      changes.insert(badge, title, title.querySelector(":scope > span"));
      badges.push({ badge, body });
    }

    const nested = byId("detailed_information_section")?.querySelector(":scope > div:has(.search_field_grid)");
    if (nested) changes.addClass(nested, "pb-select-grid");

    return badges;
  }

  const text = (node) => node?.textContent.replace(/\s+/g, " ").replace(/[:\s]+$/, "").trim() ?? "";
  const optionText = (select) => text(select?.options[select.selectedIndex]);

  function sectionTitle(control) {
    if (byId("pb-query-basics")?.contains(control)) return "Product, Status & Priority";
    const section = control.closest(".bz_search_section");
    const title = section && SECTIONS.find(([, bodyId]) => bodyId === section.id)?.[0];
    return title ? text(byId(title)?.querySelector("a")) : "Summary";
  }

  function labelFor(control) {
    const label = control.id && document.querySelector(`label[for="${CSS.escape(control.id)}"]`);
    const grid = control.closest(".search_field_grid, .search_field_row, li");
    return text(label) || text(grid?.querySelector(".field_label, label")) || control.name;
  }

  function listText(values) {
    return values.length > 3 ? `${values.slice(0, 3).join(", ")} +${values.length - 3}` : values.join(", ");
  }

  function clearSelect(select) {
    for (const option of select.options) option.selected = false;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Every active criterion as { control, section, label, value, clear }.
  function criteria(form) {
    const items = [];
    const elements = [...form.elements].filter((el) => el.name && !el.disabled && !el.classList.contains("pb-filter"));
    const named = (name) => form.elements.namedItem(name);
    const isText = (el) => el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && ["text", "search", "email", ""].includes(el.getAttribute("type") ?? ""));

    for (const el of elements) {
      const custom = el.name.match(/^f(\d+)$/);
      if (custom) {
        if (!el.value || el.value === "noop") continue;
        const n = custom[1];
        const value = [named(`n${n}`)?.checked ? "not" : "", optionText(named(`o${n}`)), named(`v${n}`)?.value ?? ""];
        items.push({ control: el, label: optionText(el), value: value.filter(Boolean).join(" "), clear: () => {
          el.value = "noop";
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } });
      } else if (el.name === "chfield") {
        const fields = [...el.selectedOptions].map(text);
        const from = named("chfieldfrom")?.value.trim();
        const to = named("chfieldvalue")?.value.trim();
        if (!fields.length && !from && !to) continue;
        const value = [listText(fields), to && `to “${to}”`, from && `since ${from}`];
        items.push({ control: el, label: "Changed", value: value.filter(Boolean).join(" "), clear: () => {
          for (const name of ["chfieldfrom", "chfieldvalue"]) {
            if (named(name)) named(name).value = "";
          }
          clearSelect(el);
        } });
      } else if (el instanceof HTMLSelectElement && el.multiple) {
        if (!el.selectedOptions.length) continue;
        items.push({ control: el, label: labelFor(el), value: listText([...el.selectedOptions].map(text)), clear: () => clearSelect(el) });
      } else if (isText(el) && el.value.trim() && !/^(chfield|v\d)/.test(el.name)) {
        const email = el.name.match(/^email(\d+)$/);
        const suffix = email ? email[1] : "";
        const roles = email ? elements.filter((box) => box.type === "checkbox" && box.checked && box.name.startsWith("email") && box.name.endsWith(suffix) && box.name !== `emailtype${suffix}`).map(labelFor) : [];
        const operator = named(email ? `emailtype${suffix}` : `${el.name}_type`);
        items.push({ control: el, label: email ? listText(roles) || "Person" : labelFor(el), value: [optionText(operator), `“${el.value.trim()}”`].filter(Boolean).join(" "), clear: () => {
          el.value = "";
          el.dispatchEvent(new Event("input", { bubbles: true }));
        } });
      }
    }
    for (const item of items) item.section = sectionTitle(item.control);
    return items;
  }

  // Collapsed sections (BMO's TUI) open only when the user asks for a criterion inside them;
  // opening them ourselves would change the collapse state BMO remembers.
  function reveal(control) {
    const section = control.closest(".bz_search_section");
    if (section?.classList.contains("bz_tui_hidden")) {
      const title = SECTIONS.find(([, bodyId]) => bodyId === section.id)?.[0];
      byId(title)?.querySelector("a")?.click();
    }
    control.scrollIntoView({ block: "center" });
    control.focus({ preventScroll: true });
  }

  function buildRail(form, changes) {
    const main = h("div", { class: "pb-query-main" });
    const list = h("ul", { class: "pb-query-criteria" });
    const empty = h("p", { class: "pb-query-empty", text: "No criteria yet: this searches all bugs." });
    const count = h("span", { class: "pb-badge" });
    const actions = h("div", { class: "pb-query-actions" });
    const rail = h("aside", { class: "pb-query-rail", "aria-labelledby": "pb-query-rail-title" },
      h("div", { class: "pb-query-rail-card" },
        h("h2", { class: "pb-query-rail-title", id: "pb-query-rail-title" }, "Your search ", count),
        h("div", { class: "pb-query-rail-list" }, list, empty),
        actions));
    const layout = h("div", { class: "pb-query-layout" }, main, rail);

    const children = [...form.children].filter((node) => !node.matches("script, input[type=hidden]"));
    changes.insert(layout, form, children[0] ?? null);
    for (const node of children) changes.move(node, main);

    const remember = byId("remasdefault")?.closest("p");
    const nuke = form.querySelector('a[href*="nukedefaultquery"]')?.closest("p");
    const order = byId("order")?.closest("p");
    const search = byId("Search")?.closest("p");
    // "…and remember these as my default search" only reads right after the Search button.
    for (const node of [order, search, remember, nuke]) {
      if (node) changes.move(node, actions);
    }

    const render = () => {
      const items = criteria(form);
      count.textContent = String(items.length);
      count.hidden = items.length === 0;
      empty.hidden = items.length > 0;
      let section = "";
      list.replaceChildren(...items.flatMap((item) => {
        const nodes = [];
        if (item.section !== section) {
          section = item.section;
          nodes.push(h("li", { class: "pb-query-group", text: section }));
        }
        nodes.push(h("li", { class: "pb-query-criterion" },
          h("button", { type: "button", class: "pb-query-show", onclick: () => reveal(item.control) },
            h("span", { class: "pb-query-label", text: item.label }),
            h("span", { class: "pb-query-value", text: item.value })),
          h("button", { type: "button", class: "pb-query-clear", "aria-label": `Remove ${item.label}: ${item.value}`, text: "×", onclick: item.clear })));
        return nodes;
      }));
    };
    return { render, rail };
  }

  register({
    name: "advanced-search",

    match() {
      return !!document.querySelector('#queryform input[name="query_format"][value="advanced"]');
    },

    apply(changes) {
      const form = byId("queryform");
      changes.addClass(document.body, "pb-query-advanced");

      buildBasicsCard(changes);
      const badges = buildSectionCards(changes);
      const { render: renderRail, rail } = buildRail(form, changes);

      // Every Product, Status & Priority list gets a filter so the lists line up.
      const basics = byId("pb-query-basics");
      for (const select of form.querySelectorAll(".search_field_grid select[multiple], #chfield")) {
        enhanceMultiSelect(select, !!basics?.contains(select), changes);
      }

      const update = () => {
        for (const { badge, body } of badges) {
          const active = countActive(body);
          badge.textContent = `${active} active`;
          badge.hidden = active === 0;
        }
        renderRail();
      };
      changes.listen(form, "input", update);
      changes.listen(form, "change", update);
      // advanced-search.js adds custom search rows and productform.js rebuilds option lists
      // (dropping selections) without firing change events. Our own rail re-renders don't count.
      let frame = 0;
      changes.observe(form, (records) => {
        if (records.every((record) => rail.contains(record.target))) return;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(update);
      }, { childList: true, subtree: true });
      changes.defer(() => cancelAnimationFrame(frame));
      update();
    },
  });
})();
