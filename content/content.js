"use strict";

(() => {
  const { Changes, layouts } = globalThis.PrettyBugz;
  const DEFAULTS = { enabled: true, theme: "auto", layouts: true };
  const root = document.documentElement;
  const CACHE_KEY = "pretty-bugz-settings";

  // storage.local is async; a synchronous copy in the page's localStorage avoids a flash of the wrong theme.
  function readCache() {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") };
    } catch {
      return DEFAULTS;
    }
  }

  function writeCache(value) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(value));
    } catch {
      // Storage can be disabled or full; the cache is only an optimisation.
    }
  }

  let settings = readCache();
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
    writeCache(settings);
    applyTheme(settings);
    applyLayouts(settings.enabled && settings.layouts);
  }

  applyTheme(settings);
  root.classList.toggle("pb-layout", settings.enabled && settings.layouts);

  const loaded = browser.storage.local.get(DEFAULTS).then(update, (error) => {
    console.error("Pretty Bugz: couldn't read settings", error);
  });

  document.addEventListener("DOMContentLoaded", () => {
    loaded.then(() => applyLayouts(settings.enabled && settings.layouts));
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    browser.storage.local.get(DEFAULTS).then(update);
  });
})();
