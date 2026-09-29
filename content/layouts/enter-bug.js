"use strict";

// enter_bug.cgi (BugModal create form) as one page: the essential sections first, optional
// modules under "More fields", and a sticky rail with a section checklist, a live summary and
// Submit. Nothing is hidden, so BMO's own validation and focus handling keep working.
(() => {
  const { h, register } = globalThis.PrettyBugz;

  const byId = (id) => document.getElementById(id);
  const clean = (text) => text.replace(/\s+/g, " ").trim();

  // Mirrors BMO's required-field check in bug_modal.js (`.save-btn` click handler).
  function isMissing(form, control) {
    if (control.matches(".buttons.toggle")) return !form.elements[control.id]?.value;
    if (control instanceof HTMLSelectElement) return control.selectedIndex === -1;
    if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) return !control.value.trim();
    return false;
  }

  function selectedText(form, name) {
    const control = form.elements[name];
    if (!control) return "";
    if (control instanceof HTMLSelectElement) {
      return control.selectedIndex >= 0 ? clean(control.options[control.selectedIndex].text) : "";
    }
    return clean(String(control.value ?? ""));
  }

  // Advanced fields BMO hides (e.g. Severity) shouldn't appear in the summary.
  function isShown(form, name) {
    const control = form.elements[name];
    const node = control instanceof RadioNodeList ? control[0] : control;
    return !!node && (node.type === "hidden" || node.closest(".field, .module")?.getClientRects().length > 0);
  }

  function descriptionTemplate(form) {
    try {
      const templates = JSON.parse(form.dataset.descriptionTemplates ?? "[]");
      const index = form.component?.type === "hidden" ? 0 : form.component?.selectedIndex ?? -1;
      return templates[index] ?? "";
    } catch {
      return "";
    }
  }

  function descriptionWritten(form) {
    const text = form.comment?.value ?? "";
    return /\S/.test(text) && text.trim() !== descriptionTemplate(form).trim();
  }

  function attachmentError(section) {
    const message = section?.querySelector("#att-error-message");
    return !!section?.querySelector('[aria-invalid="true"]') || (!!message && !message.hidden && !!clean(message.textContent));
  }

  function section(id, title, hint, body) {
    return h(
      "section",
      { class: "pb-module pb-create-section", id, "aria-labelledby": `${id}-title` },
      h("header", { class: "pb-module-header" },
        h("h2", { class: "pb-module-title", id: `${id}-title`, text: title }),
        hint ? h("span", { class: "pb-module-hint", text: hint }) : null),
      body,
    );
  }

  function buildLayout(form, changes) {
    const toolbar = byId("page-toolbar");
    const summary = byId("summary-container")?.closest("section.module");
    const categories = byId("module-categories");
    const attachment = byId("module-attachment");
    const security = byId("module-security");
    const addComment = byId("add-comment");
    if (!summary || !categories || !addComment) return null;

    const main = h("div", { class: "pb-create-main" });
    const rail = h("aside", { class: "pb-create-rail", "aria-label": "New bug progress" });
    const layout = h("div", { class: "pb-create" }, main, rail);
    changes.insert(layout, form, toolbar?.nextSibling ?? summary);

    // Anything BMO or its extensions put above the first module (notices, custom-form hints) stays on top.
    const children = [...form.children].filter((node) => node !== layout && node !== toolbar);
    const summaryIndex = children.indexOf(summary);
    const isContent = (node) => !node.matches("script, style, input[type=hidden], #new-comment-actions, #bottom-actions, #add-comment");
    for (const node of children.slice(0, Math.max(summaryIndex, 0)).filter(isContent)) {
      if (node.compareDocumentPosition(layout) & Node.DOCUMENT_POSITION_PRECEDING) changes.move(node, main);
    }

    const descriptionBody = h("div", { class: "pb-module-body" });
    const description = section("pb-create-description", "Description", "What you did, what happened, and what you expected instead", descriptionBody);

    const primary = [
      { id: "summary", label: "Summary", node: summary },
      { id: "category", label: "Category", node: categories },
      { id: "description", label: "Description", node: description, recommended: true },
      attachment && { id: "attachment", label: "Attachment", node: attachment, optional: true },
      security && { id: "security", label: "Security", node: security, optional: true },
    ].filter(Boolean);

    for (const item of primary) {
      if (item.node === description) main.append(description);
      else changes.move(item.node, main);
    }
    changes.move(addComment, descriptionBody);

    const claimed = new Set(primary.map((item) => item.node));
    const extras = children.slice(summaryIndex + 1).filter((node) => isContent(node) && !claimed.has(node));
    const moreBody = h("div", { class: "pb-create-more-body" });
    const moreHeader = h("header", { class: "pb-create-more-header" },
      h("div", {},
        h("h2", { id: "pb-create-more-title", text: "More fields" }),
        h("p", { text: "Status, people, references, flags and other details. Everything here is optional." })));
    const more = h("section", { class: "pb-create-more", id: "pb-create-more", "aria-labelledby": "pb-create-more-title" }, moreHeader, moreBody);
    main.append(more);
    const toggle = byId("toggle-advanced");
    if (toggle) changes.move(toggle, moreHeader);
    for (const node of extras) changes.move(node, moreBody);

    return { main, rail, more, sections: [...primary, { id: "more", label: "More fields", node: more, optional: true }] };
  }

  function buildRail(form, rail, sections, changes) {
    const product = selectedText(form, "product") || form.querySelector('input[name="product"]')?.value || "";

    const checklist = h("ol", { class: "pb-create-checklist" });
    for (const item of sections) {
      item.status = h("span", { class: "pb-create-status", "aria-hidden": "true" });
      item.note = h("span", { class: "pb-create-note" });
      item.button = h("button", { type: "button", class: "pb-create-step" }, item.status, h("span", { class: "pb-create-label", text: item.label }), item.note);
      item.button.addEventListener("click", () => {
        item.node.scrollIntoView({ behavior: "smooth", block: "start" });
        const first = item.node.querySelector("input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [role=radiogroup]");
        first?.focus({ preventScroll: true });
      });
      checklist.append(h("li", {}, item.button));
    }

    const progress = h("p", { class: "pb-create-progress", "aria-live": "polite" });
    const facts = h("dl", { class: "pb-create-facts" });
    const actions = h("div", { class: "pb-create-actions" });

    rail.append(
      h("div", { class: "pb-create-card" },
        h("p", { class: "pb-create-kicker", text: "New bug" }),
        h("h2", { class: "pb-create-product", text: product }),
        checklist,
        progress,
        facts,
        actions),
    );

    // #commit stays the first submit button in the form, so Enter in a text field still files the bug.
    const commit = byId("commit");
    const template = byId("make-template");
    if (commit) changes.move(commit, actions);
    if (template) changes.move(template, actions);

    return { progress, facts };
  }

  function wire(form, layout, rail, changes) {
    const { sections } = layout;
    const { progress, facts } = rail;
    let attempted = false;

    const requiredIn = (node) => [...node.querySelectorAll('[aria-required="true"]')].filter((control) => !control.closest("[hidden], .bz_default_hidden"));

    function render() {
      let missingTotal = 0;
      for (const item of sections) {
        const required = requiredIn(item.node);
        const missing = required.filter((control) => isMissing(form, control));
        const invalid = attempted && (missing.length > 0 || (item.id === "attachment" && attachmentError(item.node)));
        missingTotal += missing.length;

        let state = "optional";
        let note = "Optional";
        if (item.recommended) {
          const written = descriptionWritten(form);
          state = written ? "done" : "todo";
          note = written ? "" : "Recommended";
        } else if (required.length) {
          state = missing.length ? "todo" : "done";
          note = missing.length ? `${missing.length} required` : "";
        }
        if (invalid) state = "invalid";
        item.button.dataset.state = state;
        item.note.textContent = note;
      }

      progress.textContent = missingTotal
        ? `${missingTotal} required ${missingTotal === 1 ? "field" : "fields"} left`
        : "Ready to submit";
      progress.dataset.state = missingTotal ? "todo" : "done";

      const rows = [
        ["component", "Component"],
        ["bug_type", "Type"],
        ["version", "Version"],
        ["bug_severity", "Severity"],
      ].map(([name, label]) => [name, selectedText(form, name), label]).filter(([name, value]) => value && value !== "--" && value !== "---" && isShown(form, name));
      facts.replaceChildren(...rows.flatMap(([, value, label]) => [h("dt", { text: label }), h("dd", { text: value })]));
    }

    changes.listen(form, "input", render);
    changes.listen(form, "change", render);

    // BMO validates on click and scrolls to missing fields itself; afterwards we only mark the
    // checklist and surface attachment errors, which BMO shows without moving focus.
    const commit = byId("commit");
    if (commit) {
      changes.listen(commit, "click", () => {
        attempted = true;
        setTimeout(() => {
          render();
          const attachment = sections.find((item) => item.id === "attachment");
          const missing = sections.some((item) => requiredIn(item.node).some((control) => isMissing(form, control)));
          if (!missing && attachment && attachmentError(attachment.node)) {
            attachment.node.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });
      });
    }

    // Component changes rewrite the description template and other fields from BMO's handler.
    changes.observe(form, render, { attributes: true, attributeFilter: ["aria-invalid", "hidden", "class"], subtree: true });

    const visible = new Map();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) visible.set(entry.target, entry.intersectionRatio);
      const current = sections.find((item) => (visible.get(item.node) ?? 0) > 0);
      for (const item of sections) {
        if (item === current) item.button.setAttribute("aria-current", "true");
        else item.button.removeAttribute("aria-current");
      }
    }, { rootMargin: "-120px 0px -55% 0px", threshold: [0, 0.01] });
    for (const item of sections) observer.observe(item.node);
    changes.defer(() => observer.disconnect());

    render();
  }

  register({
    name: "enter-bug",

    match() {
      return !!document.querySelector("form#changeform.enter_bug_form");
    },

    apply(changes) {
      const form = byId("changeform");
      const layout = buildLayout(form, changes);
      if (!layout) return;
      changes.addClass(document.body, "pb-enter-bug");
      wire(form, layout, buildRail(form, layout.rail, layout.sections, changes), changes);
    },
  });
})();
