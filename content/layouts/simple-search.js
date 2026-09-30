"use strict";

// query.cgi?format=specific and ?format=instant: a search-engine style hero with one big
// input, and the few filters as compact pills underneath.
(() => {
  const { h, register } = globalThis.PrettyBugz;

  const $ = (selector, root = document) => root.querySelector(selector);

  // BMO's hidden table keeps its own <label for>; name the moved control from the pill instead,
  // so it doesn't end up with two labels.
  function pill(label, control, changes) {
    const id = `pb-ss-label-${control.id || control.name}`;
    const wrapper = h("span", { class: "pb-ss-pill" }, h("label", { class: "pb-ss-pill-label", id, for: control.id, text: label }));
    changes.insert(wrapper, control.parentNode, control);
    changes.move(control, wrapper);
    changes.attr(control, "aria-labelledby", id);
    return wrapper;
  }

  // Moving an element drops its focus (BMO autofocuses the search box), so give it back after
  // the move and again after undo moves it home.
  function moveKeepingFocus(node, parent, changes) {
    const focused = document.activeElement === node || (node.hasAttribute("autofocus") && document.activeElement?.matches("body, main"));
    changes.move(node, parent);
    if (focused) node.focus({ preventScroll: true });
    changes.defer(() => {
      if (document.activeElement === node) queueMicrotask(() => node.focus({ preventScroll: true }));
    });
  }

  function hideHelp(tabbody, changes) {
    for (const p of tabbody.querySelectorAll(":scope > p")) changes.addClass(p, "pb-hidden");
  }

  function buildHero(title, hint, changes, parent, before) {
    // Clicks on the magnifier padding should still reach the input.
    const input = h("div", { class: "pb-ss-input", onclick: (event) => event.target === input && $("#content", input)?.focus() });
    const filters = h("div", { class: "pb-ss-filters" });
    const hero = h("section", { class: "pb-ss-hero" },
      h("h1", { class: "pb-ss-title", id: "pb-ss-title", text: title }),
      input,
      filters,
      h("p", { class: "pb-ss-hint" }, hint));
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
      // BMO only searches summaries unless "Search comments" is ticked (the description is comment 0).
      const { input, filters } = buildHero(
        "Find a bug",
        ["Searches bug summaries. Tick “Search comments” to include descriptions and comments. ",
          h("a", { href: "page.cgi?id=quicksearch.html", text: "Search syntax" }), " · ",
          h("a", { href: "query.cgi?format=advanced", text: "Advanced search" })],
        changes, form, table,
      );
      moveKeepingFocus(content, input, changes);
      changes.move(submit, input);
      changes.attr(content, "placeholder", "e.g. crash when opening a PDF");
      changes.attr(content, "aria-labelledby", "pb-ss-title");

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
      if (!table) return;
      changes.addClass(document.body, "pb-instant-search");

      hideHelp(tabbody, changes);
      const { input, filters } = buildHero(
        "Check for existing bugs",
        "Matches bug summaries as you type (at least 4 characters). Related products may be included.",
        changes, tabbody, table,
      );
      moveKeepingFocus(content, input, changes);
      changes.attr(content, "placeholder", "Start typing a bug summary…");
      changes.attr(content, "aria-labelledby", "pb-ss-title");
      if (product) changes.move(pill("Product", product, changes), filters);
      changes.addClass(table, "pb-hidden");
      const br = results.previousElementSibling;
      if (br?.tagName === "BR") changes.addClass(br, "pb-hidden");
      wireInstantActions(content, product, results, changes);
    },
  });

  // People check for duplicates before filing, so finish the job: say what's happening, offer
  // every match (Enter) and a way to file the bug with the summary already typed.
  function wireInstantActions(content, product, results, changes) {
    const status = h("p", { class: "pb-ss-status", role: "status" });
    const seeAll = h("a", { class: "pb-ss-action", text: "See all matching bugs" });
    const file = h("a", { class: "pb-ss-action pb-ss-file" });
    const bar = h("div", { class: "pb-ss-actions" }, status, h("span", { class: "pb-ss-links" }, seeAll, file));
    changes.insert(bar, results.parentNode, results);

    const update = () => {
      const query = content.value.trim();
      const productName = product?.value ?? "";
      const rows = results.querySelectorAll("table tbody tr").length;
      const message = results.querySelector(".message")?.textContent.trim();
      if (query.length < 4) status.textContent = query ? "Keep typing: searches start at 4 characters." : "";
      else if (rows) status.textContent = rows >= 20 ? "Showing the 20 closest matches." : `${rows} possible ${rows === 1 ? "duplicate" : "duplicates"}.`;
      else status.textContent = message ?? "";

      const params = new URLSearchParams({ query_format: "advanced", short_desc_type: "allwordssubstr", short_desc: query });
      if (productName) params.set("product", productName);
      seeAll.href = `buglist.cgi?${params}`;
      file.href = `enter_bug.cgi?${new URLSearchParams({ product: productName, short_desc: query })}`;
      file.textContent = `Not listed? File a bug in ${productName}`;
      bar.hidden = !query;
      file.hidden = !productName;
    };
    changes.listen(content, "input", update);
    changes.listen(content, "keydown", (event) => {
      if (event.key === "Enter" && content.value.trim()) location.href = seeAll.href;
    });
    if (product) changes.listen(product, "change", update);
    changes.observe(results, update, { childList: true, subtree: true, characterData: true });
    update();
  }
})();
