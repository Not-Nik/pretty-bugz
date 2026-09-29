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
  build: {
    overwriteDest: true,
  },
};
