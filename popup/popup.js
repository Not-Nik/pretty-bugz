"use strict";

const DEFAULTS = { enabled: true, theme: "auto", layouts: true };

const enabledInput = document.getElementById("enabled");
const layoutsInput = document.getElementById("layouts");
const dependent = document.getElementById("dependent");
const themeInputs = document.querySelectorAll('input[name="theme"]');

function render({ enabled, theme, layouts }) {
  enabledInput.checked = enabled;
  layoutsInput.checked = layouts;
  dependent.disabled = !enabled;
  for (const input of themeInputs) {
    input.checked = input.value === theme;
  }
}

browser.storage.local.get(DEFAULTS).then(render);

enabledInput.addEventListener("change", () => {
  dependent.disabled = !enabledInput.checked;
  browser.storage.local.set({ enabled: enabledInput.checked });
});

layoutsInput.addEventListener("change", () => {
  browser.storage.local.set({ layouts: layoutsInput.checked });
});

for (const input of themeInputs) {
  input.addEventListener("change", () => {
    if (input.checked) browser.storage.local.set({ theme: input.value });
  });
}
