"use strict";

// Shared across content scripts through the extension's content-script global.
globalThis.PrettyBugz = (() => {
  const layouts = [];

  function h(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === false || value == null) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : value);
    }
    node.append(...children.flat().filter((c) => c != null));
    return node;
  }

  // Records every DOM change a layout makes so it can be reverted when the user turns layouts off.
  class Changes {
    #undos = [];

    move(node, parent, before = null) {
      if (!node?.parentNode) return node;
      const marker = document.createComment("pretty-bugz");
      node.parentNode.insertBefore(marker, node);
      parent.insertBefore(node, before);
      this.#undos.push(() => marker.replaceWith(node));
      return node;
    }

    insert(node, parent, before = null) {
      parent.insertBefore(node, before);
      this.#undos.push(() => node.remove());
      return node;
    }

    wrap(nodes, wrapper) {
      const [first] = nodes;
      this.insert(wrapper, first.parentNode, first);
      for (const node of nodes) this.move(node, wrapper);
      return wrapper;
    }

    addClass(node, ...classes) {
      const hadAttribute = node.hasAttribute("class");
      const added = classes.filter((c) => !node.classList.contains(c));
      node.classList.add(...added);
      this.#undos.push(() => {
        node.classList.remove(...added);
        if (!hadAttribute && !node.classList.length) node.removeAttribute("class");
      });
    }

    listen(target, type, handler, options) {
      target.addEventListener(type, handler, options);
      this.#undos.push(() => target.removeEventListener(type, handler, options));
    }

    observe(target, callback, options) {
      const observer = new MutationObserver(callback);
      observer.observe(target, options);
      this.#undos.push(() => observer.disconnect());
    }

    defer(fn) {
      this.#undos.push(fn);
    }

    undo() {
      while (this.#undos.length) {
        try {
          this.#undos.pop()();
        } catch (error) {
          console.error("Pretty Bugz: failed to undo layout change", error);
        }
      }
    }
  }

  function register(layout) {
    layouts.push(layout);
  }

  return { h, Changes, register, layouts };
})();
