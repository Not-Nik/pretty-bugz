"use strict";

// show_bug.cgi (BugModal) as a workspace: toolbar and summary become a sticky bar, the metadata
// modules a right-hand rail, and the description, attachments and comments the main column.
// The rail comes first in the DOM, so Tab still runs fields → comments → composer → Save.
(() => {
  const { h, register } = globalThis.PrettyBugz;

  const $ = (selector, root = document) => root.querySelector(selector);

  const MAIN_MODULES = new Set(["module-user-story", "module-attachments"]);

  function isShown(node) {
    return !!node && !/display:\s*none/.test(node.getAttribute("style") ?? "");
  }

  register({
    name: "bug",

    match() {
      const summary = document.getElementById("summary-container");
      const toolbar = document.getElementById("page-toolbar");
      return location.pathname.endsWith("/show_bug.cgi") && !!summary && !!toolbar
        && toolbar.parentElement === summary.closest("section.module")?.parentElement;
    },

    apply(changes) {
      const summaryModule = $("#summary-container").closest("section.module");
      const container = summaryModule.parentElement;
      const toolbar = $("#page-toolbar");
      changes.addClass(document.body, "pb-bug");

      const sentinel = h("div", { class: "pb-bug-sentinel", "aria-hidden": "true" });
      const bar = h("div", { class: "pb-bug-bar" });
      changes.insert(sentinel, container, toolbar);
      changes.insert(bar, container, toolbar);
      for (const node of [toolbar, $("#io-error"), summaryModule]) {
        if (node?.parentElement === container) changes.move(node, bar);
      }

      const rail = h("aside", { class: "pb-bug-rail", "aria-label": "Bug details" });
      const main = h("div", { class: "pb-bug-main" });
      const layout = h("div", { class: "pb-bug-layout" }, rail, main);
      changes.insert(layout, container, bar.nextSibling);

      // Scripts have already run and hidden inputs don't render; everything else keeps its order.
      for (const node of [...container.children]) {
        if (node === sentinel || node === bar || node === layout) continue;
        if (node.matches("script, style, template, dialog, input[type=hidden]")) continue;
        if (node.matches("section.module") && !MAIN_MODULES.has(node.id)) changes.move(node, rail);
        else changes.move(node, main);
      }

      // A shortcut to the comment box, which sits at the end of a possibly very long page.
      const comment = document.getElementById("comment");
      const buttons = $(":scope > .buttons", toolbar);
      if (comment && buttons) {
        const jump = h("button", { type: "button", class: "secondary pb-bug-comment-btn", text: "Comment" });
        jump.addEventListener("click", () => {
          comment.scrollIntoView({ block: "center" });
          comment.focus({ preventScroll: true });
        });
        changes.insert(jump, buttons, buttons.firstChild);
      }

      // Compact the bar once it's stuck under the site header.
      const header = document.getElementById("header")?.offsetHeight ?? 56;
      const stuck = new IntersectionObserver(([entry]) => {
        bar.classList.toggle("pb-bug-stuck", !entry.isIntersecting);
      }, { rootMargin: `-${header}px 0px 0px 0px` });
      stuck.observe(sentinel);
      changes.defer(() => stuck.disconnect());

      // Edit mode reveals inputs and autocomplete popups; the bar and rail stop sticking then.
      const commit = document.getElementById("commit-btn");
      const syncEditing = () => {
        const editing = isShown(commit);
        bar.classList.toggle("pb-bug-editing", editing);
        layout.classList.toggle("pb-bug-editing", editing);
      };
      if (commit) {
        changes.observe(commit, syncEditing, { attributes: true, attributeFilter: ["style"] });
        syncEditing();
      }

      // The rail only sticks when it fits below the bar; a scrolling rail would clip BMO's popups.
      const fit = () => {
        layout.style.setProperty("--pb-bug-bar-height", `${bar.offsetHeight}px`);
        const available = window.innerHeight - header - bar.offsetHeight - 32;
        layout.classList.toggle("pb-bug-rail-fits", rail.offsetHeight <= available);
      };
      const resize = new ResizeObserver(fit);
      resize.observe(rail);
      resize.observe(bar);
      changes.listen(window, "resize", fit);
      changes.defer(() => resize.disconnect());
      fit();
    },
  });
})();
