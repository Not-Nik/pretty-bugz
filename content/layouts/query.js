"use strict";

// query.cgi?format=advanced: group the form into cards, add filterable multi-selects,
// per-section "active criteria" badges and a sticky search bar.
(() => {
  const { h, register } = globalThis.PrettyBugz;

  const BASIC_FIELDS = ["classification", "product", "component", "bug_status", "resolution"];
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

  function countActive(container) {
    return [...container.querySelectorAll("input, select, textarea")].filter(isActive).length;
  }

  function enhanceMultiSelect(select, changes) {
    const container = select.closest(".search_field_grid, li") ?? select.parentNode;
    const label = container.querySelector(".field_label, label");
    const labelText = label?.textContent.replace(/[:\s]+$/, "").trim() || select.name;

    const count = h("span", { class: "pb-count", hidden: true });
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

    let filter = null;
    if (select.options.length > FILTER_THRESHOLD) {
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

    function refresh() {
      const selected = select.selectedOptions.length;
      count.textContent = `${selected} selected`;
      count.hidden = clear.hidden = selected === 0;
      container.classList.toggle("pb-has-selection", selected > 0);
    }

    changes.listen(select, "change", refresh);
    // productform.js rebuilds component/version/milestone options when the product changes.
    changes.observe(select, () => {
      applyFilter();
      refresh();
    }, { childList: true, subtree: true });
    changes.defer(() => container.classList.remove("pb-has-selection"));
    refresh();
  }

  function buildBasicsCard(changes) {
    const grids = BASIC_FIELDS.map((name) => byId(`container_${name}`)).filter(Boolean);
    if (!grids.length) return;

    const body = h("div", { class: "pb-card-body pb-select-grid" });
    const card = h(
      "section",
      { class: "pb-card", id: "pb-query-basics" },
      h("header", { class: "pb-card-header" }, h("h2", { class: "pb-card-title", text: "Product & Status" })),
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

      const card = changes.wrap([title, body], h("section", { class: "pb-card pb-collapsible" }));
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

  function buildActionBar(form, changes) {
    const start = h("div", { class: "pb-actionbar-start" });
    const end = h("div", { class: "pb-actionbar-end" });
    const bar = h("div", { class: "pb-actionbar", role: "toolbar", "aria-label": "Search actions" }, start, end);
    changes.insert(bar, form);

    const remember = byId("remasdefault")?.closest("p");
    const nuke = form.querySelector('a[href*="nukedefaultquery"]')?.closest("p");
    const order = byId("order")?.closest("p");
    const search = byId("Search")?.closest("p");

    if (remember) changes.move(remember, start);
    if (nuke) changes.move(nuke, start);
    if (order) changes.move(order, end);
    if (search) changes.move(search, end);
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
      buildActionBar(form, changes);

      for (const select of form.querySelectorAll(".search_field_grid select[multiple], #chfield")) {
        enhanceMultiSelect(select, changes);
      }

      const updateBadges = () => {
        for (const { badge, body } of badges) {
          const active = countActive(body);
          badge.textContent = `${active} active`;
          badge.hidden = active === 0;
        }
      };
      changes.listen(form, "input", updateBadges);
      changes.listen(form, "change", updateBadges);
      // Custom search rows are added and removed by advanced-search.js.
      const custom = byId("custom-search");
      if (custom) changes.observe(custom, updateBadges, { childList: true, subtree: true });
      updateBadges();
    },
  });
})();
