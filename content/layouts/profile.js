"use strict";

// user_profile: a profile hero (avatar, name, account facts), stats as KPI tiles grouped by
// section, activity by product as proportional bars, and status changes as chips. Rows we
// don't recognise (e.g. the Phabricator ones BMO fills in later) are moved over untouched.
(() => {
  const { h, register } = globalThis.PrettyBugz;

  const clean = (text) => text.replace(/\s+/g, " ").trim();
  const cloneChildren = (node) => [...node.childNodes].map((child) => child.cloneNode(true));

  function classify(table) {
    const result = { identity: [], sections: [], products: null, statuses: null, other: [], footer: [], avatar: null, user: null, disabled: false, changeImage: null, edit: null, search: null };
    let section = null;

    for (const row of [...table.rows]) {
      const cells = [...row.cells];
      const th = row.querySelector(":scope > th");
      const text = clean(row.textContent);

      if (row.querySelector("td#gravatar-container")) {
        const userCell = cells.at(-1);
        result.avatar = row.querySelector("#gravatar");
        result.changeImage = row.querySelector("#gravatar-container a");
        result.user = userCell.querySelector(".vcard") ?? userCell;
        result.disabled = /\(disabled\)$/.test(clean(userCell.textContent));
        continue;
      }
      // Logged-in extras: the profile search form and, on your own profile, an Edit button.
      if (!section && row.querySelector("form")) {
        result.search = row.querySelector("form");
        continue;
      }
      const edit = row.querySelector('a[href*="userprefs.cgi"]');
      if (edit) {
        result.edit = edit;
        continue;
      }
      if (!text || row.querySelector("td.separator")) continue;
      if (row.querySelector("#what, #updated")) {
        result.footer.push(...row.querySelectorAll("#what, #updated"));
        continue;
      }
      if (!th && cells.length === 1) {
        section = { title: text, stats: [], rows: [] };
        result.sections.push(section);
        continue;
      }
      if (!th) {
        result.other.push(row);
        continue;
      }

      const label = clean(th.textContent).replace(/:$/, "");
      const value = th.nextElementSibling;
      if (!value) continue;

      if (label === "Activity by product") {
        result.products = [...value.querySelectorAll(".product_span")].map((span) => {
          const match = clean(span.textContent).replace(/,$/, "").match(/^(.*)\((\d+)\)$/);
          return { name: match?.[1].trim() ?? clean(span.textContent), count: Number(match?.[2] ?? 0), link: span.querySelector("a")?.getAttribute("href") };
        });
      } else if (/changed the status/i.test(label)) {
        result.statuses = { label, items: clean(value.textContent).split(/,\s*/).filter(Boolean) };
      } else if (value.classList.contains("numeric") && section) {
        section.stats.push({ label, value, extra: value.nextElementSibling });
      } else if (section) {
        // E.g. the Phabricator rows, which BMO fills in later: keep them under their section title.
        section.rows.push(row);
      } else if (!row.querySelector("[id]")) {
        result.identity.push({ label, value });
      } else {
        result.other.push(row);
      }
    }
    return result;
  }

  function tile({ label, value, extra }) {
    const link = value.querySelector("a");
    const number = clean(value.textContent);
    const body = [h("span", { class: "pb-pf-number", text: Number(number) ? Number(number).toLocaleString() : number }), h("span", { class: "pb-pf-label", text: label })];
    const node = link
      ? h("a", { class: "pb-pf-tile", href: link.getAttribute("href"), title: link.getAttribute("title") ?? "" }, body)
      : h("div", { class: "pb-pf-tile" }, body);
    if (number === "0") node.classList.add("pb-pf-zero");
    const extraLinks = extra ? [...extra.querySelectorAll("a")] : [];
    if (extraLinks.length) {
      return h("div", { class: "pb-pf-tile-wrap" }, node, h("span", { class: "pb-pf-tile-extra" }, extraLinks.map((a) => a.cloneNode(true))));
    }
    return node;
  }

  register({
    name: "profile",

    match() {
      return !!document.querySelector("#main-inner > table#user_profile_table");
    },

    apply(changes) {
      const main = document.getElementById("main-inner");
      const table = document.getElementById("user_profile_table");
      const data = classify(table);
      changes.addClass(document.body, "pb-profile");

      const avatar = data.avatar ? h("img", { class: "pb-pf-avatar", src: data.avatar.getAttribute("src"), alt: "" }) : h("span", { class: "pb-pf-avatar" });
      const avatarSlot = h("div", { class: "pb-pf-avatar-slot" }, avatar);

      const facts = h("dl", { class: "pb-pf-facts" });
      for (const { label, value } of data.identity) {
        facts.append(h("dt", { text: label }), h("dd", {}, cloneChildren(value)));
      }

      // The name is BMO's own user link (moved), so its user menu, email link and any
      // availability notes like "[PTO until …]" stay as BMO shows them.
      const heading = h("h1", { class: "pb-pf-name" });
      const badges = h("p", { class: "pb-pf-handle" }, data.disabled ? h("span", { class: "pb-pf-disabled", text: "Account disabled" }) : null);
      const actions = h("div", { class: "pb-pf-actions" });
      const hero = h("header", { class: "pb-pf-hero" },
        avatarSlot,
        h("div", { class: "pb-pf-identity" }, heading, badges.childNodes.length ? badges : null, facts, actions));

      const view = h("div", { class: "pb-pf-view" }, hero);

      for (const section of data.sections) {
        if (!section.stats.length && !section.rows.length) continue;
        const node = h("section", { class: "pb-pf-section" },
          h("h2", { class: "pb-pf-section-title", text: section.title.replace(/\s*\(.*\)\s*$/, "") }),
          section.stats.length ? h("div", { class: "pb-pf-tiles" }, section.stats.map(tile)) : null);
        if (section.rows.length) {
          const tbody = h("tbody");
          node.append(h("table", { class: "pb-pf-more" }, tbody));
          section.moveRows = () => section.rows.forEach((row) => changes.move(row, tbody));
        }
        view.append(node);
      }

      if (data.statuses) {
        view.append(h("section", { class: "pb-pf-section" },
          h("h2", { class: "pb-pf-section-title", text: data.statuses.label }),
          h("div", { class: "pb-pf-chips" }, data.statuses.items.map((item) => {
            const [, status, count] = item.match(/^(.*?)\s*\((\d+)\)$/) ?? [null, item, ""];
            return h("span", { class: "pb-pf-chip" }, status, count ? h("span", { class: "pb-pf-chip-count", text: Number(count).toLocaleString() }) : null);
          }))));
      }

      if (data.products?.length) {
        const max = Math.max(...data.products.map((p) => p.count), 1);
        view.append(h("section", { class: "pb-pf-section" },
          h("h2", { class: "pb-pf-section-title", text: "Activity by product" }),
          h("ol", { class: "pb-pf-bars" }, data.products.map((p) => h("li", { class: "pb-pf-bar", style: `--pb-share: ${(p.count / max) * 100}%` },
            p.link ? h("a", { href: p.link, text: p.name }) : h("span", { text: p.name }),
            h("span", { class: "pb-pf-bar-count", text: p.count.toLocaleString() }))))));
      }

      changes.insert(view, main, table);

      if (data.user) changes.move(data.user, heading);
      if (data.changeImage) changes.move(data.changeImage, avatarSlot);
      if (data.edit) changes.move(data.edit, actions);
      if (data.search) {
        changes.move(data.search, actions);
        changes.addClass(data.search, "pb-pf-search");
      }
      for (const section of data.sections) section.moveRows?.();

      if (data.other.length) {
        const extra = h("table", { class: "pb-pf-more" });
        const tbody = h("tbody");
        extra.append(tbody);
        view.append(h("section", { class: "pb-pf-section" }, h("h2", { class: "pb-pf-section-title", text: "More" }), extra));
        for (const row of data.other) changes.move(row, tbody);
      }
      if (data.footer.length) {
        const footer = h("footer", { class: "pb-pf-footer" });
        view.append(footer);
        for (const node of data.footer) changes.move(node, footer);
      }

      changes.addClass(table, "pb-hidden");
    },
  });
})();
