// Applies each matching layout, exercises its controls, undoes it and compares the whole document.
window.addEventListener("load", () => {
  // BMO's own scripts may update the site header (e.g. aria-expanded) at any time; no layout touches it.
  const snapshot = () => document.documentElement.outerHTML.replace(document.getElementById("header")?.outerHTML ?? "", "");
  const key = (target, k) => target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

  // Interact the way a user would, so state changes made after apply() are covered too.
  function exercise() {
    for (const input of document.querySelectorAll("input.pb-filter")) {
      input.value = "a";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    for (const k of ["j", "j", "k"]) key(document.body, k);
    for (const button of document.querySelectorAll("button[aria-pressed]:is([class^='pb-'], [class*=' pb-'])")) button.click();
  }

  const before = snapshot();
  const out = [];
  for (const l of PrettyBugz.layouts) {
    if (!l.match()) continue;
    const c = new PrettyBugz.Changes();
    l.apply(c);
    const mid = snapshot();
    exercise();
    c.undo();
    const after = snapshot();
    let i = 0;
    while (i < before.length && before[i] === after[i]) i++;
    out.push(`${l.name}: changed=${mid !== before} restored=${after === before}` + (after === before ? "" : `\n  first diff near: ${JSON.stringify(before.slice(Math.max(0, i - 80), i + 80))}\n  vs: ${JSON.stringify(after.slice(Math.max(0, i - 80), i + 80))}`));
  }
  const d = document.createElement("pre");
  d.id = "pb-undo-result";
  d.style.cssText = "position:relative;z-index:99999;margin:80px 0 0;background:yellow;color:black;font:14px monospace;white-space:pre-wrap";
  d.textContent = out.join("\n") || "no layouts matched";
  document.body.prepend(d);
});
