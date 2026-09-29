"use strict";

// page.cgi?id=…: readable articles with a generated table of contents for the help pages,
// a card grid for custom bug forms, a triage-style dashboard for attention.html, and a
// consistent header + form panel for the remaining report/tool pages.
(() => {
  const { h, register } = globalThis.PrettyBugz;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clean = (text) => text.replace(/\s+/g, " ").trim();

  const ARTICLES = new Set([
    "etiquette.html",
    "bug-writing.html",
    "quicksearch.html",
    "restrict_comments_guidelines.html",
    "release-notes.html",
    "release-notes3.html",
    "cookies.html",
    "voting.html",
  ]);
  const OWN_LAYOUTS = new Set([...ARTICLES, "custom_forms.html", "attention.html", "mydashboard.html", "user_profile.html"]);

  // page.cgi ids end in .html; show_bug.cgi and friends also take a (numeric) id.
  const pageId = () => {
    const id = new URLSearchParams(location.search).get("id") ?? "";
    return id.endsWith(".html") ? id : "";
  };
  const main = () => document.getElementById("main-inner");

  function slug(text) {
    return clean(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "section";
  }

  function setId(node, id, changes) {
    node.id = id;
    changes.defer(() => node.removeAttribute("id"));
  }

  function pageTitle() {
    return clean(document.title.replace(/\s*[-–|]\s*Bugzilla.*$/i, ""));
  }

  // Articles

  function articleContainer(root) {
    // cookies.html nests a second #main-inner.
    const nested = $(":scope > div#main-inner", root);
    return nested ?? root;
  }

  function buildToc(article, changes) {
    const headings = $$(":scope > h2, :scope > h3, :scope > blockquote > h2, :scope > blockquote > h3", article);
    if (headings.length < 3) return null;

    const used = new Set($$("[id]").map((n) => n.id));
    const list = h("ol", { class: "pb-toc-list" });
    for (const heading of headings) {
      if (!heading.id) {
        let id = slug(heading.textContent);
        for (let n = 2; used.has(id); n++) id = `${slug(heading.textContent)}-${n}`;
        used.add(id);
        setId(heading, id, changes);
      }
      const anchor = h("a", { class: "pb-heading-anchor", href: `#${heading.id}`, "aria-label": "Link to this section", text: "#" });
      changes.insert(anchor, heading);
      list.append(h("li", { class: `pb-toc-${heading.tagName.toLowerCase()}` },
        h("a", { href: `#${heading.id}`, text: clean(heading.textContent).replace(/#$/, "").trim() })));
    }

    const toc = h("nav", { class: "pb-toc", "aria-label": "On this page" }, h("span", { class: "pb-toc-title", text: "On this page" }), list);

    const links = [...list.querySelectorAll("a")];
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const link of links) link.classList.toggle("pb-toc-active", link.hash === `#${entry.target.id}`);
      }
    }, { rootMargin: "-80px 0px -70% 0px" });
    for (const heading of headings) observer.observe(heading);
    changes.defer(() => observer.disconnect());

    return toc;
  }

  register({
    name: "page-article",

    match() {
      return ARTICLES.has(pageId()) && !!main();
    },

    apply(changes) {
      const root = main();
      const article = articleContainer(root);
      changes.addClass(document.body, "pb-page-article");

      const wrapper = h("div", { class: "pb-article-layout" });
      const body = h("article", { class: "pb-article" });
      changes.insert(wrapper, article, article.firstChild);
      wrapper.append(body);

      for (const node of [...article.childNodes].filter((n) => n !== wrapper)) {
        if (node.nodeType === Node.ELEMENT_NODE || clean(node.textContent)) changes.move(node, body);
      }

      if (!$(":scope > h1", body)) body.prepend(h("h1", { class: "pb-article-title", text: pageTitle() }));

      // The hand-written tables of contents duplicate the generated one.
      for (const list of $$(":scope > ul", body)) {
        const links = $$("a", list);
        if (list.classList.contains("bz_toc") || (links.length > 2 && links.every((a) => a.getAttribute("href")?.startsWith("#")))) {
          changes.addClass(list, "pb-hidden");
        }
      }

      const toc = buildToc(body, changes);
      if (toc) {
        wrapper.append(toc);
        changes.addClass(wrapper, "pb-has-toc");
      }
    },
  });

  // Custom bug forms

  register({
    name: "page-custom-forms",

    match() {
      return pageId() === "custom_forms.html" && !!main();
    },

    apply(changes) {
      const root = main();
      changes.addClass(document.body, "pb-page-forms");
      const heading = $(":scope > h1", root);
      const groups = $$(":scope > h3", root).map((title) => ({ title, list: title.nextElementSibling?.tagName === "UL" ? title.nextElementSibling : null }));

      const input = h("input", { type: "search", class: "pb-filter pb-forms-search", placeholder: "Filter forms…", "aria-label": "Filter forms", autocomplete: "off" });
      const grid = h("div", { class: "pb-forms-grid" });
      const intro = h("header", { class: "pb-forms-hero" },
        h("p", { class: "pb-forms-lead", text: "Specialised forms that route requests straight to the right team." }),
        input);
      changes.insert(intro, root, heading?.nextSibling ?? root.firstChild);
      changes.insert(grid, root, intro.nextSibling);

      const cards = [];
      for (const { title, list } of groups) {
        const card = h("section", { class: "pb-forms-card" });
        grid.append(card);
        changes.move(title, card);
        if (list) {
          changes.move(list, card);
          for (const link of $$("a", list)) {
            if (/^https?:/.test(link.getAttribute("href") ?? "") && !link.href.startsWith(location.origin)) {
              changes.addClass(link, "pb-forms-external");
            }
          }
        }
        cards.push({ card, text: clean(card.textContent).toLowerCase() });
      }

      changes.listen(input, "input", () => {
        const terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
        for (const { card, text } of cards) card.hidden = !terms.every((t) => text.includes(t));
      });
      changes.listen(input, "keydown", (event) => {
        if (event.key === "Enter") event.preventDefault();
      });
    },
  });

  // What needs my attention

  const TRUNCATE_AFTER = 10;

  register({
    name: "page-attention",

    match() {
      return !!document.querySelector("#main-inner > #attention");
    },

    apply(changes) {
      const root = $("#attention");
      changes.addClass(document.body, "pb-page-attention");

      const title = $(":scope > h1", root);
      const form = $(":scope > #attention_form", root);
      const refresh = $(":scope > #auto_refresh-container", root);
      const docs = $(":scope > p > a[href*='attention-dashboard']", root)?.parentElement;
      const note = [...root.querySelectorAll(":scope > p")].find((p) => p !== docs);
      const who = $("#who", root)?.value;

      const heroMain = h("div", { class: "pb-at-hero-main" });
      const heroSide = h("div", { class: "pb-at-hero-side" });
      const hero = h("header", { class: "pb-at-hero" }, heroMain, heroSide);
      changes.insert(hero, root, root.firstChild);
      if (title) changes.move(title, heroMain);
      if (who) heroMain.append(h("p", { class: "pb-at-who", text: `For ${who}` }));
      if (docs) changes.move(docs, heroMain);
      if (form) changes.move(form, heroSide);
      if (refresh) changes.move(refresh, heroSide);
      if (note) changes.addClass(note, "pb-at-note");

      const overview = h("nav", { class: "pb-at-overview", "aria-label": "Summary" });
      changes.insert(overview, root, (note ?? hero).nextSibling);

      let tier = null;
      let tierIndex = -1;
      let listIndex = 0;
      for (const node of $$(":scope > h2, :scope > .task-desc, :scope > .bug-list-header", root)) {
        if (node.matches("h2")) {
          tierIndex++;
          tier = h("section", { class: `pb-at-tier pb-at-tier-${Math.min(tierIndex, 3)}` }, h("div", { class: "pb-at-tier-head" }), h("div", { class: "pb-at-lists" }));
          changes.insert(tier, root, node);
          changes.move(node, tier.firstChild);
          continue;
        }
        if (!tier) continue;
        if (node.matches(".task-desc")) {
          changes.move(node, tier.firstChild);
          continue;
        }

        const table = node.nextElementSibling?.matches("table.bug-list") ? node.nextElementSibling : null;
        const count = Number(clean($(".bug-list-count", node)?.textContent ?? "0").replace(/[^\d]/g, "")) || 0;
        const name = clean($(".bug-list-title", node)?.textContent ?? "");
        const card = h("section", { class: `pb-at-list${count ? "" : " pb-at-empty"}`, id: `pb-at-list-${listIndex++}` });
        tier.lastChild.append(card);
        changes.move(node, card);
        if (table) changes.move(table, card);

        if (!count) card.append(h("p", { class: "pb-at-clear", text: "Nothing here — all clear." }));

        for (const cell of table ? table.querySelectorAll("td.status, td.priority, td.severity") : []) {
          const value = clean(cell.textContent).toLowerCase().replace(/[^a-z0-9]/g, "");
          if (value) changes.addClass(cell, `pb-at-v-${value}`);
        }

        const rows = table ? table.querySelectorAll("tbody tr").length : 0;
        if (rows > TRUNCATE_AFTER) {
          card.classList.add("pb-at-truncated");
          const more = h("button", { type: "button", class: "pb-at-more", text: `Show all ${rows}` });
          more.addEventListener("click", () => {
            const truncated = card.classList.toggle("pb-at-truncated");
            more.textContent = truncated ? `Show all ${rows}` : "Show fewer";
          });
          card.append(more);
        }

        overview.append(h("a", { class: `pb-at-tile pb-at-tier-${Math.min(tierIndex, 3)}${count ? "" : " pb-at-zero"}`, href: `#${card.id}` },
          h("span", { class: "pb-at-tile-count", text: count.toLocaleString() }),
          h("span", { class: "pb-at-tile-label", text: name })));
      }
    },
  });

  // Other page.cgi reports and tools

  register({
    name: "page-tool",

    match() {
      const id = pageId();
      const root = main();
      return !!id && !OWN_LAYOUTS.has(id) && !!root && !!$("form", root)
        && !$(":scope > table#user_profile_table, :scope > #attention", root);
    },

    apply(changes) {
      const root = main();
      changes.addClass(document.body, "pb-page-tool");

      if (!$(":scope > h1, :scope > div > h1", root)) {
        const title = h("h1", { class: "pb-tool-title", text: pageTitle() });
        changes.insert(title, root, root.firstChild);
      }

      for (const form of $$(":scope > form", root)) {
        const panel = h("section", { class: "pb-card pb-tool-panel" });
        changes.insert(panel, root, form);
        changes.move(form, panel);
      }
    },
  });
})();
