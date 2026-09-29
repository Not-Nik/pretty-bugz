window.addEventListener("load", () => {
  const main = document.getElementById("main-inner") || document.body;
  const before = main.innerHTML;
  const out = [];
  for (const l of PrettyBugz.layouts) {
    if (!l.match()) continue;
    const c = new PrettyBugz.Changes();
    l.apply(c);
    const mid = main.innerHTML;
    c.undo();
    const after = main.innerHTML;
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
