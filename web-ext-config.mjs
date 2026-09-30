// Only the extension itself goes into the published package.
export default {
  ignoreFiles: [
    "AGENTS.md",
    "README.md",
    "package.json",
    "package-lock.json",
    "web-ext-config.mjs",
    "node_modules",
    "store",
    "test",
    "tools",
  ],
  // An .xpi installs by opening or dropping it into Firefox, and AMO accepts it for upload too.
  build: {
    filename: "pretty-bugz-{version}.xpi",
    overwriteDest: true,
  },
};
