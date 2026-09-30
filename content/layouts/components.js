"use strict";

// describecomponents.cgi?product=X: product hero with quick actions, a sticky filter with A–Z
// jumps, and components as a grid of cards with Open bugs / File a bug / Watch actions.
(() => {
  const { h, register } = globalThis.PrettyBugz;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function url(path, params) {
    return `${path}?${new URLSearchParams(params)}`;
  }

  register({
    name: "components",

    match() {
      return !!document.querySelector("#main-inner > section.product > div.list > section.component");
    },

    apply(changes) {
      const product = $("#main-inner > section.product");
      const header = $(":scope > header", product);
      const list = $(":scope > div.list", product);
      const name = $("h1", header)?.textContent.trim() ?? "";
      const cards = $$(":scope > section.component", list);
      changes.addClass(document.body, "pb-components");
      // Index before we add "Open bugs"/"File a bug" to every card, or those words would match all.
      const texts = new Map(cards.map((card) => [card, `${$("h2", card)?.textContent ?? ""} ${$("p.description", card)?.textContent ?? ""}`.replace(/\s+/g, " ").toLowerCase()]));

      const actions = h("div", { class: "pb-dc-actions" },
        h("a", { class: "pb-dc-button pb-dc-primary", href: url("enter_bug.cgi", { product: name }), text: "File a bug" }),
        h("a", { class: "pb-dc-button", href: url("buglist.cgi", { product: name, resolution: "---" }), text: "Open bugs" }));
      changes.insert(actions, header);
      const watch = $(":scope > button.component-watching", header);
      if (watch) changes.move(watch, actions);

      const instructions = $(":scope > .instructions", product);
      if (instructions) changes.addClass(instructions, "pb-hidden");

      const input = h("input", { type: "search", class: "pb-filter pb-dc-search", placeholder: `Filter ${cards.length} components…`, "aria-label": "Filter components", autocomplete: "off" });
      const count = h("span", { class: "pb-filter-count", "aria-live": "polite" });
      const letters = h("nav", { class: "pb-dc-letters", "aria-label": "Jump to letter" });
      const toolbar = h("div", { class: "pb-dc-toolbar" }, input, count, letters);
      changes.insert(toolbar, product, list);

      const firstByLetter = new Map();
      for (const card of cards) {
        const letter = card.id.trim().charAt(0).toUpperCase();
        const key = /[A-Z]/.test(letter) ? letter : "#";
        if (!firstByLetter.has(key)) firstByLetter.set(key, card);
      }
      // Anchor links move focus with the scroll and work with Back, unlike scrollIntoView buttons.
      for (const [letter, card] of firstByLetter) {
        letters.append(h("a", { class: "pb-dc-letter", href: `#${encodeURIComponent(card.id)}`, text: letter }));
      }

      // Clamped descriptions get a "Show more" button when (and while) they overflow.
      const clamps = new Map();
      const measure = new ResizeObserver((entries) => {
        for (const { target } of entries) {
          const more = clamps.get(target);
          if (more.getAttribute("aria-expanded") === "false") more.hidden = target.scrollHeight <= target.clientHeight + 1;
        }
      });
      changes.defer(() => measure.disconnect());

      for (const card of cards) {
        const footer = $(":scope > footer", card);
        const bugsLink = $("h2 a", card);
        const quick = h("div", { class: "pb-dc-card-actions" },
          bugsLink ? h("a", { href: bugsLink.getAttribute("href"), text: "Open bugs", "aria-label": `Open bugs in ${card.id}` }) : null,
          h("a", { href: url("enter_bug.cgi", { product: name, component: card.id }), text: "File a bug", "aria-label": `File a bug in ${card.id}` }));
        changes.insert(quick, footer ?? card, footer?.firstChild ?? null);

        const description = $("p.description", card);
        if (description) {
          const more = h("button", { type: "button", class: "pb-dc-more", text: "Show more", hidden: true, "aria-expanded": "false" });
          changes.insert(more, description.parentNode, description.nextSibling);
          changes.listen(more, "click", () => {
            const expanded = more.getAttribute("aria-expanded") !== "true";
            more.setAttribute("aria-expanded", String(expanded));
            more.textContent = expanded ? "Show less" : "Show more";
          });
          clamps.set(description, more);
          measure.observe(description);
        }
      }
      changes.defer(() => {
        for (const card of cards) card.hidden = false;
      });

      const visibleCards = () => cards.filter((card) => !card.hidden);
      changes.listen(input, "input", () => {
        const terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
        let shown = 0;
        for (const card of cards) {
          const match = terms.every((t) => texts.get(card).includes(t));
          if (card.hidden === match) card.hidden = !match;
          if (match) shown++;
        }
        count.textContent = terms.length ? `${shown} of ${cards.length}` : "";
        letters.hidden = terms.length > 0;
      });
      // Enter opens the only remaining match.
      changes.listen(input, "keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        const [only, ...rest] = visibleCards();
        if (only && !rest.length && input.value.trim()) $("h2 a", only)?.click();
      });

      // Bugs link here as ?component=X#X; the browser scrolled to the anchor before the grid
      // reflowed the page, so scroll again.
      let targetId = "";
      try {
        targetId = decodeURIComponent(location.hash.slice(1));
      } catch {
        // Malformed hash; nothing to scroll to.
      }
      const target = (targetId && document.getElementById(targetId)) || $("section.component.highlight", list);
      if (target && cards.includes(target)) {
        changes.addClass(target, "pb-dc-target");
        requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
      }
    },
  });
})();
