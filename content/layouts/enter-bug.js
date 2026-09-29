"use strict";

// enter_bug.cgi (BugModal create form) as a step-by-step wizard: one slide per step,
// a clickable stepper, Back/Next in a sticky bar, and a review slide before submitting.
(() => {
  const { h, register } = globalThis.PrettyBugz;

  const byId = (id) => document.getElementById(id);
  const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "url", "number", "date", "datetime-local"]);

  function value(form, name) {
    const control = form.elements[name];
    if (!control) return "";
    if (control instanceof HTMLSelectElement && control.multiple) {
      return [...control.selectedOptions].map((o) => o.text.trim()).join(", ");
    }
    if (control instanceof HTMLSelectElement) {
      return control.selectedIndex >= 0 ? control.options[control.selectedIndex].text.trim() : "";
    }
    return String(control.value ?? "").trim();
  }

  function isRequired(form, name) {
    if (name === "bug_type") return byId("bug_type")?.getAttribute("aria-required") === "true";
    return ["short_desc", "component", "version"].includes(name);
  }

  function defineSteps(form) {
    const summaryModule = byId("summary-container")?.closest("section.module");
    const categories = byId("module-categories");
    const addComment = byId("add-comment");
    const attachment = byId("module-attachment");
    const security = byId("module-security");
    const advanced = !!byId("toggle-advanced");

    const claimed = new Set([summaryModule, categories, attachment, security].filter(Boolean));
    const extras = [...form.querySelectorAll(":scope > section.module")].filter((m) => !claimed.has(m));
    const visibleExtras = extras.filter((m) => advanced || !m.classList.contains("expert_fields"));

    return [
      {
        id: "summary",
        label: "Summary",
        title: "What’s the problem?",
        hint: "Sum it up in one line. Possible duplicates show up below as you type.",
        nodes: [summaryModule],
        fields: ["short_desc"],
        compact: true,
      },
      {
        id: "category",
        label: "Category",
        title: "Where does it belong?",
        hint: "Pick the component that best matches, then the version and type.",
        nodes: [categories],
        fields: ["component", "version", "bug_type"],
        compact: true,
      },
      {
        id: "description",
        label: "Description",
        title: "Tell us more",
        hint: "What did you do, what happened, and what did you expect instead?",
        nodes: [addComment],
        fields: ["comment"],
        wrap: true,
      },
      {
        id: "attachments",
        label: "Attachments",
        title: "Attachments & security",
        hint: "Add a screenshot, log or test case, and flag security-sensitive problems.",
        nodes: [attachment, security],
        fields: [],
      },
      visibleExtras.length && {
        id: "details",
        label: "Details",
        title: "Optional details",
        hint: "Everything here can stay as it is — triagers usually fill these in.",
        nodes: extras,
        fields: [],
        optional: true,
      },
      {
        id: "review",
        label: "Review",
        title: "Review & submit",
        hint: "Check everything looks right. Click any section to change it.",
        nodes: [],
        fields: [],
        review: true,
      },
    ].filter((step) => step && (step.review || step.nodes.some(Boolean)));
  }

  function reviewRows(form) {
    const file = form.elements.data?.files?.[0];
    const security = [...(byId("module-security")?.querySelectorAll('input[type="checkbox"]:checked') ?? [])]
      .map((box) => box.closest("label, div")?.textContent.trim() || box.name);
    const platform = [value(form, "rep_platform"), value(form, "op_sys")].filter(Boolean).join(" / ");

    return [
      { step: "summary", label: "Summary", text: value(form, "short_desc"), required: true },
      { step: "category", label: "Product", text: [value(form, "product"), value(form, "component")].filter(Boolean).join(" › "), required: true },
      { step: "category", label: "Type", text: value(form, "bug_type"), required: isRequired(form, "bug_type") },
      { step: "category", label: "Version", text: value(form, "version"), required: true },
      form.elements.rep_platform && { step: "category", label: "Platform", text: platform },
      form.elements.bug_severity && { step: "category", label: "Severity", text: value(form, "bug_severity") },
      { step: "description", label: "Description", text: value(form, "comment"), long: true, empty: "No description yet" },
      { step: "attachments", label: "Attachment", text: file ? `${file.name}${value(form, "description") ? ` — ${value(form, "description")}` : ""}` : "", empty: "None" },
      byId("module-security") && { step: "attachments", label: "Visibility", text: security.length ? security.join("; ") : "Public", },
    ].filter(Boolean);
  }

  function buildWizard(form, changes) {
    const steps = defineSteps(form);
    const firstNode = steps.flatMap((s) => s.nodes).find(Boolean);
    if (!firstNode) return;

    let current = 0;
    const visited = new Set([0]);

    const stepper = h("ol", { class: "pb-stepper", "aria-label": "Steps" });
    const slides = h("div", { class: "pb-slides" });
    const wizard = h("div", { class: "pb-wizard" }, h("nav", { class: "pb-stepper-nav" }, stepper), slides);
    changes.insert(wizard, firstNode.parentNode, firstNode);

    for (const [index, step] of steps.entries()) {
      step.button = h(
        "button",
        { type: "button", class: "pb-step", "data-step": step.id, onclick: () => go(index) },
        h("span", { class: "pb-step-num", text: String(index + 1) }),
        h("span", { class: "pb-step-label", text: step.label }),
      );
      stepper.append(h("li", {}, step.button));

      step.body = h("div", { class: "pb-slide-body" });
      step.slide = h(
        "section",
        { class: `pb-slide${step.compact ? " pb-compact" : ""}`, "data-step": step.id, "aria-labelledby": `pb-slide-${step.id}-title` },
        h(
          "header",
          { class: "pb-slide-header" },
          h("span", { class: "pb-slide-kicker", text: `Step ${index + 1} of ${steps.length}${step.optional ? " · optional" : ""}` }),
          h("h2", { class: "pb-slide-title", id: `pb-slide-${step.id}-title`, text: step.title }),
          h("p", { class: "pb-slide-hint", text: step.hint }),
        ),
        step.body,
      );
      slides.append(step.slide);

      let target = step.body;
      if (step.wrap) {
        target = h("div", { class: "pb-module-body" });
        step.body.append(h("div", { class: "pb-module" }, target));
      }
      for (const node of step.nodes) {
        if (node) changes.move(node, target);
      }
    }

    const reviewStep = steps.find((s) => s.review);
    const reviewList = h("dl", { class: "pb-review" });
    reviewStep.body.append(h("div", { class: "pb-module" }, h("div", { class: "pb-module-body" }, reviewList)));

    const backButton = h("button", { type: "button", class: "secondary pb-back", text: "← Back", onclick: () => go(current - 1) });
    const nextButton = h("button", { type: "button", class: "pb-next", onclick: () => next() });
    const position = h("span", { class: "pb-position" });
    const end = h("div", { class: "pb-actionbar-end" }, nextButton);
    const bar = h(
      "div",
      { class: "pb-actionbar pb-wizard-bar", role: "toolbar", "aria-label": "Bug form navigation" },
      h("div", { class: "pb-actionbar-start" }, backButton, position),
      end,
    );
    changes.insert(bar, form);

    const commit = byId("commit");
    if (commit) changes.move(commit, end);
    const makeTemplate = byId("make-template");
    if (makeTemplate) changes.move(makeTemplate, reviewStep.body);

    if (byId("toggle-advanced")) changes.addClass(form, "show-advanced-fields");

    const missing = (step) => step.fields.filter((name) => isRequired(form, name) && !value(form, name));
    const complete = (step, index) => {
      if (step.review) return false;
      if (!step.fields.length) return visited.has(index);
      return missing(step).length === 0 && (step.id !== "description" || !!value(form, "comment"));
    };

    function renderReview() {
      reviewList.replaceChildren(
        ...reviewRows(form).flatMap((row) => {
          const missingValue = !row.text;
          const index = steps.findIndex((s) => s.id === row.step);
          return [
            h("dt", {}, h("button", { type: "button", class: "pb-review-edit", text: row.label, title: `Edit ${row.label.toLowerCase()}`, onclick: () => go(index) })),
            h(
              "dd",
              { class: [row.long && "pb-review-long", missingValue && (row.required ? "pb-review-missing" : "pb-review-empty")].filter(Boolean).join(" ") },
              missingValue ? (row.required ? "Required" : row.empty ?? "—") : row.long && row.text.length > 700 ? `${row.text.slice(0, 700)}…` : row.text,
            ),
          ];
        }),
      );
    }

    function render() {
      for (const [index, step] of steps.entries()) {
        const active = index === current;
        step.slide.classList.toggle("pb-active", active);
        step.button.classList.toggle("pb-current", active);
        step.button.classList.toggle("pb-done", !active && complete(step, index));
        step.button.classList.toggle("pb-invalid", !active && visited.has(index) && missing(step).length > 0);
        if (active) step.button.setAttribute("aria-current", "step");
        else step.button.removeAttribute("aria-current");
      }
      const last = current === steps.length - 1;
      backButton.disabled = current === 0;
      position.textContent = `Step ${current + 1} of ${steps.length}`;
      nextButton.hidden = last;
      nextButton.textContent = `${steps[current + 1]?.optional ? "Continue" : "Next"}: ${steps[current + 1]?.label ?? ""} →`;
      wizard.dataset.step = steps[current].id;
      bar.classList.toggle("pb-final", last);
      if (steps[current].review) renderReview();
    }

    function go(index, { focus = true } = {}) {
      if (index < 0 || index >= steps.length || index === current) return;
      wizard.dataset.direction = index > current ? "forward" : "back";
      current = index;
      visited.add(index);
      render();
      const top = wizard.getBoundingClientRect().top;
      if (top < 0) window.scrollBy({ top: top - 80, behavior: "smooth" });
      if (focus) {
        const first = steps[index].slide.querySelector(
          "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [role=radiogroup]",
        );
        first?.focus({ preventScroll: true });
      }
    }

    function next() {
      const [name] = missing(steps[current]);
      if (name) {
        const control = form.elements[name];
        const target = control instanceof RadioNodeList ? byId(name) : control;
        target?.focus();
        target?.closest(".field")?.classList.add("pb-attention");
        setTimeout(() => target?.closest(".field")?.classList.remove("pb-attention"), 900);
        return;
      }
      go(current + 1);
    }

    const stepOf = (node) => steps.findIndex((s) => s.slide.contains(node));

    // BMO focuses the first invalid field on submit; follow it to its slide.
    changes.listen(form, "focusin", (event) => {
      const index = stepOf(event.target);
      if (index >= 0 && index !== current) go(index, { focus: false });
    });
    changes.listen(form, "invalid", (event) => {
      const index = stepOf(event.target);
      if (index >= 0) go(index, { focus: false });
    }, true);

    // Enter in a one-line field should advance, not submit the half-filled form.
    changes.listen(form, "keydown", (event) => {
      const target = event.target;
      if (event.key !== "Enter" || event.defaultPrevented || event.isComposing) return;
      if (!(target instanceof HTMLInputElement) || !TEXT_INPUT_TYPES.has(target.type)) return;
      if (current === steps.length - 1) return;
      event.preventDefault();
      next();
    });

    changes.listen(form, "input", render);
    changes.listen(form, "change", render);
    render();
  }

  register({
    name: "enter-bug",

    match() {
      return !!document.querySelector("form#changeform.enter_bug_form");
    },

    apply(changes) {
      changes.addClass(document.body, "pb-enter-bug");
      buildWizard(byId("changeform"), changes);
    },
  });
})();
