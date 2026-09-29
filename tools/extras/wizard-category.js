window.addEventListener("load", () => {
  const f = document.getElementById("changeform");
  f.short_desc.value = "Tabs crash when dragging between windows";
  f.short_desc.dispatchEvent(new Event("input", { bubbles: true }));
  f.component.selectedIndex = 5;
  document.getElementById("v1_bug_type").checked = true;
  f.dispatchEvent(new Event("change"));
  document.querySelector(".pb-step[data-step=category]").click();
});
