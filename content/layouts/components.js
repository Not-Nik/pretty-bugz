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
      for (const [letter, card] of firstByLetter) {
        letters.append(h("button", { type: "button", class: "pb-dc-letter", text: letter, onclick: () => card.scrollIntoView({ behavior: "smooth", block: "start" }) }));
      }

      for (const card of cards) {
        const footer = $(":scope > footer", card);
        const bugsLink = $("h2 a", card);
        const quick = h("div", { class: "pb-dc-card-actions" },
          bugsLink ? h("a", { href: bugsLink.getAttribute("href"), text: "Open bugs" }) : null,
          h("a", { href: url("enter_bug.cgi", { product: name, component: card.id }), text: "File a bug" }));
        changes.insert(quick, footer ?? card, footer?.firstChild ?? null);

        const description = $("p.description", card);
        if (description) {
          const more = h("button", { type: "button", class: "pb-dc-more", text: "Show more", hidden: true });
          changes.insert(more, description.parentNode, description.nextSibling);
          changes.listen(more, "click", () => {
            const expanded = card.classList.toggle("pb-dc-expanded");
            more.textContent = expanded ? "Show less" : "Show more";
          });
          requestAnimationFrame(() => {
            more.hidden = description.scrollHeight <= description.clientHeight + 1;
          });
        }
      }
      changes.defer(() => {
        for (const card of cards) {
          if (card.classList.contains("pb-dc-expanded")) card.classList.remove("pb-dc-expanded");
          if (card.classList.contains("pb-filtered-out")) card.classList.remove("pb-filtered-out");
        }
      });

      const texts = new Map(cards.map((card) => [card, card.textContent.replace(/\s+/g, " ").toLowerCase()]));
      changes.listen(input, "input", () => {
        const terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
        let shown = 0;
        for (const card of cards) {
          const match = terms.every((t) => texts.get(card).includes(t));
          if (card.classList.contains("pb-filtered-out") === match) card.classList.toggle("pb-filtered-out", !match);
          if (match) shown++;
        }
        count.textContent = terms.length ? `${shown} of ${cards.length}` : "";
        letters.hidden = terms.length > 0;
      });
      changes.listen(input, "keydown", (event) => {
        if (event.key === "Enter") event.preventDefault();
      });
    },
  });
})();
