"use strict";

// query.cgi?format=specific and ?format=instant: a search-engine style hero with one big
// input, and the few filters as compact pills underneath.
(() => {
  const { h, register } = globalThis.PrettyBugz;

  const $ = (selector, root = document) => root.querySelector(selector);

  function setAttribute(node, name, value, changes) {
    const previous = node.getAttribute(name);
    node.setAttribute(name, value);
    changes.defer(() => {
      if (previous === null) node.removeAttribute(name);
      else node.setAttribute(name, previous);
    });
  }

  function pill(label, control, changes) {
    const wrapper = h("label", { class: "pb-ss-pill" }, h("span", { class: "pb-ss-pill-label", text: label }));
    changes.insert(wrapper, control.parentNode, control);
    changes.move(control, wrapper);
    return wrapper;
  }

  function hideHelp(tabbody, changes) {
    for (const p of tabbody.querySelectorAll(":scope > p")) changes.addClass(p, "pb-hidden");
  }

  function buildHero(title, hint, changes, parent, before) {
    const input = h("div", { class: "pb-ss-input" });
    const filters = h("div", { class: "pb-ss-filters" });
    const hero = h("section", { class: "pb-ss-hero" },
      h("h1", { class: "pb-ss-title", text: title }),
      input,
      filters,
      h("p", { class: "pb-ss-hint", text: hint }));
    changes.insert(hero, parent, before);
    return { hero, input, filters };
  }

  register({
    name: "simple-search",

    match() {
      return !!document.querySelector('form[name="queryform"] input[name="query_format"][value="specific"]');
    },

    apply(changes) {
      const form = $('form[name="queryform"]');
      const tabbody = form.closest(".tabbody") ?? form.parentNode;
      const table = $("table.bz_simple_search_form", form);
      const content = $("#content", form);
      const submit = $("#search", form);
      if (!table || !content || !submit) return;
      changes.addClass(document.body, "pb-simple-search");

      hideHelp(tabbody, changes);
      const { input, filters } = buildHero(
        "Find a bug",
        "Searches summaries and descriptions (and comments, if enabled). Results are sorted by relevance.",
        changes, form, table,
      );
      changes.move(content, input);
      changes.move(submit, input);
      setAttribute(content, "placeholder", "e.g. crash secure SSL flash", changes);

      const status = $("#bug_status", form);
      const product = $("#product", form);
      if (status) changes.move(pill("Status", status, changes), filters);
      if (product) changes.move(pill("Product", product, changes), filters);

      const comments = $("#comments", form);
      const commentsLabel = $('label[for="comments"]', form);
      if (comments && commentsLabel) {
        const chip = h("span", { class: "pb-ss-toggle" });
        changes.insert(chip, filters);
        changes.move(comments, chip);
        changes.move(commentsLabel, chip);
      }
      changes.addClass(table, "pb-hidden");
    },
  });

  register({
    name: "instant-search",

    match() {
      return !!document.querySelector(".tabbody > #results") && !!document.querySelector(".tabbody #content");
    },

    apply(changes) {
      const tabbody = $(".tabbody");
      const results = $("#results", tabbody);
      const content = $("#content", tabbody);
      const product = $("#product", tabbody);
      const table = content.closest("table");
      changes.addClass(document.body, "pb-instant-search");

      hideHelp(tabbody, changes);
      const { input, filters } = buildHero(
        "Instant search",
        "Matches bug summaries as you type. Related products may be included.",
        changes, tabbody, table,
      );
      changes.move(content, input);
      setAttribute(content, "placeholder", "Start typing a bug summary…", changes);
      if (product) changes.move(pill("Product", product, changes), filters);
      if (table) changes.addClass(table, "pb-hidden");
      const br = results.previousElementSibling;
      if (br?.tagName === "BR") changes.addClass(br, "pb-hidden");
    },
  });
})();
