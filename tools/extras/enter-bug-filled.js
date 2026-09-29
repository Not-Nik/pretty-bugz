window.addEventListener("load", () => {
  const form = document.getElementById("changeform");
  form.short_desc.value = "Tabs crash when dragging between windows";
  form.component.selectedIndex = 5;
  document.getElementById("v1_bug_type").checked = true;
  form.comment.value = "Steps to reproduce:\n1. Open two windows\n2. Drag a tab from one to the other\n\nActual results:\nThe tab crashes.\n\nExpected results:\nThe tab moves.";
  form.dispatchEvent(new Event("change"));
});
