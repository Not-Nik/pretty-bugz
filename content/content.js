"use strict";

(() => {
  const { Changes, layouts } = globalThis.PrettyBugz;
  const DEFAULTS = { enabled: true, theme: "auto", layouts: true };
  const root = document.documentElement;

  let settings = DEFAULTS;
  let activeChanges = null;

  function applyTheme({ enabled, theme }) {
    root.classList.toggle("pb-on", enabled);
    if (enabled && theme !== "auto") {
      root.dataset.pbTheme = theme;
    } else {
      delete root.dataset.pbTheme;
    }
  }

  function applyLayouts(on) {
    root.classList.toggle("pb-layout", on);
    if (document.readyState === "loading") return;

    if (on && !activeChanges) {
      activeChanges = new Changes();
      for (const layout of layouts) {
        try {
          if (layout.match()) layout.apply(activeChanges);
        } catch (error) {
          console.error(`Pretty Bugz: layout "${layout.name}" failed`, error);
        }
      }
    } else if (!on && activeChanges) {
      activeChanges.undo();
      activeChanges = null;
    }
  }

  function update(next) {
    settings = { ...DEFAULTS, ...next };
    applyTheme(settings);
    applyLayouts(settings.enabled && settings.layouts);
  }

  // Apply defaults synchronously so the page doesn't flash the stock skin while storage loads.
  applyTheme(DEFAULTS);

  const loaded = browser.storage.local.get(DEFAULTS).then(update);

  document.addEventListener("DOMContentLoaded", () => {
    loaded.then(() => applyLayouts(settings.enabled && settings.layouts));
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    browser.storage.local.get(DEFAULTS).then(update);
  });
})();
